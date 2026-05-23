'use client';

import { useEffect } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from 'wagmi';
import { parseEther, decodeEventLog } from 'viem';
import { useStrategyStore } from '@/src/stores/strategy';
import { ROUTER_ABI, STEP_TYPE, ETH_ADDRESS, getRouterAddress } from '@/src/lib/contracts';

// Dev-only: approximate ETH price used to convert USD → wei.
// Swap in a real price feed (Chainlink/Pyth) before mainnet.
const ETH_PRICE_USD = 3000;

export function useExecuteStrategy() {
  const { chain } = useAccount();

  const {
    routes,
    selectedRouteIndex,
    sourceAsset,
    sourceAmountUsd,
    destinationWallet,
    destinationSignature,
  } = useStrategyStore();

  const selectedRoute = routes[selectedRouteIndex];

  const {
    data: txHash,
    writeContract,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
  } = useWaitForTransactionReceipt({ hash: txHash });

  // Parse the strategyId (bytes32) from the StrategyStarted log
  let strategyId: `0x${string}` | undefined;
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: ROUTER_ABI,
          eventName: 'StrategyStarted',
          data: log.data,
          topics: log.topics,
        });
        strategyId = decoded.args.strategyId as `0x${string}`;
        break;
      } catch {
        // not this event — skip
      }
    }
  }

  const execute = () => {
    if (!selectedRoute || !chain) return;

    // Only ETH source is supported in this build.
    // ERC-20 requires an approve() call first — add in Phase 1.
    if (sourceAsset !== 'ETH') {
      console.error('Only ETH source is supported for on-chain execution currently.');
      return;
    }

    const routerAddress = getRouterAddress(chain.id);
    const sourceAmountWei = parseEther(String(sourceAmountUsd / ETH_PRICE_USD));

    // Deadline: 30 minutes from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

    const steps = selectedRoute.steps.map((step) => ({
      stepType: STEP_TYPE[step.stepType] ?? 0,
      protocol: (step.protocolAddress || ETH_ADDRESS) as `0x${string}`,
      // params are empty here — the relayer encodes the actual protocol calldata
      // when it calls continueStrategy(). Frontend just commits the route.
      params: '0x' as `0x${string}`,
      // minOutput = 0 in dev to avoid slippage failures on Anvil.
      // Replace with estimatedOutput * (1 - slippageBps/10000) before mainnet.
      minOutput: BigInt(0),
    }));

    writeContract({
      address: routerAddress,
      abi: ROUTER_ABI,
      functionName: 'executeStrategy',
      args: [
        {
          sourceAsset: ETH_ADDRESS,
          sourceAmount: sourceAmountWei,
          steps,
          destinationWallet: destinationWallet as `0x${string}`,
          destinationSignature: destinationSignature as `0x${string}`,
          deadline,
        },
      ],
      value: sourceAmountWei,
    });
  };

  return {
    execute,
    isPending,      // waiting for wallet signature
    isConfirming,   // waiting for block confirmation
    isSuccess,
    strategyId,     // set once StrategyStarted event is parsed from receipt
    txHash,
    error: writeError,
    reset,
  };
}
