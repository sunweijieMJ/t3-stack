import type { MetadataRoute } from 'next';
import { env } from '@/env';

// 必须按请求求值，理由同 robots.ts：本文件默认在 build 期预渲染且永不再生成，
// 而 Docker 构建阶段拿不到 BETTER_AUTH_URL，会把 localhost 固化进 <loc>。
export const dynamic = 'force-dynamic';

const BASE_URL = env.BETTER_AUTH_URL ?? 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1.0,
    },
  ];
}
