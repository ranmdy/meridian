import { createConfig, http } from 'wagmi';
import { mainnet, base, arbitrum, bsc, polygon, sepolia, baseSepolia } from 'wagmi/chains';
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'dev-placeholder';

export const wagmiConfig = createConfig({
  chains: [mainnet, base, arbitrum, bsc, polygon, sepolia, baseSepolia],
  // Enable EIP-6963 multi-wallet discovery so users can pick MetaMask specifically
  // when multiple wallets (e.g. Pelagus, Rabby) are installed
  multiInjectedProviderDiscovery: true,
  connectors: [
    injected(),
    walletConnect({ projectId }),
    coinbaseWallet({ appName: 'Meridian' }),
  ],
  transports: {
    [mainnet.id]:     http(process.env.NEXT_PUBLIC_ETH_RPC_URL),
    [base.id]:        http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
    [arbitrum.id]:    http(process.env.NEXT_PUBLIC_ARB_RPC_URL),
    [bsc.id]:         http(process.env.NEXT_PUBLIC_BNB_RPC_URL),
    [polygon.id]:     http(process.env.NEXT_PUBLIC_POLY_RPC_URL),
    [sepolia.id]:     http(process.env.NEXT_PUBLIC_ETH_RPC_URL),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
  },
  ssr: true,
});
