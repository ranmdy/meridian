import { ExecutionPage } from '@/src/components/pages/ExecutionPage';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ExecutionRoute({ params }: PageProps) {
  const { id } = await params;
  return <ExecutionPage id={id} />;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: `Execution ${id} — Meridian`,
  };
}
