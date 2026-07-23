import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: 'NIFTY Option Chain Dashboard | Live CE & PE High/Low',
  description:
    'Real-time NIFTY option chain dashboard showing CE/PE High and Low for each strike. Live data from NSE, auto-refreshing every 5 seconds.',
  keywords: ['NIFTY', 'option chain', 'CE', 'PE', 'high low', 'NSE', 'derivatives', 'live trading'],
  authors: [{ name: 'NIFTY Option Chain Dashboard' }],
  robots: 'noindex',
  openGraph: {
    title: 'NIFTY Option Chain Dashboard',
    description: 'Real-time NIFTY option chain dashboard showing CE/PE High and Low for each strike.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NIFTY Option Chain Dashboard',
    description: 'Real-time NIFTY option chain dashboard showing CE/PE High and Low for each strike.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
