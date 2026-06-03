import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type NetworkMode = 'testnet' | 'mainnet';

interface NetworkState {
  mode: NetworkMode;
  toggle: () => void;
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set, get) => ({
      mode: (process.env.NEXT_PUBLIC_NETWORK as NetworkMode | undefined) ?? 'testnet',
      toggle: () => set({ mode: get().mode === 'testnet' ? 'mainnet' : 'testnet' }),
    }),
    { name: 'meridian-network' },
  ),
);
