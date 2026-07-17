import { env } from '@/env';

// 信任策略：仅当 TRUST_PROXY_HEADERS=true 时才信任 x-real-ip / x-forwarded-for 末位。
// 这两个 header 由受信代理（nginx / CDN）写入，配置：
//   proxy_set_header X-Real-IP $remote_addr;
//   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
// X-Forwarded-For 末位是代理观测到的对端 IP；首位是客户端可伪造的值，不能用。
//
// 不信任时（默认）退化到 'unknown'：限流会落到全局共享桶，可能误伤合法用户，
// 但能防止攻击者直连 Next 进程时伪造 IP 绕过所有 IP 维度的防护。
export function getClientIp(req: Headers | { headers: Headers }): string {
  if (!env.TRUST_PROXY_HEADERS) return 'unknown';

  const headers = req instanceof Headers ? req : req.headers;
  const realIp = headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const parts = forwardedFor.split(',');
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }

  return 'unknown';
}
