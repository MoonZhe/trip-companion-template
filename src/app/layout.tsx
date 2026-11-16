import { TRIP } from '@/trip.config';
import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Geist, Geist_Mono } from 'next/font/google';
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker';
import { APPLE_TOUCH_ICON } from '@/lib/appleIcon';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: TRIP.name,
  description: `${TRIP.travellers} · ${TRIP.name}`,
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: TRIP.name, statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: APPLE_TOUCH_ICON },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f3ec' },
    { media: '(prefers-color-scheme: dark)', color: '#15110f' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-[100dvh]">
        {children}
        <RegisterServiceWorker />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
