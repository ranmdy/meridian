import { PortfolioView } from '@/src/components/portfolio/PortfolioView';

export const metadata = {
  title: 'Portfolio | Meridian',
  description: 'View your asset balances across all supported chains.',
};

export default function PortfolioPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-100">Portfolio</h1>
          <p className="mt-1 text-sm text-gray-400">
            Asset balances across all supported chains.
          </p>
        </div>
        <PortfolioView />
      </div>
    </main>
  );
}
