import type { Metadata } from 'next';
import { BillingPanel } from '@/src/components/billing/BillingPanel';

export const metadata: Metadata = {
  title: 'Billing — Meridian',
  description: 'Manage your Meridian subscription',
};

export default function BillingPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl font-bold text-white mb-8">Subscription & Billing</h1>
      <BillingPanel />
    </main>
  );
}
