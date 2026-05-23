// Minimal ABI — only what the frontend calls directly
export const ROUTER_ABI = [
  {
    type: 'function',
    name: 'executeStrategy',
    inputs: [
      {
        name: 'strategy',
        type: 'tuple',
        components: [
          { name: 'sourceAsset', type: 'address' },
          { name: 'sourceAmount', type: 'uint256' },
          {
            name: 'steps',
            type: 'tuple[]',
            components: [
              { name: 'stepType', type: 'uint8' },
              { name: 'protocol', type: 'address' },
              { name: 'params', type: 'bytes' },
              { name: 'minOutput', type: 'uint256' },
            ],
          },
          { name: 'destinationWallet', type: 'address' },
          { name: 'destinationSignature', type: 'bytes' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    type: 'event',
    name: 'StrategyStarted',
    inputs: [
      { name: 'strategyId', type: 'bytes32', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'sourceAsset', type: 'address', indexed: false },
      { name: 'destinationWallet', type: 'address', indexed: false },
    ],
  },
  {
    type: 'error',
    name: 'DeadlineExpired',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InvalidDestinationSignature',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroAmount',
    inputs: [],
  },
] as const;

// StepType enum order matches IMeridianRouter.StepType in Solidity
export const STEP_TYPE: Record<string, number> = {
  SWAP: 0,
  LEND: 1,
  BRIDGE: 2,
  STAKE: 3,
  SETTLE: 4,
};

// ETH pseudo-address (address(0))
export const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// Router addresses per chain — falls back to Anvil local address for dev
const ROUTER_ADDRESS =
  (process.env.NEXT_PUBLIC_ROUTER_ADDRESS as `0x${string}`) ??
  '0x5FbDB2315678afecb367f032d93F642f64180aa3';

const ROUTER_ADDRESSES: Record<number, `0x${string}`> = {
  1: ROUTER_ADDRESS,      // Ethereum (or Anvil dev)
  8453: ROUTER_ADDRESS,   // Base
  42161: ROUTER_ADDRESS,  // Arbitrum
  56: ROUTER_ADDRESS,     // BNB
  137: ROUTER_ADDRESS,    // Polygon
  31337: ROUTER_ADDRESS,  // Anvil local
};

export function getRouterAddress(chainId: number): `0x${string}` {
  return ROUTER_ADDRESSES[chainId] ?? ROUTER_ADDRESS;
}
