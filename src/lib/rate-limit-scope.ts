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
 * `/api/auth/` 下的例外：这些端点**只有已登录才有意义**，按用户计数。
 *
 * 为什么必须开这个口子：get-session 挂在 admin-shell 上，而 admin-shell 包着
 * 每一个后台页面 —— 它是整个后台最高频的已登录请求。把它留在 IP 桶里，本次
 * 改动想解决的「一个 NAT 出口后面的人互相挤 429」就只解决了一半：tRPC 走开了，
 * 后台每翻一页仍然在消耗那 60 次/分钟的共享配额。
 *
 * 为什么开这个口子是安全的：按用户计数的前提是 resolveUserId 拿到了**验签通过**
 * 的 session。攻击者没有 session，一律回落到 IP 桶，暴力破解面没有被放宽。
 *
 * 为什么是白名单而不是黑名单：默认（IP 计数）是更严的那一侧，better-auth 将来
 * 新增任何端点都会自动落到默认分支上。反过来写的话，新增一个敏感端点会静默地
 * 进入宽松桶，而且没人会注意到。
 */
const USER_KEYED_AUTH_PATHS: ReadonlySet<string> = new Set([
  '/api/auth/get-session',
  '/api/auth/sign-out',
]);

/**
 * 该路径的全局限流是否应当在有登录态时改按 userId 计数。
 *
 * 只对 /api/* 生效；调用方需自己保证只对 API 路径调用（页面路由不限流）。
 */
export function shouldKeyByUser(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) return false;
  if (USER_KEYED_AUTH_PATHS.has(pathname)) return true;
  return !IP_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
