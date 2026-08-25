import type { Metadata } from 'next';
import localFont from 'next/font/local';
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

/**
 * 字体自托管（src/fonts/*.woff2），不能改回 next/font/google。
 *
 * `next/font/google` 是**构建期**去 fonts.googleapis.com / fonts.gstatic.com
 * 抓字体的，而且生产构建下抓不到就直接失败：next 的 fetch-resource.js 只在
 * isDev 时给 3s 超时，google/loader.js 的 catch 也只有 isDev 分支才回落到
 * fallback 字体，否则原样 rethrow。内网 Jenkins / 离线 Docker 构建连不上
 * Google，`pnpm build` 会卡住然后红，且报错和「部署」这件事看起来毫无关系。
 *
 * 文件是从 Google Fonts 取的 latin 子集，与原来 subsets: ['latin'] 一致。
 * Roboto 是**可变字体** —— 原先声明的 300~900 共 7 个字重，Google 返回的是
 * 同一个 woff2（7 份 md5 完全相同），所以这里只放 normal / italic 两个文件，
 * 用 weight: '300 900' 覆盖整个区间，渲染结果与改动前一致，体积从 14 个文件
 * 约 554KB 降到 2 个文件约 79KB。
 *
 * adjustFontFallback 不能省：next/font/google 会自动按字体度量生成一份调整过
 * 的本地兜底字体来压 CLS，local 版本必须显式指定，否则字体加载完成的瞬间
 * 整页会跳一下。
 */
const roboto = localFont({
  src: [
    {
      path: '../fonts/roboto-variable-normal.woff2',
      weight: '300 900',
      style: 'normal',
    },
    {
      path: '../fonts/roboto-variable-italic.woff2',
      weight: '300 900',
      style: 'italic',
    },
  ],
  variable: '--font-roboto',
  display: 'swap',
  adjustFontFallback: 'Arial',
  fallback: ['system-ui', 'sans-serif'],
});

const robotoSerif = localFont({
  src: [
    {
      path: '../fonts/roboto-serif-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/roboto-serif-400-italic.woff2',
      weight: '400',
      style: 'italic',
    },
  ],
  variable: '--font-roboto-serif',
  display: 'swap',
  adjustFontFallback: 'Times New Roman',
  fallback: ['Georgia', 'serif'],
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
