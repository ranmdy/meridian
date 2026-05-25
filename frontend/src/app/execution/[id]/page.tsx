import Link from 'next/link';
import { ExecutionPoller } from '@/src/components/execution/ExecutionPoller';
import { ExportButtons } from '@/src/components/execution/ExportButtons';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ExecutionPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-300 transition-colors">
            ← Back to home
          </Link>
          <h1 className="mt-4 text-2xl font-bold text-gray-100">Strategy Execution</h1>
          <p className="mt-1 font-mono text-sm text-gray-500">{id}</p>
        </div>

        <div className="glass p-6">
          <h2 className="mb-6 text-base font-semibold text-gray-100 tracking-tight">Execution Progress</h2>
          <ExecutionPoller executionId={id} />
        </div>

        <ExportButtons executionId={id} />

        <p className="mt-6 text-center text-xs text-gray-600">
          Updates automatically. You can close this tab and return later — your strategy will
          continue executing on-chain.
        </p>
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: `Execution ${id} | Meridian`,
  };
}
