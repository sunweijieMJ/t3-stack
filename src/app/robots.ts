import type { MetadataRoute } from 'next';
import { env } from '@/env';

// 必须按请求求值：BASE_URL 来自运行时 env，而本文件默认会在 build 期被完整预渲染
// （prerender-manifest 里 revalidate=false，即永不再生成）。Docker 构建阶段没有
// BETTER_AUTH_URL（SKIP_ENV_VALIDATION=1），会把 localhost 兜底值固化进产物里。
export const dynamic = 'force-dynamic';

const BASE_URL = env.BETTER_AUTH_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
