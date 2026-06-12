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
    [mainnet.id]:     http('https://ethereum-rpc.publicnode.com'),
    [base.id]:        http('https://base-rpc.publicnode.com'),
    [arbitrum.id]:    http('https://arbitrum-one-rpc.publicnode.com'),
    [bsc.id]:         http('https://bsc-rpc.publicnode.com'),
    [polygon.id]:     http('https://polygon-bor-rpc.publicnode.com'),
    [sepolia.id]:     http(process.env.NEXT_PUBLIC_ETH_RPC_URL),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_BASE_RPC_URL),
  },
  ssr: true,
});
