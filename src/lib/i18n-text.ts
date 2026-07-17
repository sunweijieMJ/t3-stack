export type I18nText = string | Record<string, string> | undefined | null;

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
