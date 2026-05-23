import { Navbar } from '@/src/components/layout/Navbar';
import { StrategyForm } from '@/src/components/strategy/StrategyForm';
import { RouteList } from '@/src/components/strategy/RouteList';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950">
      <Navbar />

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gray-100 mb-4">
          Every asset has a destination.
          <br />
          <span className="text-meridian-400">We find the best path there.</span>
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Deposit any asset. Define a destination. Meridian autonomously routes your funds
          through the best yield-generating DeFi strategies across multiple chains — fully
          transparent, fully auditable.
        </p>
      </section>

      {/* Main layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <StrategyForm />
          <RouteList />
        </div>
      </main>
    </div>
  );
}
