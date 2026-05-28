import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/src/components/layout/Providers';
import { Navbar } from '@/src/components/layout/Navbar';
import { Footer } from '@/src/components/layout/Footer';

export const metadata: Metadata = {
  title: 'Meridian — Cross-Chain DeFi Strategy Router',
  description:
    'Deposit any asset. Define a destination. Meridian autonomously routes your funds through the best yield-generating DeFi strategies across multiple chains.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('mrd-theme');if(t==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Providers>
          <Navbar />
          <div style={{ flex: 1 }}>{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
