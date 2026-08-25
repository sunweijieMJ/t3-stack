import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { permissionForAdminPath } from '@/lib/admin-menu';
import { shouldKeyByUser } from '@/lib/rate-limit-scope';
import { auth } from '@/server/better-auth';
import { userCan } from '@/server/services/admin-check';
import { getClientIp } from '@/server/services/get-client-ip';
import {
  authIpLimiter,
  globalIpLimiter,
  globalUserLimiter,
  otpSendLimiter,
} from '@/server/services/rate-limiter';

// /admin/* 路径需要登录且必须具备后台准入权限
const adminPatterns = [/^\/admin(\/|$)/];

// 有成本的验证码发送端点（邮件），单独严格限流
const OTP_SEND_PATHS = new Set(['/api/auth/email-otp/send-verification-otp']);

// 探活端点：豁免全部限流（见 proxy() 开头的说明）
const HEALTH_PATH = '/api/health';

function rateLimitResponse(retryAfterMs: number, message: string) {
  // 同时返回 message（better-auth 客户端读取此字段）、code 与 error（上传等接口读取 error），
  // 确保限流提示能被前端正确解析展示，而非回退成误导性的「验证码错误」。
  return NextResponse.json(
    { error: message, message, code: 'RATE_LIMITED' },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
    },
  );
}

/**
 * 取当前请求的登录用户 id；未登录、或解析失败时返回 null（调用方回落到按 IP 限流）。
 *
 * 必须真的验签，不能图省事直接拿 cookie 值当 key —— 那样谁都能随便编一串 cookie
 * 换一个全新的计数桶，限流形同虚设。
 *
 * 开销可接受：session 开了 cookieCache（见 better-auth/config.ts），命中期内
 * getSession 只做一次签名校验，不查库。这确实与 createTRPCContext 里那次
 * getSession 重复了一遍（React cache 跨不过 proxy → route handler 的边界），
 * 代价是一次 HMAC，换来的是限流不再被 NAT 出口 IP 绑死。
 *
 * 出错一律吞掉回落到 IP：限流不该成为整站不可用的单点。
 */
async function resolveUserId(request: NextRequest): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    return session?.user?.id ?? null;
  } catch (err) {
    console.error('[proxy] 限流身份解析失败，回落到按 IP 计数:', err);
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 健康检查必须早退，不能进入下面的全局 IP 限流：
  // docker healthcheck 直连 127.0.0.1:3000（不经 nginx），外部 LB 探活经 nginx 但
  // 该 location 也没有 X-Real-IP，两者的 getClientIp 都是 'unknown'，会挤在同一个
  // 共享桶里（默认 60 次/分钟）。探活频率一高就开始收 429 → compose 判定 unhealthy
  // → restart: on-failure 重启容器，现场表现为「应用不稳定」，排查方向被完全带偏。
  // 探活端点本身不该限流，它既无成本也无攻击价值（只做一次 SELECT 1）。
  if (pathname === HEALTH_PATH) return NextResponse.next();

  const ip = getClientIp(request);

  // API 全局限流：已登录按 userId，未登录按 IP。
  //
  // 为什么不能一律按 IP：整个办公室通常共用一个公网出口 IP，而
  // TRUST_PROXY_HEADERS=true 时 getClientIp 拿到的正是那个出口地址。于是
  // RATE_LIMIT_GLOBAL_IP（默认 60 次/分钟）变成**全公司共享**的配额 —— 后台又是
  // 重交互场景（多个 query + refetchOnWindowFocus），两三个人同时用就开始随机吃
  // 429，而每个人自己的操作频率都完全正常。这种故障几乎不可能从现场反推到限流。
  //
  // /api/auth/* 例外，仍然按 IP：那是登录前的表面，没有可信身份，也正是暴力破解
  // 的目标（见 lib/rate-limit-scope）。
  if (pathname.startsWith('/api/')) {
    const userId = shouldKeyByUser(pathname)
      ? await resolveUserId(request)
      : null;
    const globalCheck = userId
      ? await globalUserLimiter.check(userId)
      : await globalIpLimiter.check(ip);
    if (!globalCheck.allowed) {
      return rateLimitResponse(
        globalCheck.retryAfterMs,
        '请求过于频繁，请稍后再试',
      );
    }
  }

  // 验证码发送端点：严格限流（有邮件成本）
  if (OTP_SEND_PATHS.has(pathname)) {
    const sendCheck = await otpSendLimiter.check(ip);
    if (!sendCheck.allowed) {
      return rateLimitResponse(
        sendCheck.retryAfterMs,
        '验证码发送过于频繁，请稍后再试',
      );
    }
  }

  // 登录 / 验证端点：宽松限流（防暴力，但不误伤正常登录）。
  // 不含发送端点；验证另有 better-auth allowedAttempts 兜底，故阈值可宽松。
  if (pathname.startsWith('/api/auth/sign-in')) {
    const authCheck = await authIpLimiter.check(ip);
    if (!authCheck.allowed) {
      return rateLimitResponse(
        authCheck.retryAfterMs,
        '登录尝试过于频繁，请稍后再试',
      );
    }
  }

  // API 路由直接放行
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 页面认证保护：admin 路径必须登录且为 admin 角色
  if (adminPatterns.some((p) => p.test(pathname))) {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session) {
      const signinUrl = new URL('/signin', request.url);
      signinUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signinUrl);
    }

    if (!userCan(session.user, 'admin.access')) {
      // 送到说明页而不是首页：弹回首页看起来和「登录没成功」「跳转配错了」
      // 完全一样，用户拿不到任何线索。/no-access 不在本文件的 matcher 里，
      // 不会因为再次进入守卫而循环重定向。
      return NextResponse.redirect(new URL('/no-access', request.url));
    }

    // 再按具体页面所需的权限点拦一道：能进后台 ≠ 每个页面都能进。
    // editor 有 admin.access，但 /admin/users、/admin/setting、/admin/audit-logs
    // 都不该进得去。判定复用 ADMIN_MENU（见 lib/admin-menu 的说明），
    // 新增页面只要在那里登记就自动受保护。
    const pagePermission = permissionForAdminPath(pathname);
    if (pagePermission && !userCan(session.user, pagePermission)) {
      return NextResponse.redirect(new URL('/no-access', request.url));
    }
  }

  return NextResponse.next();
}

// 只匹配真正需要它的两类路径。
//
// 原来第一条是 '/((?!_next|_vercel|.*\\..*).*)' —— 匹配所有不含点号的路径，
// 也就是把门户首页（构建产物里是 ○ Static）也算进来了。而本文件顶部就 import 了
// better-auth，整条 drizzle + postgres 依赖链都会被打进 middleware bundle：
// 每一次静态首页访问都要先唤醒这个 Node 函数，Serverless 上还各带一次冷启动。
// 首页既不需要限流（不是 /api/）也不需要登录态，这笔开销是纯浪费。
//
// 收窄后 /admin/* 的路由守卫与 /api/* 的限流都不受影响（原来另外两条
// '/api/trpc/:path*'、'/api/upload' 本就被 '/api/:path*' 覆盖，属于冗余）。
// 注意：/api/health 仍会进 proxy，由函数开头的早退分支豁免限流。
// 单列一条 '/admin' 是有意的冗余：Next 16 编译出的 '/admin/:path*' 正则里
// 路径段部分是 `(?:\/(...))?`（见构建产物 functions-config-manifest.json），
// 确实覆盖了零段的裸 /admin。但这依赖 path-to-regexp 的量词语义，升级时静默变化
// 的话，后台首页会直接绕过路由守卫 —— admin/layout.tsx 那层兜底拿不到 pathname，
// 跳登录页时会丢掉 callbackUrl。多一条正则的代价可以忽略，留着。
export const config = {
  matcher: ['/admin', '/admin/:path*', '/api/:path*'],
};
