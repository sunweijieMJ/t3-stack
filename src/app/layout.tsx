import type { Metadata } from 'next';
import { Roboto, Roboto_Serif } from 'next/font/google';
import { Suspense } from 'react';
import { Toaster } from 'sonner';
import '@/styles/globals.css';
import { DebugPanel } from '@/components/DebugPanel';
import { env } from '@/env';
import { pickI18nText } from '@/lib/i18n-text';
import { TRPCReactProvider } from '@/lib/trpc/react';
import { getFrontendConfig, getPortalTitle } from '@/server/services/config';

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  variable: '--font-roboto',
  display: 'swap',
});

const robotoSerif = Roboto_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-roboto-serif',
  display: 'swap',
});

const SITE_URL = env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const FALLBACK_DESCRIPTION = 'Coming Soon';

export async function generateMetadata(): Promise<Metadata> {
  const [siteName, cfg] = await Promise.all([
    getPortalTitle('en-US'),
    getFrontendConfig(),
  ]);
  const description =
    pickI18nText(cfg.seo?.defaultDescription, 'en-US', '') ||
    FALLBACK_DESCRIPTION;
  const keywords = Array.isArray(cfg.seo?.keywords) ? cfg.seo.keywords : [];
  const ogImage = cfg.seo?.ogImage || cfg.basic?.logoImage || '';
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    icons: [{ rel: 'icon', url: '/favicon.ico' }],
    openGraph: {
      type: 'website',
      siteName,
      locale: 'en_US',
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className={`${roboto.variable} ${robotoSerif.variable}`} lang="en">
      <body style={{ fontFamily: 'var(--font-roboto), sans-serif' }}>
        <TRPCReactProvider>{children}</TRPCReactProvider>
        <Toaster position="top-center" richColors />
        <Suspense>
          <DebugPanel />
        </Suspense>
      </body>
    </html>
  );
}
