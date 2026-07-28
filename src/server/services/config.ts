import 'server-only';
import { eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { type FrontendConfig, mergeConfig } from '@/lib/frontend-config';
import { pickI18nText } from '@/lib/i18n-text';
import { db } from '@/server/db';
import { systemConfig } from '@/server/db/schema';

const FRONTEND_CONFIG_KEY = 'frontend';
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

export type SiteLang = 'zh-CN' | 'en-US';

const SUPPORTED_LANGS = new Set<SiteLang>(['zh-CN', 'en-US']);
const FALLBACK_LANG: SiteLang = 'zh-CN';

// basic.defaultLanguage 决定所有 i18n 字段（systemTitle / defaultTitle /
// defaultDescription）按哪种语言取值。此前这个配置项全项目零引用，而各调用点
// 各自硬编码语言（getSiteName 用 zh-CN、getPortalTitle 用 en-US），
// 导致后台顶栏和浏览器标题可能显示两种语言。
export async function getDefaultLang(): Promise<SiteLang> {
  const cfg = await getFrontendConfig();
  const raw = cfg.basic?.defaultLanguage;
  return typeof raw === 'string' && SUPPORTED_LANGS.has(raw as SiteLang)
    ? (raw as SiteLang)
    : FALLBACK_LANG;
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
