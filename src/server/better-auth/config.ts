import type { BetterAuthPlugin } from 'better-auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { emailOTP } from 'better-auth/plugins';

import { env } from '@/env';
import { parseAuthMethod } from '@/lib/auth-methods';
import { db } from '@/server/db';
import { account, session, user, verification } from '@/server/db/auth-schema';
import { sendEmailOtp } from '@/server/services/email';
import { parseRateLimit } from '@/server/services/rate-limiter';

const useSecureCookies = env.BETTER_AUTH_URL?.startsWith('https://') ?? false;

// 将 env 中「次数/窗口毫秒」格式的限流配置转换为 better-auth customRules 所需的
// { window(秒), max } 结构（better-auth 的 window 单位为秒）。
function otpRule(value: string, defaultMax: number, defaultWindowMs: number) {
  const [max, windowMs] = parseRateLimit(value, defaultMax, defaultWindowMs);
  return { window: Math.ceil(windowMs / 1000), max };
}

const method = parseAuthMethod(env.AUTH_METHOD);

const plugins: BetterAuthPlugin[] = [];

if (method === 'email-otp') {
  plugins.push(
    emailOTP({
      async sendVerificationOTP({ email, otp }) {
        await sendEmailOtp(email, otp);
      },
      otpLength: 6,
      expiresIn: 600, // 10 分钟，留足邮件投递延迟余量
      // 允许的错误次数：插件默认 3 太低，手输验证码很容易因几次手误就触顶。
      // 注意：达到上限后插件会直接删除该验证码，之后即使输对也会判为「不正确」，
      // 必须重新获取——这正是「输错几次后输对仍报错」问题的根源，由 env 统一放宽。
      allowedAttempts: env.OTP_ALLOWED_ATTEMPTS,
    }),
  );
}

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : [],
  // emailAndPassword 始终启用：后台管理员通过 auth.api.signUpEmail() 内部调用创建账号。
  // 注意：不能用 disableSignUp 屏蔽公开注册——better-auth 的 disableSignUp 检查写在
  // handler 函数体内，auth.api.signUpEmail() 内部调用与公开 HTTP 端点共享同一份 handler，
  // 开了 disableSignUp 会导致内部调用也 100% 失败。公开注册改为在
  // src/app/api/auth/[...all]/route.ts 的 HTTP 层拦截 /sign-up/email，
  // 不影响服务端直接调用 auth.api.signUpEmail()。
  emailAndPassword: { enabled: true },
  session: {
    expiresIn: 60 * 60, // 1 小时过期
    updateAge: 5 * 60, // 活跃用户每 5 分钟自动续期
  },
  advanced: {
    useSecureCookies,
  },
  // 覆盖 better-auth 内置（生产默认开启）的 OTP 限流规则，阈值统一由 env 配置。
  // customRules 的 window 单位为「秒」，会覆盖插件自带规则，避免误伤正常用户。
  rateLimit: {
    customRules: {
      // 邮箱验证码校验：插件默认 3次/60s 过严，手输验证码很容易因输错耗尽额度而被锁，
      // 导致「先输错再输对」也被判为「操作太频繁」。暴力破解已由 allowedAttempts 与
      // proxy authIpLimiter 双重兜底，这里放宽。
      '/sign-in/email-otp': otpRule(env.RATE_LIMIT_OTP_VERIFY, 10, 60_000),
    },
  },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification },
  }),
  plugins,
});

export type Session = typeof auth.$Infer.Session;
