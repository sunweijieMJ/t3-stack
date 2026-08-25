/**
 * 决定某个 /api/* 请求的全局限流该按「用户」还是按「IP」计数。
 *
 * 拆成零依赖纯函数是为了能被单测钉住：这条判断一旦写反，后果是**安全方向**的 ——
 * 把登录端点也算进按用户的桶，等于让未登录的暴力破解绕开 IP 限流（没有 session
 * 时确实会回落到 IP，但只要判断逻辑本身写错，回落分支就不一定还成立了）。
 */

/**
 * 必须继续按 IP 计数的路径前缀。
 *
 * `/api/auth/` 是**登录前**的表面：此时还没有可信的用户身份，而它恰恰是暴力破解、
 * 撞库、验证码轰炸的目标，只能按来源 IP 收紧。这里放行成按用户计数是没有意义的
 * —— 攻击者本来就没有 session，真去查一次 session 只是白白多付一次开销。
 */
const IP_ONLY_PREFIXES = ['/api/auth/'] as const;

/**
 * 该路径的全局限流是否应当在有登录态时改按 userId 计数。
 *
 * 只对 /api/* 生效；调用方需自己保证只对 API 路径调用（页面路由不限流）。
 */
export function shouldKeyByUser(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false;
  return !IP_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
