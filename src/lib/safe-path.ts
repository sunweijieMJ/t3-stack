/**
 * 站内相对路径白名单校验（防开放重定向 / 跨域资源注入）。
 *
 * 两个调用点共用同一份实现，避免各写一份而只有其中一份被加固：
 *   - signin-form 的 callbackUrl（攻击者可控的查询串）与 defaultPage（后台配置）
 *   - frontend-config 的 image / file 字段（/api/upload 回填的站内路径）
 *
 * 为什么不能只判断 `startsWith('/') && !startsWith('//')`：
 * URL 解析器在解析前会把反斜杠归一化成 `/`，并剥掉 tab / 换行，于是
 *   "/\evil.com"   → http://evil.com/
 *   "/<TAB>/evil.com" → http://evil.com/
 * 都会变成跨域绝对地址，而上面那种字符串前缀判断一个都拦不住。
 * 所以这里直接用 URL 解析后的 origin 作为判据 —— 归一化后仍落在本 origin 才算站内。
 */

// 任意不可能与真实站点重合的 origin：只用来当解析基准，不会出现在结果里。
// .invalid 是 RFC 2606 保留的顶级域，永远不会被真实注册。
const PROBE_ORIGIN = 'http://internal.invalid';

/**
 * 是否为安全的站内相对路径（必须 / 开头，且归一化后不逃逸出当前 origin）。
 * 写成类型谓词，让 safeInternalPath 能把 undefined 收窄掉。
 */
export function isSafeInternalPath(
  value: string | null | undefined,
): value is string {
  if (!value?.startsWith('/')) return false;
  try {
    return new URL(value, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
}

/** 安全则原样返回，否则返回 null，便于 `?? fallback` 串联 */
export function safeInternalPath(
  value: string | null | undefined,
): string | null {
  return isSafeInternalPath(value) ? value : null;
}
