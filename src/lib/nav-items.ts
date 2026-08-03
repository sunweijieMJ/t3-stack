import { isSafeInternalPath } from '@/lib/safe-path';

export interface NavItem {
  label: string;
  href: string;
}

/**
 * href 只放行两类：站内路径与 http(s) 外链。
 *
 * 导航项由管理员在后台自由填写，最终落进 `<a href>`。不做协议白名单的话，
 * `javascript:` / `data:` 这类可执行伪协议就能被写进页面。虽然只有管理员能写
 * （属于自我 XSS，低危），但堵住的成本几乎为零 —— 与 frontend-config 里
 * icpLink 的处理保持一致。
 *
 * 站内路径必须走 isSafeInternalPath 而不是 startsWith('/')：URL 解析会把
 * 反斜杠归一化成斜杠，`/\evil.test` 实际会跳到外站。
 */
function isSafeHref(href: string): boolean {
  if (isSafeInternalPath(href)) return true;
  try {
    const { protocol } = new URL(href);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 把配置里的导航项收敛成可安全渲染的列表。
 *
 * 数据来自 systemConfig 的 jsonb，历史数据、手工改库、schema 变更都可能让它
 * 不是预期形状，因此逐项校验并丢弃不合格的项，而不是整体抛错 —— 一个填错的
 * 导航项不该让整个门户白屏。
 */
export function resolveNavItems(raw: unknown): NavItem[] {
  if (!Array.isArray(raw)) return [];
  const out: NavItem[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { label, href } = item as { label?: unknown; href?: unknown };
    if (typeof label !== 'string' || typeof href !== 'string') continue;
    const trimmedLabel = label.trim();
    const trimmedHref = href.trim();
    if (!trimmedLabel || !trimmedHref) continue;
    if (!isSafeHref(trimmedHref)) continue;
    out.push({ label: trimmedLabel, href: trimmedHref });
  }
  return out;
}
