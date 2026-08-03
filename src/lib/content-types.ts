export interface ContentType {
  /** 出现在 URL 里的标识，如 /content/news */
  slug: string;
  /** 展示名称，用作门户列表页标题 */
  label: string;
}

// 与 router 里 content.slug 的规则一致：只允许小写字母、数字与连字符。
// 不放行大写是为了避免 /content/News 与 /content/news 指向同一批内容，
// 制造两个等价 URL（SEO 上的重复内容）。
const SLUG_RE = /^[a-z0-9-]+$/;

/**
 * 把配置里的内容类型收敛成可用清单。
 *
 * 逐项校验并丢弃不合格项，而不是整体抛错：数据来自 systemConfig 的 jsonb，
 * 一个填错的类型不该让整个门户白屏。重复 slug 只保留第一个 —— 后面那个
 * 无论如何都路由不到，留着只会让人以为它生效了。
 */
export function resolveContentTypes(raw: unknown): ContentType[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ContentType[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { slug, label } = item as { slug?: unknown; label?: unknown };
    if (typeof slug !== 'string' || typeof label !== 'string') continue;
    const s = slug.trim();
    const l = label.trim();
    if (!s || !l || !SLUG_RE.test(s) || seen.has(s)) continue;
    seen.add(s);
    out.push({ slug: s, label: l });
  }
  return out;
}

/**
 * 按 slug 查找类型，未配置的类型返回 null。
 *
 * 门户路由据此决定是否 404：不校验的话 /content/任意字符串 都会渲染出一个
 * 空列表页并把原始 slug 当标题显示，既是 SEO 垃圾页，也让「类型名打错」
 * 这种失误毫无提示 —— 类型拼错的内容永远不会出现在正确的列表页里，
 * 而错拼与正确的两个页面看起来都很正常。
 */
export function findContentType(
  types: readonly ContentType[],
  slug: string,
): ContentType | null {
  return types.find((t) => t.slug === slug) ?? null;
}
