import type { MetadataRoute } from 'next';
import { env } from '@/env';
import {
  getContentTypes,
  listSitemapContent,
} from '@/server/services/content-public';

// 必须按请求求值，理由同 robots.ts：本文件默认在 build 期预渲染且永不再生成，
// 而 Docker 构建阶段拿不到 BETTER_AUTH_URL，会把 localhost 固化进 <loc>。
export const dynamic = 'force-dynamic';

const BASE_URL = env.BETTER_AUTH_URL ?? 'http://localhost:3000';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const home: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1.0,
    },
  ];

  // 内容部分整体降级：sitemap 是搜索引擎抓取的公开文件，数据库抖动时
  // 宁可只输出首页，也不能整个 500 —— 持续 5xx 会让搜索引擎降低抓取频率，
  // 影响远大于少收录几篇内容。
  try {
    const [types, rows] = await Promise.all([
      getContentTypes(),
      listSitemapContent(),
    ]);
    const known = new Set(types.map((t) => t.slug));

    const listPages: MetadataRoute.Sitemap = types.map((t) => ({
      url: `${BASE_URL}/content/${t.slug}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    }));

    // 过滤掉类型未登记的内容：那些详情页会 404，收录进来只会制造死链。
    const detailPages: MetadataRoute.Sitemap = rows
      .filter((r) => known.has(r.type))
      .map((r) => ({
        url: `${BASE_URL}/content/${r.type}/${r.slug}`,
        lastModified: r.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.6,
      }));

    return [...home, ...listPages, ...detailPages];
  } catch (error) {
    console.warn('[sitemap] 读取内容失败，仅输出首页:', error);
    return home;
  }
}
