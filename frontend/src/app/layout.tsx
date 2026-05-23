import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/src/components/layout/Providers';

export const metadata: Metadata = {
  title: 'Meridian — Cross-Chain DeFi Strategy Router',
  description:
    'Deposit any asset. Define a destination. Meridian autonomously routes your funds through the best yield-generating DeFi strategies across multiple chains.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-gray-100 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
