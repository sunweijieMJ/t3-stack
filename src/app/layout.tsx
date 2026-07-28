import type { Metadata } from 'next';
import { Roboto, Roboto_Serif } from 'next/font/google';
import { Suspense } from 'react';
import { Toaster } from 'sonner';
import '@/styles/globals.css';
import { DebugPanel } from '@/components/DebugPanel';
import { env } from '@/env';
import { pickI18nText } from '@/lib/i18n-text';
import { TRPCReactProvider } from '@/lib/trpc/react';
import {
  getDefaultLang,
  getFrontendConfig,
  getPortalTitle,
  toHtmlLang,
  toOgLocale,
} from '@/server/services/config';

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

const FALLBACK_DESCRIPTION = 'Coming Soon';

export async function generateMetadata(): Promise<Metadata> {
  const [siteName, cfg, lang] = await Promise.all([
    getPortalTitle(),
    getFrontendConfig(),
    getDefaultLang(),
  ]);
  const description =
    pickI18nText(cfg.seo?.defaultDescription, lang, '') || FALLBACK_DESCRIPTION;
  const keywords = Array.isArray(cfg.seo?.keywords) ? cfg.seo.keywords : [];
  const ogImage = cfg.seo?.ogImage || cfg.basic?.logoImage || '';
  return {
    // BETTER_AUTH_URL 缺失时宁可不写 metadataBase，也不要兜底成 localhost：
    // 那会把 http://localhost:3000 当成站点根域去拼 og:image 的绝对地址，
    // 对爬虫来说是彻底无效的链接。缺失时 Next 只会在 dev 打一条 warning，
    // 相对路径的 og:image 由各社交平台按当前域解析。
    metadataBase: env.BETTER_AUTH_URL
      ? new URL(env.BETTER_AUTH_URL)
      : undefined,
    title: {
      default: siteName,
      template: `%s | ${siteName}`,
    },
    description,
    keywords: keywords.length > 0 ? keywords : undefined,
    // 不要在这里声明 icons：仓库里没有 public/favicon.ico，写死会让全站 favicon 404。
    // 交给 Next 的文件约定处理 —— src/app/icon.svg 会被自动输出为 /icon.svg
    // 并注入 <link rel="icon">（构建产物里可见 ○ /icon.svg）。
    openGraph: {
      type: 'website',
      siteName,
      locale: toOgLocale(lang),
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // html lang 此前硬编码 'en'，但站点默认语言是 zh-CN，会误导屏幕阅读器与搜索引擎
  const lang = await getDefaultLang();

  return (
    <html
      className={`${roboto.variable} ${robotoSerif.variable}`}
      lang={toHtmlLang(lang)}
    >
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
