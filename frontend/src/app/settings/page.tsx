import type { Metadata } from 'next';
import { ApiKeysPanel } from '@/src/components/settings/ApiKeysPanel';

export const metadata: Metadata = {
  title: 'Settings — Meridian',
  description: 'Manage API keys and developer settings',
};

export default function SettingsPage() {
  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
      <p className="text-gray-500 text-sm mb-8">Developer API keys and account preferences</p>
      <ApiKeysPanel />
    </main>
  );
}
