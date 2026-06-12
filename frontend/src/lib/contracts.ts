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
              { name: 'outputAsset', type: 'address' },
            ],
          },
          { name: 'destinationWallet', type: 'address' },
          { name: 'destinationSignature', type: 'bytes' },
          { name: 'deadline', type: 'uint256' },
          { name: 'creator', type: 'address' },
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

// Minimal ERC-20 ABI — allowance + approve only
export const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'decimals',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

// Well-known ERC-20 token addresses per chain
export const TOKEN_ADDRESSES: Record<string, Record<number, `0x${string}`>> = {
  USDC: {
    1:        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    8453:     '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    42161:    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    56:       '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    137:      '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia
    84532:    '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // Base Sepolia
    31337:    '0x0000000000000000000000000000000000000001', // mock for Anvil
  },
  USDT: {
    1:        '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    42161:    '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    56:       '0x55d398326f99059fF775485246999027B3197955',
    137:      '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    31337:    '0x0000000000000000000000000000000000000002',
  },
  WBTC: {
    1:        '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    42161:    '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
    137:      '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    31337:    '0x0000000000000000000000000000000000000003',
  },
};

// Token decimals (most ERC-20s are 18, stablecoins are 6, WBTC is 8)
export const TOKEN_DECIMALS: Record<string, number> = {
  ETH: 18,
  USDC: 6,
  USDT: 6,
  WBTC: 8,
};

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
  1:        ROUTER_ADDRESS,   // Ethereum (or Anvil dev)
  8453:     ROUTER_ADDRESS,   // Base
  42161:    ROUTER_ADDRESS,   // Arbitrum
  56:       ROUTER_ADDRESS,   // BNB
  137:      ROUTER_ADDRESS,   // Polygon
  31337:    ROUTER_ADDRESS,   // Anvil local
  11155111: (process.env.NEXT_PUBLIC_ROUTER_ADDRESS_SEPOLIA as `0x${string}`) ?? ROUTER_ADDRESS,
  84532:    (process.env.NEXT_PUBLIC_ROUTER_ADDRESS_BASE_SEPOLIA as `0x${string}`) ?? ROUTER_ADDRESS,
};

export function getRouterAddress(chainId: number): `0x${string}` {
  return ROUTER_ADDRESSES[chainId] ?? ROUTER_ADDRESS;
}

// ─── Protocol Adapter addresses ──────────────────────────────────────────────
//
// Maps: protocol name (as returned by backend RouteStep.protocol)
//        → chain ID
//        → deployed adapter contract address
//
// When a step's protocol name matches an entry here the frontend uses the real
// step type (LEND/SWAP/STAKE) with the adapter address.
// Any step whose protocol has no adapter entry falls back to SETTLE so it still
// executes as a pass-through on the current router deployment.
//
// Add entries here after deploying new adapters with DeployAdapters.s.sol.
// Keys MUST match the protocol name strings returned by the backend route
// optimizer (snake_case): 'aave_v3', 'uniswap_v3', 'compound_v3', etc.
// See backend/src/services/strategy-engine/graph.ts for the canonical names.
export const ADAPTER_ADDRESSES: Record<string, Partial<Record<number, `0x${string}`>>> = {
  'aave_v3': {
    11155111: '0x37D4fdBfBa638E82e5A9798EEd635161710153BA',
  },
  'uniswap_v3': {
    11155111: '0xF7Bd43ccd4b621784fec8Af1d3e243C846D1D4e8',
    84532:    '0xB19208BBb71037DCe838abC18aD973dBD3CE238E',
  },
  'across': {
    11155111: '0x9A7fF88a6f6337D3A2F91C1a3f1098ebFC3f89F0',
    84532:    '0x4859a9648894cE9b2094d8cC7b530c26864d29A2',
  },
};

// Token addresses on destination chains (needed for bridge outputToken param).
// Keys are "symbol:chainId" — maps to the token address on that destination chain.
// The bridge adapter needs to know what token to expect on the other side.
export const DESTINATION_TOKEN_ADDRESSES: Record<string, Record<number, `0x${string}`>> = {
  USDC: {
    11155111: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    84532:    '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    1:        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    8453:     '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    42161:    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
};

/// @returns The adapter address for a protocol on the given chain, or null if
///          no adapter is deployed yet (caller should fall back to SETTLE).
export function getAdapterAddress(
  protocolName: string,
  chainId: number,
): `0x${string}` | null {
  return ADAPTER_ADDRESSES[protocolName]?.[chainId] ?? null;
}
