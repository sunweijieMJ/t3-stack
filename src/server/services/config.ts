import 'server-only';
import { eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { type FrontendConfig, mergeConfig } from '@/lib/frontend-config';
import { pickI18nText, resolveSiteLang, type SiteLang } from '@/lib/i18n-text';
import { db } from '@/server/db';
import { systemConfig } from '@/server/db/schema';

// systemConfig 表里存放门户配置的行主键。读（本文件）与写（api/routers/page）
// 必须用同一个常量：各自硬编码字符串时，改一处漏一处会变成「存进去了但读不到」的静默故障。
export const FRONTEND_CONFIG_KEY = 'frontend';
const SITE_NAME_FALLBACK = 'Site';
// 跨请求缓存 tag —— admin 保存配置时通过 revalidateTag(FRONTEND_CONFIG_TAG) 立即失效
export const FRONTEND_CONFIG_TAG = 'frontend-config';

// 跨请求持久缓存的底层读取。tag 让 saveFrontendConfig 后通过 revalidateTag
// 立即失效；revalidate 60s 兜底（即使 admin 直接改库也会在 1 分钟内生效）。
// 注意：try/catch 必须放在 cached 函数 **外面**——否则 DB 抖动时的默认配置会被
// 缓存 60s，全站品牌/SEO/联系方式静默回退到默认值且无法立即恢复。
const readFrontendConfigCached = unstable_cache(
  async (): Promise<FrontendConfig> => {
    const row = await db
      .select({ value: systemConfig.value })
      .from(systemConfig)
      .where(eq(systemConfig.key, FRONTEND_CONFIG_KEY))
      .limit(1);
    const stored = row[0]?.value;
    return mergeConfig(
      typeof stored === 'object' && stored !== null
        ? (stored as Partial<FrontendConfig>)
        : {},
    );
  },
  ['frontend-config-v1'],
  { tags: [FRONTEND_CONFIG_TAG], revalidate: 60 },
);

// 服务端读取门户前端配置（systemConfig 表 key='frontend' 下的 JSONB），
// 与默认值合并后返回。React.cache 在单次请求内 dedupe；unstable_cache 跨请求持久化。
// 降级在外层完成：DB 失败 → 返回默认配置，但 **不** 进缓存，下次请求立刻重试。
export const getFrontendConfig = cache(async (): Promise<FrontendConfig> => {
  try {
    return await readFrontendConfigCached();
  } catch (error) {
    console.warn(
      '[config] getFrontendConfig 读取失败，已降级为默认配置:',
      error,
    );
    return mergeConfig({});
  }
});

// 取值规则本身放在 lib/i18n-text（零依赖纯逻辑），以便客户端组件也能共用同一份判断；
// 本文件带 server-only，客户端 import 不进来。
export type { SiteLang };

// basic.defaultLanguage 决定所有 i18n 字段（systemTitle / defaultTitle /
// defaultDescription）按哪种语言取值。此前这个配置项全项目零引用，而各调用点
// 各自硬编码语言（getSiteName 用 zh-CN、getPortalTitle 用 en-US），
// 导致后台顶栏和浏览器标题可能显示两种语言。
export async function getDefaultLang(): Promise<SiteLang> {
  const cfg = await getFrontendConfig();
  return resolveSiteLang(cfg.basic?.defaultLanguage);
}

// HTML lang 属性用的 BCP 47 标签：zh-CN 直接可用，en-US 惯例写 en。
export function toHtmlLang(lang: SiteLang): string {
  return lang === 'en-US' ? 'en' : lang;
}

// OpenGraph locale 用下划线形式。
export function toOgLocale(lang: SiteLang): string {
  return lang.replace('-', '_');
}

// 后台站点名（admin 顶栏、登录页 logo）。优先 basic.systemTitle，回退到 fallback。
// 不传 lang 时按 basic.defaultLanguage 取。
export async function getSiteName(lang?: SiteLang): Promise<string> {
  const [cfg, defaultLang] = await Promise.all([
    getFrontendConfig(),
    getDefaultLang(),
  ]);
  return pickI18nText(
    cfg.basic?.systemTitle,
    lang ?? defaultLang,
    SITE_NAME_FALLBACK,
  );
}

// 门户 SEO 标题。优先 seo.defaultTitle，缺失时回退 basic.systemTitle、再回退 fallback。
export async function getPortalTitle(lang?: SiteLang): Promise<string> {
  const [cfg, defaultLang] = await Promise.all([
    getFrontendConfig(),
    getDefaultLang(),
  ]);
  const l = lang ?? defaultLang;
  return pickI18nText(
    cfg.seo?.defaultTitle,
    l,
    pickI18nText(cfg.basic?.systemTitle, l, SITE_NAME_FALLBACK),
  );
}
