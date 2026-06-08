/**
 * Relayer Manager — Phase 1.
 *
 * Responsibilities:
 *   1. Subscribe to Router events on each configured chain via viem WebSocket.
 *   2. On StrategyStarted → create a monitoring job.
 *   3. On bridge step completion → call continueStrategy() from relayer wallet.
 *   4. On repeated bridge failure → attempt fallback bridge and retry.
 *   5. Monitor relayer wallet balances; warn if below threshold.
 *   6. Broadcast all status changes to registered WebSocket listeners.
 *
 * Graceful degradation: if no RPC URLs are configured, event listeners are
 * skipped and the Phase 0 polling loop takes over (dev mode).
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatEther,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Chain,
} from 'viem';
import { rpcTransport } from '../rpc-transport/index.js';
import { emitWebhookEvent } from '../webhooks/index.js';
import { mainnet, sepolia, arbitrum, base, baseSepolia, bsc, polygon, optimism, avalanche, scroll, zkSync } from 'viem/chains';
import { getCachedRelayerAccount, signerDescription } from '../kms-signer/index.js';
import { monitoring } from '../monitoring/index.js';
import { relayer as relayerMetrics, anomaly } from '../metrics/index.js';
import { nonceManager } from '../nonce-manager/index.js';
import { config } from '../../config/index.js';

// ─── ABI fragments ────────────────────────────────────────────────────────────

const ROUTER_ABI = parseAbi([
  'event StrategyStarted(bytes32 indexed strategyId, address indexed user, uint256 amount, address sourceAsset, address destinationWallet)',
  'event StepExecuted(bytes32 indexed strategyId, uint256 stepIndex, uint8 stepType, address protocol, uint256 amountOut)',
  'event StrategyCompleted(bytes32 indexed strategyId, address indexed destination, address asset, uint256 finalAmount)',
  'event StrategyFailed(bytes32 indexed strategyId, uint256 failedStep, string reason)',
  'event EmergencyExitTriggered(bytes32 indexed strategyId, address indexed source, uint256 amountReturned)',
  'function continueStrategy(bytes32 strategyId, uint256 stepIndex, (uint8 stepType, address protocol, bytes params, uint256 minOutput, address outputAsset)[] steps, uint256 bridgedAmount) external',
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';

/** Mirrors the on-chain Step struct — required for continueStrategy ABI encoding. */
export interface OnChainStep {
  stepType: number;   // 0=SWAP 1=LEND 2=BRIDGE 3=STAKE 4=SETTLE
  protocol: Address;
  params: Hex;
  minOutput: bigint;
  outputAsset: Address;
}

export interface RelayerJob {
  id: string;
  strategyId: Hex;
  stepIndex: number;
  bridgeTxHash: string;
  sourceChain: number;
  destinationChain: number;
  status: JobStatus;
  retries: number;
  maxRetries: number;
  lastError?: string;
  /** Unix ms — when the strategy quote expires. 0 = no expiry. */
  quoteExpiresAt: number;
  /** Set to true when the quote expired and re-optimization was triggered. */
  reoptimized: boolean;
  /** Original on-chain steps — required to pass to continueStrategy after a bridge confirms. */
  steps: OnChainStep[];
  /** Amount that arrived on the destination chain post-bridge. Set from StepExecuted amountOut
   *  and overridden with actual bridge receipt amount when available. */
  bridgedAmount: bigint;
  /**
   * Job priority. Higher values are processed first.
   *   10 = Pro/API subscriber (dedicated priority)
   *    0 = free tier (default)
   */
  priority: number;
  createdAt: number;
  updatedAt: number;
}

interface ChainSetup {
  chain: Chain;
  rpcUrl: string;
  routerEnvKey: string;
}

type StatusListener = (strategyId: string, job: RelayerJob) => void;
type ReoptimizeCallback = (strategyId: string) => Promise<void>;
type EmergencyExitListener = (strategyId: string) => void;

// ─── Fallback bridge order ────────────────────────────────────────────────────
// When a bridge step fails we try the next protocol in this list.
const BRIDGE_FALLBACK_ORDER = ['stargate', 'across', 'hop', 'wormhole'] as const;

// ─── Low-balance threshold (ETH) ─────────────────────────────────────────────
const LOW_BALANCE_ETH = 0.05;

// ─── Relayer Manager ─────────────────────────────────────────────────────────

export class RelayerManager {
  private jobs = new Map<string, RelayerJob>();
  private listeners: StatusListener[] = [];
  private emergencyExitListeners: EmergencyExitListener[] = [];
  private reoptimizeCb: ReoptimizeCallback | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private balanceTimer: ReturnType<typeof setInterval> | null = null;
  private unwatchers: Array<() => void> = [];

  private publicClients  = new Map<number, PublicClient>();
  private walletClients  = new Map<number, WalletClient>();

  /** Register a callback to receive job status updates (WebSocket bridge). */
  onStatusUpdate(cb: StatusListener) {
    this.listeners.push(cb);
  }

  /** Register a callback invoked when an EmergencyExitTriggered on-chain event is received. */
  onEmergencyExit(cb: EmergencyExitListener) {
    this.emergencyExitListeners.push(cb);
  }

  /**
   * Register a callback invoked when a job's quote has expired mid-execution.
   * The callback should re-run the strategy optimizer and update the job's
   * quoteExpiresAt with the fresh expiry before returning.
   */
  onQuoteExpired(cb: ReoptimizeCallback): void {
    this.reoptimizeCb = cb;
  }

  /** Submit a new bridge monitoring job (called by the API layer after tx broadcast). */
  submitMonitorJob(
    strategyId: string,
    stepIndex: number,
    bridgeTxHash: string,
    sourceChain: number,
    destinationChain: number,
    quoteExpiresAt = 0,
    /** Priority level: 10 = Pro/API, 0 = free tier. Higher runs first. */
    priority = 0,
    steps: OnChainStep[] = [],
    bridgedAmount: bigint = 0n,
  ): RelayerJob {
    const job: RelayerJob = {
      id: `${strategyId}-${stepIndex}`,
      strategyId: strategyId as Hex,
      stepIndex,
      bridgeTxHash,
      sourceChain,
      destinationChain,
      status: 'pending',
      retries: 0,
      maxRetries: 5,
      quoteExpiresAt,
      reoptimized: false,
      priority,
      steps,
      bridgedAmount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.jobs.set(job.id, job);
    this.notify(strategyId, job);
    return job;
  }

  /** Start the relayer: set up clients, event listeners, balance monitor. */
  async start() {
    await this.initClients();
    this.subscribeToChainEvents();
    this.startBalanceMonitor();

    // Fallback polling loop — fires for jobs that weren't triggered by an event
    this.pollTimer = setInterval(() => this.processPending(), 10_000);
  }

  stop() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.balanceTimer) clearInterval(this.balanceTimer);
    for (const unwatch of this.unwatchers) unwatch();
    this.unwatchers = [];
  }

  getJob(id: string): RelayerJob | undefined {
    return this.jobs.get(id);
  }

  allJobs(): RelayerJob[] {
    return Array.from(this.jobs.values());
  }

  // ─── Client initialisation ─────────────────────────────────────────────────

  private async initClients() {
    const setups: Array<ChainSetup & { fallbackRpcUrl: string }> = [
      { chain: mainnet,    rpcUrl: config.chains.ethereum.rpcUrl,  fallbackRpcUrl: config.chains.ethereum.fallbackRpcUrl,  routerEnvKey: 'ROUTER_ADDRESS_ETH'          },
      { chain: base,       rpcUrl: config.chains.base.rpcUrl,      fallbackRpcUrl: config.chains.base.fallbackRpcUrl,      routerEnvKey: 'ROUTER_ADDRESS_BASE'         },
      { chain: arbitrum,   rpcUrl: config.chains.arbitrum.rpcUrl,  fallbackRpcUrl: config.chains.arbitrum.fallbackRpcUrl,  routerEnvKey: 'ROUTER_ADDRESS_ARB'          },
      { chain: bsc,        rpcUrl: config.chains.bnb.rpcUrl,       fallbackRpcUrl: config.chains.bnb.fallbackRpcUrl,       routerEnvKey: 'ROUTER_ADDRESS_BSC'          },
      { chain: polygon,    rpcUrl: config.chains.polygon.rpcUrl,   fallbackRpcUrl: config.chains.polygon.fallbackRpcUrl,   routerEnvKey: 'ROUTER_ADDRESS_POLY'         },
      { chain: optimism,   rpcUrl: config.chains.optimism.rpcUrl,  fallbackRpcUrl: config.chains.optimism.fallbackRpcUrl,  routerEnvKey: 'ROUTER_ADDRESS_OPT'          },
      { chain: avalanche,  rpcUrl: config.chains.avalanche.rpcUrl, fallbackRpcUrl: config.chains.avalanche.fallbackRpcUrl, routerEnvKey: 'ROUTER_ADDRESS_AVAX'         },
      { chain: scroll,     rpcUrl: config.chains.scroll.rpcUrl,    fallbackRpcUrl: config.chains.scroll.fallbackRpcUrl,    routerEnvKey: 'ROUTER_ADDRESS_SCROLL'       },
      { chain: zkSync,     rpcUrl: config.chains.zkSync.rpcUrl,    fallbackRpcUrl: config.chains.zkSync.fallbackRpcUrl,    routerEnvKey: 'ROUTER_ADDRESS_ZKSYNC'       },
      // Testnets — read dedicated RPC env vars already present in .env
      { chain: sepolia,     rpcUrl: process.env.ETH_SEPOLIA_RPC_URL  ?? '', fallbackRpcUrl: '', routerEnvKey: 'ROUTER_ADDRESS_SEPOLIA'      },
      { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL ?? '', fallbackRpcUrl: '', routerEnvKey: 'ROUTER_ADDRESS_BASE_SEPOLIA'  },
    ];

    await Promise.all(setups.map(async ({ chain, rpcUrl, fallbackRpcUrl }) => {
      // Build transport: primary (Alchemy) with QuickNode fallback when both configured
      const transport = rpcTransport({ rpcUrl, fallbackRpcUrl });
      if (!transport) return;

      const pub = createPublicClient({ chain, transport }) as PublicClient;
      this.publicClients.set(chain.id, pub);

      const account = await getCachedRelayerAccount(chain.id);
      if (account) {
        // Wallet client always uses HTTP for tx submission (WS not needed for writes)
        const httpUrl = rpcUrl.startsWith('wss://') || rpcUrl.startsWith('ws://')
          ? rpcUrl.replace(/^wss?:\/\//, 'https://')
          : (rpcUrl || fallbackRpcUrl);
        const wal = createWalletClient({
          account,
          chain,
          transport: http(httpUrl),
        }) as WalletClient;
        this.walletClients.set(chain.id, wal);
        console.log(`[Relayer] chain=${chain.id} signer=${signerDescription(chain.id)} addr=${account.address}`);
      } else {
        console.warn(`[Relayer] chain=${chain.id} no signer configured — tx signing disabled`);
      }
    }));

    const active = [...this.publicClients.keys()];
    if (active.length) {
      console.log(`[Relayer] Clients initialised for chains: ${active.join(', ')}`);
    } else {
      console.warn('[Relayer] No RPC URLs configured — running in fully local dev mode');
    }
  }

  // ─── On-chain event listeners ──────────────────────────────────────────────

  private subscribeToChainEvents() {
    const routerEnvKeys: Record<number, string> = {
      1:        'ROUTER_ADDRESS_ETH',
      8453:     'ROUTER_ADDRESS_BASE',
      42161:    'ROUTER_ADDRESS_ARB',
      56:       'ROUTER_ADDRESS_BSC',
      137:      'ROUTER_ADDRESS_POLY',
      10:       'ROUTER_ADDRESS_OPT',
      43114:    'ROUTER_ADDRESS_AVAX',
      534352:   'ROUTER_ADDRESS_SCROLL',
      324:      'ROUTER_ADDRESS_ZKSYNC',
      11155111: 'ROUTER_ADDRESS_SEPOLIA',
      84532:    'ROUTER_ADDRESS_BASE_SEPOLIA',
    };

    let subscribed = 0;

    for (const [chainId, client] of this.publicClients) {
      const addr = process.env[routerEnvKeys[chainId] ?? ''] as Address | undefined;
      if (!addr) continue;

      // StrategyStarted — informational; job creation happens at executeStrategy call time
      const unwatchStarted = client.watchContractEvent({
        address: addr,
        abi: ROUTER_ABI,
        eventName: 'StrategyStarted',
        onLogs: (logs) => {
          for (const log of logs) {
            const { strategyId, user } = log.args as { strategyId: Hex; user: Address };
            console.log(`[Relayer] StrategyStarted chain=${chainId} id=${strategyId}`);
            emitWebhookEvent(user, 'StrategyStarted', strategyId, { chainId });
          }
        },
      });

      // StepExecuted — only BRIDGE steps (stepType === 2) need relayer continuation
      const unwatchStep = client.watchContractEvent({
        address: addr,
        abi: ROUTER_ABI,
        eventName: 'StepExecuted',
        onLogs: (logs) => {
          for (const log of logs) {
            const { strategyId, stepIndex, stepType, amountOut } = log.args as {
              strategyId: Hex;
              stepIndex: bigint;
              stepType: number;
              amountOut: bigint;
            };
            console.log(`[Relayer] StepExecuted chain=${chainId} id=${strategyId} step=${stepIndex} type=${stepType}`);
            this.onStepExecuted(strategyId, Number(stepIndex), stepType, amountOut, chainId);
          }
        },
      });

      // StrategyCompleted — mark all jobs for this strategy done
      const unwatchCompleted = client.watchContractEvent({
        address: addr,
        abi: ROUTER_ABI,
        eventName: 'StrategyCompleted',
        onLogs: (logs) => {
          for (const log of logs) {
            const { strategyId, destination, finalAmount } = log.args as {
              strategyId: Hex;
              destination: Address;
              finalAmount: bigint;
            };
            console.log(`[Relayer] StrategyCompleted id=${strategyId} amount=${finalAmount}`);
            this.markStrategyDone(strategyId);
            emitWebhookEvent(destination, 'StrategyCompleted', strategyId, {
              finalAmount: finalAmount.toString(),
              chainId,
            });
          }
        },
      });

      // StrategyFailed — trigger fallback or mark failed
      const unwatchFailed = client.watchContractEvent({
        address: addr,
        abi: ROUTER_ABI,
        eventName: 'StrategyFailed',
        onLogs: (logs) => {
          for (const log of logs) {
            const { strategyId, failedStep, reason } = log.args as {
              strategyId: Hex;
              failedStep: bigint;
              reason: string;
            };
            void monitoring.captureError(
              new Error(`StrategyFailed on-chain: ${reason}`),
              { strategyId, failedStep: Number(failedStep), chainId },
            );
            this.handleChainFailure(strategyId, Number(failedStep), reason);
          }
        },
      });

      // EmergencyExitTriggered — mark strategy as emergency-exited
      const unwatchExit = client.watchContractEvent({
        address: addr,
        abi: ROUTER_ABI,
        eventName: 'EmergencyExitTriggered',
        onLogs: (logs) => {
          for (const log of logs) {
            const { strategyId, source } = log.args as { strategyId: Hex; source: Address };
            console.log(`[Relayer] EmergencyExitTriggered id=${strategyId}`);
            for (const cb of this.emergencyExitListeners) cb(strategyId);
            emitWebhookEvent(source, 'EmergencyExitTriggered', strategyId, { chainId });
          }
        },
      });

      this.unwatchers.push(unwatchStarted, unwatchStep, unwatchCompleted, unwatchFailed, unwatchExit);
      subscribed++;
      console.log(`[Relayer] Watching Router at ${addr} on chain ${chainId}`);
    }

    if (subscribed === 0) {
      console.warn('[Relayer] No ROUTER_ADDRESS_* env vars set — event listeners disabled');
    }
  }

  // ─── Event handlers ────────────────────────────────────────────────────────

  private onStepExecuted(strategyId: Hex, stepIndex: number, stepType: number, amountOut: bigint, chainId: number) {
    // Only BRIDGE steps (stepType === 2) require relayer continuation.
    // SWAP / LEND / STAKE / SETTLE complete atomically inside executeStrategy.
    if (stepType !== 2) return;

    const jobId = `${strategyId}-${stepIndex}`;
    let job = this.jobs.get(jobId);

    if (!job) {
      // Job not pre-registered — create a synthetic one. Steps will be empty,
      // which will cause continueStrategy to fail on-chain with StepsHashMismatch.
      // The correct fix is to POST /strategy/execute with onChainSteps before this fires.
      console.warn(
        `[Relayer] BRIDGE StepExecuted for unregistered job id=${strategyId} step=${stepIndex}. ` +
        'continueStrategy will fail without onChainSteps. Call POST /strategy/execute first.',
      );
      job = {
        id: jobId,
        strategyId,
        stepIndex,
        bridgeTxHash: '',
        sourceChain: chainId,
        destinationChain: chainId,
        status: 'running',
        retries: 0,
        maxRetries: 5,
        quoteExpiresAt: 0,
        reoptimized: false,
        priority: 0,
        steps: [],
        bridgedAmount: amountOut,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.jobs.set(jobId, job);
    } else {
      job.bridgedAmount = amountOut;
    }

    // Allow 2 seconds for chain finality before calling continueStrategy
    const captured = job;
    setTimeout(() => {
      this.callContinueStrategy(captured, stepIndex + 1).catch((err) =>
        this.handleJobError(captured, err instanceof Error ? err.message : String(err)),
      );
    }, 2_000);
  }

  private markStrategyDone(strategyId: Hex) {
    for (const job of this.jobs.values()) {
      if (job.strategyId === strategyId && job.status !== 'done') {
        job.status = 'done';
        job.updatedAt = Date.now();
        this.notify(job.strategyId, job);
      }
    }
  }

  private handleChainFailure(strategyId: Hex, failedStep: number, reason: string) {
    const jobId = `${strategyId}-${failedStep}`;
    let resolvedJob = this.jobs.get(jobId);
    if (!resolvedJob) {
      // Create a failure record even if we never saw the job submitted
      resolvedJob = {
        id: jobId, strategyId, stepIndex: failedStep, bridgeTxHash: '',
        sourceChain: 0, destinationChain: 0,
        status: 'pending', retries: 0, maxRetries: 5,
        quoteExpiresAt: 0, reoptimized: false, priority: 0,
        steps: [], bridgedAmount: 0n,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      this.jobs.set(jobId, resolvedJob);
    }

    resolvedJob.lastError = reason;

    if (resolvedJob.retries < resolvedJob.maxRetries) {
      const fallback = BRIDGE_FALLBACK_ORDER[resolvedJob.retries % BRIDGE_FALLBACK_ORDER.length];
      console.warn(
        `[Relayer] Step ${failedStep} failed (${reason}) — ` +
        `retrying via ${fallback} (attempt ${resolvedJob.retries + 1}/${resolvedJob.maxRetries})`,
      );
      resolvedJob.retries++;
      resolvedJob.status = 'pending';
    } else {
      resolvedJob.status = 'failed';
      void monitoring.captureError(
        new Error(`Strategy exhausted all retries after ${resolvedJob.maxRetries} attempts`),
        { strategyId, failedStep, sourceChain: resolvedJob.sourceChain },
        'fatal',
      );
    }

    resolvedJob.updatedAt = Date.now();
    this.notify(strategyId, resolvedJob);
  }

  // ─── continueStrategy tx ──────────────────────────────────────────────────

  /**
   * Check whether the job's route quote has expired.
   * If so and a re-optimize callback is registered, trigger it before continuing.
   */
  private async checkAndReoptimizeIfExpired(job: RelayerJob): Promise<void> {
    if (!job.quoteExpiresAt || Date.now() < job.quoteExpiresAt) return;
    if (job.reoptimized) return; // already re-optimized once for this job

    console.warn(
      `[Relayer] Quote expired for strategy ${job.strategyId} at step ${job.stepIndex} — re-optimizing`,
    );
    job.reoptimized = true;

    if (this.reoptimizeCb) {
      try {
        await this.reoptimizeCb(job.strategyId);
        console.log(`[Relayer] Re-optimization complete for strategy ${job.strategyId}`);
      } catch (err) {
        console.error(
          `[Relayer] Re-optimization failed for ${job.strategyId}:`,
          (err as Error).message,
        );
      }
    } else {
      console.warn('[Relayer] No re-optimize callback registered — continuing with stale quotes');
    }
  }

  private async callContinueStrategy(job: RelayerJob, nextStepIndex: number) {
    // Re-optimize if the quote expired before we continue to the next step
    await this.checkAndReoptimizeIfExpired(job);

    const walletClient = this.walletClients.get(job.destinationChain);
    const publicClient = this.publicClients.get(job.destinationChain);
    const suffix = this.chainEnvSuffix(job.destinationChain);
    const routerAddress = process.env[`ROUTER_ADDRESS_${suffix}`] as Address | undefined;

    const relayerAddress = walletClient?.account?.address;

    // Dev mode — no real chain available
    if (!walletClient || !publicClient || !routerAddress || !relayerAddress) {
      console.log(
        `[Relayer] continueStrategy strategyId=${job.strategyId} nextStep=${nextStepIndex} (dev — no tx)`,
      );
      job.status = 'done';
      job.updatedAt = Date.now();
      this.notify(job.strategyId, job);
      return;
    }

    job.status = 'running';
    job.updatedAt = Date.now();
    this.notify(job.strategyId, job);

    try {
      // Use nonceManager to prevent nonce collision when concurrent jobs run on the same chain
      if (job.steps.length === 0) {
        const msg = `continueStrategy aborted: no onChainSteps for strategy=${job.strategyId}. ` +
          'POST /strategy/execute must include onChainSteps for bridge continuation.';
        console.error(`[Relayer] ${msg}`);
        throw new Error(msg);
      }

      const hash = await nonceManager.withNonce(
        publicClient,
        job.destinationChain,
        relayerAddress,
        async (nonce) => {
          const { request } = await publicClient.simulateContract({
            address: routerAddress,
            abi: ROUTER_ABI,
            functionName: 'continueStrategy',
            args: [job.strategyId, BigInt(nextStepIndex), job.steps, job.bridgedAmount],
            account: relayerAddress,
            nonce,
          });

          return walletClient.writeContract({
            ...(request as Parameters<typeof walletClient.writeContract>[0]),
            nonce,
          });
        },
      );

      console.log(`[Relayer] continueStrategy tx=${hash} strategy=${job.strategyId} step=${nextStepIndex}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as Hex });
      if (receipt.status === 'success') {
        job.status = 'done';
        console.log(`[Relayer] Step ${nextStepIndex} confirmed block=${receipt.blockNumber}`);
      } else {
        throw new Error('Transaction reverted on-chain');
      }
    } finally {
      job.updatedAt = Date.now();
      this.notify(job.strategyId, job);
    }
  }

  // ─── Wallet balance monitor ────────────────────────────────────────────────

  private startBalanceMonitor() {
    if (this.walletClients.size === 0) return;

    const check = async () => {
      for (const [chainId, walletClient] of this.walletClients) {
        const client = this.publicClients.get(chainId);
        if (!client || !walletClient.account) continue;
        try {
          const balance = await client.getBalance({ address: walletClient.account.address });
          const eth = parseFloat(formatEther(balance));

          if (eth < LOW_BALANCE_ETH) {
            void monitoring.alert(`Relayer low balance on chain ${chainId}`, {
              chainId,
              balanceEth: eth,
              address: walletClient.account.address,
              thresholdEth: LOW_BALANCE_ETH,
            });
          } else {
            console.log(`[Relayer] Balance chain=${chainId}: ${eth.toFixed(4)} ETH ✓`);
          }
        } catch {
          // transient RPC error — retry next interval
        }
      }
    };

    check(); // immediate check on startup
    this.balanceTimer = setInterval(check, 5 * 60 * 1_000); // every 5 min
  }

  // ─── Phase 0 polling fallback ──────────────────────────────────────────────

  private async processPending() {
    // Sort pending jobs: higher priority first, then by creation time (FIFO within same tier)
    const pending = Array.from(this.jobs.values())
      .filter((j) => j.status === 'pending')
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);

    relayerMetrics.queueDepth(pending.length);

    for (const job of pending) {
      try {
        await this.processJob(job);
      } catch (err) {
        this.handleJobError(job, err instanceof Error ? err.message : String(err));
      }
    }
  }

  private async processJob(job: RelayerJob) {
    job.status = 'running';
    job.updatedAt = Date.now();
    this.notify(job.strategyId, job);

    const confirmed = await this.checkBridgeConfirmation(job);
    if (confirmed) {
      await this.callContinueStrategy(job, job.stepIndex + 1);
      // callContinueStrategy sets job.status internally; only override in dev mode
      if (job.status === ('running' as JobStatus)) {
        job.status = 'done';
        job.updatedAt = Date.now();
        this.notify(job.strategyId, job);
      }
      const bridge = BRIDGE_FALLBACK_ORDER[job.retries % BRIDGE_FALLBACK_ORDER.length];
      relayerMetrics.jobSuccess(bridge);
      relayerMetrics.jobDuration(bridge, job.updatedAt - job.createdAt);
      anomaly.record('success');
    } else {
      job.status = 'pending';
      job.updatedAt = Date.now();
    }
  }

  private async checkBridgeConfirmation(job: RelayerJob): Promise<boolean> {
    const client = this.publicClients.get(job.destinationChain);
    if (!client || !job.bridgeTxHash) return true; // dev mode always confirmed

    try {
      const receipt = await client.getTransactionReceipt({ hash: job.bridgeTxHash as Hex });
      return receipt.status === 'success';
    } catch {
      return false;
    }
  }

  private handleJobError(job: RelayerJob, error: string) {
    job.retries++;
    job.lastError = error;
    job.updatedAt = Date.now();

    const bridge = BRIDGE_FALLBACK_ORDER[job.retries % BRIDGE_FALLBACK_ORDER.length];

    if (job.retries >= job.maxRetries) {
      job.status = 'failed';
      relayerMetrics.jobFailed(bridge, error);
      anomaly.record('failure');
      void monitoring.captureError(new Error(error), {
        jobId: job.id, strategyId: job.strategyId, retries: job.retries,
      });
    } else {
      const backoffMs = Math.pow(2, job.retries) * 1_000;
      job.status = 'pending';
      relayerMetrics.jobRetried(bridge, job.retries);
      console.warn(`[Relayer] Job ${job.id} retry ${job.retries}/${job.maxRetries} in ${backoffMs}ms`);
      setTimeout(() => {
        if (job.status === 'pending') {
          this.processJob(job).catch((err) => this.handleJobError(job, String(err)));
        }
      }, backoffMs);
    }

    this.notify(job.strategyId, job);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private chainEnvSuffix(chainId: number): string {
    const map: Record<number, string> = {
      1: 'ETH', 8453: 'BASE', 42161: 'ARB', 56: 'BSC', 137: 'POLY',
      10: 'OPT', 43114: 'AVAX', 534352: 'SCROLL', 324: 'ZKSYNC',
      11155111: 'SEPOLIA', 84532: 'BASE_SEPOLIA',
    };
    return map[chainId] ?? String(chainId);
  }

  private notify(strategyId: string, job: RelayerJob) {
    for (const cb of this.listeners) cb(strategyId, job);
  }
}
