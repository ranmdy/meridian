import type { Metadata } from 'next';
import { StrategyComposer } from '@/src/components/composer/StrategyComposer';

export const metadata: Metadata = {
  title: 'Strategy Composer — Meridian',
  description: 'Drag-and-drop DeFi strategy builder',
};

export default function ComposerPage() {
  return <StrategyComposer />;
}
