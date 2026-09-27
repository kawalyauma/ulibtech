import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { websiteJsonLd, organizationJsonLd } from '@edushare/seo';
import { ADSENSE_CLIENT_ID, SITE_NAME, SITE_URL } from '@/lib/config';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { BottomNav } from '@/components/bottom-nav';
import { JsonLd } from '@/components/json-ld';
import { ServiceWorker } from '@/components/service-worker';
import './globals.css';

const DESCRIPTION =
  'Search and download free educational resources for Ugandan schools — past papers, notes, schemes of work and lesson plans for Nursery, Primary and Secondary.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} – Free Past Papers, Notes, Schemes & Lesson Plans`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_UG', url: SITE_URL },
  twitter: { card: 'summary_large_image' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  formatDetection: { telephone: false },
  // Lets Google AdSense verify site ownership.
  ...(ADSENSE_CLIENT_ID ? { other: { 'google-adsense-account': ADSENSE_CLIENT_ID } } : {}),
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f766e' },
    { media: '(prefers-color-scheme: dark)', color: '#111827' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-UG">
      <body className="flex min-h-dvh flex-col antialiased">
        <JsonLd
          data={websiteJsonLd({ name: SITE_NAME, url: SITE_URL, description: DESCRIPTION })}
        />
        <JsonLd
          data={organizationJsonLd({
            name: SITE_NAME,
            url: SITE_URL,
            logo: `${SITE_URL}/icons/icon-512.png`,
          })}
        />
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
        <BottomNav />
        <ServiceWorker />
        {ADSENSE_CLIENT_ID ? (
          // Auto ads: placements are chosen in the AdSense dashboard, not hard-coded here.
          <Script
            id="adsense"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
          />
        ) : null}
      </body>
    </html>
  );
}
