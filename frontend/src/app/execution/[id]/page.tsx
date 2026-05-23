import Link from 'next/link';
import { ExecutionPoller } from '@/components/execution/ExecutionPoller';

interface PageProps {
  params: { id: string };
}

export default function ExecutionPage({ params }: PageProps) {
  const { id } = params;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link href="/" className="text-sm text-white/40 hover:text-white/70 transition-colors">
            ← Back to home
          </Link>
          <h1 className="mt-4 text-2xl font-bold">Strategy Execution</h1>
          <p className="mt-1 font-mono text-sm text-white/40">{id}</p>
        </div>

        {/* Live tracker */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-6 text-base font-semibold text-white/80">Execution Progress</h2>
          <ExecutionPoller executionId={id} />
        </div>

        {/* Info footer */}
        <p className="mt-6 text-center text-xs text-white/30">
          Updates automatically. You can close this tab and return later — your strategy will
          continue executing on-chain.
        </p>
      </div>
    </main>
  );
}

export function generateMetadata({ params }: PageProps) {
  return {
    title: `Execution ${params.id} | Meridian`,
  };
}
