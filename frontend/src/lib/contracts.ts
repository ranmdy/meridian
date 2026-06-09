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
