import type { ProtocolGraph } from './graph.js';
import type {
  ProtocolEdge,
  Route,
  RouteStep,
  ScoredEdge,
  StrategyRequest,
} from './types.js';

// ─── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Score an edge given the request context.
 * score = (projected_yield_usd × timeHorizonDays/365) − (gas + bridge_fee + slippage_usd)
 */
function scoreEdge(
  edge: ProtocolEdge,
  apyBps: number,
  amountUsd: number,
  timeHorizonDays: number,
): number {
  const projectedYieldUsd =
    (amountUsd * apyBps * timeHorizonDays) / (10_000 * 365);
  const totalCostUsd =
    edge.gasEstimateUsd +
    edge.bridgeFeeUsd +
    (amountUsd * edge.slippageBps) / 10_000;
  return projectedYieldUsd - totalCostUsd;
}

// ─── Pathfinder ────────────────────────────────────────────────────────────────

interface PathState {
  nodeId: string;
  score: number;         // cumulative score (higher = better)
  steps: RouteStep[];
  hopCount: number;
  bridgeCount: number;
  currentAmountUsd: number;
}

/**
 * Modified Dijkstra over the protocol graph, maximising score.
 * Returns the top N routes from sourceNodeId to any node on destinationChain.
 */
export function findTopRoutes(
  graph: ProtocolGraph,
  req: StrategyRequest,
  topN = 3,
): Route[] {
  const { sourceAsset, sourceChain, sourceAmountUsd, destinationChain, riskTolerance, timeHorizonDays } = req;
  const { maxHops, maxBridges, minLiquidityUsd } = { maxHops: 8, maxBridges: 3, minLiquidityUsd: 50_000 };

  // Max risk threshold per step (riskTolerance maps to max slippage we accept)
  const maxSlippageBps = riskTolerance * 100; // 1→100bps, 5→500bps

  const sourceNodeId = `${sourceAsset}_${sourceChain}_wallet`;

  // Priority queue (max-heap by score) — simple sorted array for Phase 0
  const queue: PathState[] = [
    {
      nodeId: sourceNodeId,
      score: 0,
      steps: [],
      hopCount: 0,
      bridgeCount: 0,
      currentAmountUsd: sourceAmountUsd,
    },
  ];

  const completedRoutes: Route[] = [];
  const visited = new Map<string, number>(); // nodeId → best score seen

  while (queue.length > 0 && completedRoutes.length < topN * 3) {
    // Pop highest-score state
    queue.sort((a, b) => b.score - a.score);
    const state = queue.shift()!;

    // Constraint: max hops
    if (state.hopCount >= maxHops) continue;

    // Check if we've reached destination chain — record as a completed route
    const node = graph.getNode(state.nodeId);
    if (
      node &&
      node.chain === destinationChain &&
      state.hopCount > 0 // must have at least one hop
    ) {
      completedRoutes.push(buildRoute(state, req));
      if (completedRoutes.length >= topN) break;
      continue;
    }

    // Prune: if we've visited this node with a better score, skip
    const best = visited.get(state.nodeId) ?? -Infinity;
    if (state.score < best - 0.01) continue; // 1 cent tolerance
    visited.set(state.nodeId, state.score);

    // Expand edges
    for (const edge of graph.getEdgesFrom(state.nodeId)) {
      const targetNode = graph.getNode(edge.to);
      if (!targetNode) continue;

      // Skip exploit-flagged protocols
      if (targetNode.exploitFlagged) continue;

      // Skip low-liquidity pools
      if (targetNode.tvlUsd > 0 && targetNode.tvlUsd < minLiquidityUsd) continue;

      // Skip if bridge count would exceed limit
      const newBridgeCount = state.bridgeCount + (edge.isBridge ? 1 : 0);
      if (newBridgeCount > maxBridges) continue;

      // Skip high-slippage steps beyond risk tolerance
      if (edge.slippageBps > maxSlippageBps) continue;

      const edgeScore = scoreEdge(
        edge,
        targetNode.apyBps,
        state.currentAmountUsd,
        timeHorizonDays,
      );

      const step: RouteStep = {
        stepType: edge.stepType,
        protocol: edge.protocol,
        protocolAddress: edge.protocolAddress,
        fromAsset: node?.asset ?? '',
        toAsset: targetNode.asset,
        fromChain: node?.chain ?? 0,
        toChain: targetNode.chain,
        estimatedOutput: state.currentAmountUsd, // simplified — real impl uses quote engine
        gasEstimateUsd: edge.gasEstimateUsd,
        bridgeFeeUsd: edge.bridgeFeeUsd,
        slippageBps: edge.slippageBps,
        apyBps: targetNode.apyBps,
      };

      queue.push({
        nodeId: edge.to,
        score: state.score + edgeScore,
        steps: [...state.steps, step],
        hopCount: state.hopCount + 1,
        bridgeCount: newBridgeCount,
        currentAmountUsd: state.currentAmountUsd,
      });
    }
  }

  // Sort completed routes by score descending, return top N
  completedRoutes.sort((a, b) => b.totalScore - a.totalScore);
  return completedRoutes.slice(0, topN);
}

// ─── Route Builder ─────────────────────────────────────────────────────────────

function buildRoute(state: PathState, req: StrategyRequest): Route {
  const totalGasUsd = state.steps.reduce((s, st) => s + st.gasEstimateUsd, 0);
  const totalBridgeFeeUsd = state.steps.reduce((s, st) => s + st.bridgeFeeUsd, 0);
  const totalProtocolFeeUsd = (req.sourceAmountUsd * 8) / 10_000; // 0.08% Meridian fee

  // Weighted APY: average of lend/stake steps weighted by time
  const yieldSteps = state.steps.filter((s) => s.apyBps > 0);
  const estimatedApyBps =
    yieldSteps.length > 0
      ? Math.round(yieldSteps.reduce((s, st) => s + st.apyBps, 0) / yieldSteps.length)
      : 0;

  // Estimated time: 30s per on-chain step + bridge time
  const bridgeSteps = state.steps.filter((s) => s.stepType === 'BRIDGE');
  const estimatedTimeSeconds =
    state.steps.length * 30 + bridgeSteps.length * 120;

  // Composite risk: 0–100 based on hop count, bridge count, max slippage
  const riskScore = Math.min(
    100,
    state.hopCount * 5 +
      state.bridgeCount * 15 +
      Math.max(...state.steps.map((s) => s.slippageBps), 0) / 10,
  );

  return {
    steps: state.steps,
    totalScore: state.score,
    estimatedApyBps,
    totalGasUsd,
    totalBridgeFeeUsd,
    totalProtocolFeeUsd,
    estimatedTimeSeconds,
    hopCount: state.hopCount,
    bridgeCount: state.bridgeCount,
    riskScore,
  };
}
