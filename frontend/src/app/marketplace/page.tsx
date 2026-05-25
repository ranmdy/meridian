import { MarketplaceBrowser } from '@/src/components/marketplace/MarketplaceBrowser';

export const metadata = {
  title: 'Strategy Marketplace | Meridian',
  description: 'Browse and copy community-published DeFi routing strategies.',
};

export default function MarketplacePage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-100">Strategy Marketplace</h1>
          <p className="mt-1 text-sm text-gray-400">
            Browse community-published strategies. Copy any strategy with one click.
          </p>
        </div>
        <MarketplaceBrowser />
      </div>
    </main>
  );
}
