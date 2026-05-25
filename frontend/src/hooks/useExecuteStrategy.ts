'use client';

import { useState, useCallback } from 'react';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
} from 'wagmi';
import { parseUnits, decodeEventLog, maxUint256 } from 'viem';
import { useStrategyStore } from '@/src/stores/strategy';
import {
  ROUTER_ABI,
  ERC20_ABI,
  STEP_TYPE,
  ETH_ADDRESS,
  TOKEN_ADDRESSES,
  TOKEN_DECIMALS,
  getRouterAddress,
} from '@/src/lib/contracts';

// Dev-only: approximate prices used to convert USD → token units.
// Replace with Chainlink/Pyth price feed before mainnet.
const TOKEN_PRICE_USD: Record<string, number> = {
  ETH:  3000,
  WBTC: 65000,
  USDC: 1,
  USDT: 1,
};

export type ExecuteStage =
  | 'idle'
  | 'checking_allowance'
  | 'approving'
  | 'awaiting_approval'
  | 'executing'
  | 'awaiting_execution'
  | 'success'
  | 'error';

export function useExecuteStrategy() {
  const { chain, address: userAddress } = useAccount();
  const [stage, setStage] = useState<ExecuteStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [strategyId, setStrategyId] = useState<`0x${string}` | undefined>();
  const [executionTxHash, setExecutionTxHash] = useState<`0x${string}` | undefined>();
  const [approvalHash, setApprovalHash] = useState<`0x${string}` | undefined>();

  const {
    routes,
    selectedRouteIndex,
    sourceAsset,
    sourceAmountUsd,
    destinationWallet,
    destinationSignature,
  } = useStrategyStore();

  const selectedRoute = routes[selectedRouteIndex];
  const isEth = sourceAsset === 'ETH';
  const chainId = chain?.id ?? 1;
  const routerAddress = getRouterAddress(chainId);

  // ERC-20 token address for this asset/chain
  const tokenAddress = isEth
    ? undefined
    : (TOKEN_ADDRESSES[sourceAsset]?.[chainId] as `0x${string}` | undefined);

  // Read current ERC-20 allowance (disabled for ETH)
  const { refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress && tokenAddress ? [userAddress, routerAddress] : undefined,
    query: { enabled: !isEth && !!userAddress && !!tokenAddress },
  });

  const { writeContractAsync: writeApprove } = useWriteContract();
  const { writeContractAsync: writeExecute } = useWriteContract();

  const { isLoading: awaitingApproval } = useWaitForTransactionReceipt({ hash: approvalHash });

  const { isLoading: awaitingExecution, data: executionReceipt } =
    useWaitForTransactionReceipt({ hash: executionTxHash });

  // Parse strategyId from StrategyStarted log once receipt lands
  if (executionReceipt && !strategyId) {
    for (const log of executionReceipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: ROUTER_ABI,
          eventName: 'StrategyStarted',
          data: log.data,
          topics: log.topics,
        });
        setStrategyId(decoded.args.strategyId as `0x${string}`);
        setStage('success');
        break;
      } catch {
        // not this event — skip
      }
    }
  }

  const reset = useCallback(() => {
    setStage('idle');
    setError(null);
    setStrategyId(undefined);
    setExecutionTxHash(undefined);
    setApprovalHash(undefined);
  }, []);

  const execute = useCallback(async () => {
    if (!selectedRoute || !chain || !userAddress) return;

    setError(null);
    setStage('idle');

    try {
      const decimals = TOKEN_DECIMALS[sourceAsset] ?? 18;
      const priceUsd  = TOKEN_PRICE_USD[sourceAsset] ?? 1;
      const tokenQty  = sourceAmountUsd / priceUsd;
      const sourceAmountRaw = parseUnits(tokenQty.toFixed(decimals), decimals);

      // ── Step 1: ERC-20 approval (skip for native ETH) ──────────────────────
      if (!isEth && tokenAddress) {
        setStage('checking_allowance');
        const { data: currentAllowance } = await refetchAllowance();
        const allowance = (currentAllowance as bigint | undefined) ?? 0n;

        if (allowance < sourceAmountRaw) {
          setStage('approving');
          // Infinite approval — avoids repeat approval prompts.
          const hash = await writeApprove({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [routerAddress, maxUint256],
          });
          setApprovalHash(hash);
          setStage('awaiting_approval');
          await waitForReceipt(hash);
        }
      }

      // ── Step 2: executeStrategy ─────────────────────────────────────────────
      setStage('executing');

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

      const steps = selectedRoute.steps.map((step) => ({
        stepType: STEP_TYPE[step.stepType] ?? 0,
        protocol: (step.protocolAddress || ETH_ADDRESS) as `0x${string}`,
        params: '0x' as `0x${string}`,
        minOutput: 0n, // replace with estimatedOutput × (1 − slippage) pre-mainnet
      }));

      const sourceAssetAddr = isEth
        ? (ETH_ADDRESS as `0x${string}`)
        : (tokenAddress ?? (ETH_ADDRESS as `0x${string}`));

      const hash = await writeExecute({
        address: routerAddress,
        abi: ROUTER_ABI,
        functionName: 'executeStrategy',
        args: [
          {
            sourceAsset: sourceAssetAddr,
            sourceAmount: sourceAmountRaw,
            steps,
            destinationWallet: destinationWallet as `0x${string}`,
            destinationSignature: destinationSignature as `0x${string}`,
            deadline,
          },
        ],
        value: isEth ? sourceAmountRaw : 0n,
      });

      setExecutionTxHash(hash);
      setStage('awaiting_execution');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('error');
    }
  }, [
    selectedRoute, chain, userAddress, sourceAsset, sourceAmountUsd,
    destinationWallet, destinationSignature, isEth, tokenAddress,
    routerAddress, refetchAllowance, writeApprove, writeExecute,
  ]);

  return {
    execute,
    stage,
    isPending:    stage === 'approving'  || stage === 'executing',
    isConfirming: stage === 'awaiting_approval' || stage === 'awaiting_execution',
    isApproving:  stage === 'approving'  || stage === 'awaiting_approval',
    isExecuting:  stage === 'executing'  || stage === 'awaiting_execution',
    isSuccess:    stage === 'success',
    isError:      stage === 'error',
    strategyId,
    executionTxHash,
    approvalHash,
    awaitingApproval,
    awaitingExecution,
    error,
    reset,
  };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

/** Poll window.ethereum until a receipt is returned (max 2 minutes). */
async function waitForReceipt(hash: `0x${string}`): Promise<void> {
  const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!provider) return;

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const receipt = await provider.request({
        method: 'eth_getTransactionReceipt',
        params: [hash],
      });
      if (receipt) return;
    } catch { /* transient RPC error — retry */ }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}
