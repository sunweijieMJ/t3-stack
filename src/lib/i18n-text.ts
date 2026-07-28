export type I18nText = string | Record<string, string> | undefined | null;

/** 站点支持的语言。与 constants/frontend-config 里 basic.defaultLanguage 的 enumType 保持一致 */
export type SiteLang = 'zh-CN' | 'en-US';

const SUPPORTED_LANGS = new Set<SiteLang>(['zh-CN', 'en-US']);
export const FALLBACK_LANG: SiteLang = 'zh-CN';

// 放在这个「零依赖纯逻辑」模块里，是为了让服务端（services/config，带 server-only）
// 与客户端（AdminShell）共用同一份取值规则。此前 AdminShell 绕开它硬编码 'zh-CN'，
// 导致 defaultLanguage=en-US 时浏览器标题是英文、后台侧边栏却是中文。
export function resolveSiteLang(raw: unknown): SiteLang {
  return typeof raw === 'string' && SUPPORTED_LANGS.has(raw as SiteLang)
    ? (raw as SiteLang)
    : FALLBACK_LANG;
}

// 从多语言对象（或纯字符串）中挑出当前语言文案，按 lang → zh-CN → en-US → 任意值 → fallback 顺序回退
export function pickI18nText(
  text: I18nText,
  lang = 'zh-CN',
  fallback = '',
): string {
  if (!text) return fallback;
  if (typeof text === 'string') return text;
  return (
    text[lang] ||
    text['zh-CN'] ||
    text['en-US'] ||
    Object.values(text).find((v) => v) ||
    fallback
  );
}
