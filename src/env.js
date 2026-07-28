import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

/** Strip surrounding quotes that Docker --env-file preserves verbatim */
const stripQuotes = (/** @type {string | undefined} */ v) =>
  v?.replace(/^["']|["']$/g, '');

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    BETTER_AUTH_SECRET:
      process.env.NODE_ENV === 'production'
        ? z.string()
        : z.string().optional(),
    BETTER_AUTH_URL:
      process.env.NODE_ENV === 'production' ? z.url() : z.url().optional(),

    ADMIN_EMAILS: z.string().optional(),

    // 邮箱 SMTP
    SMTP_HOST: z.string().default('smtp.qq.com'),
    SMTP_PORT: z.coerce.number().int().default(465),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),

    // 限流（格式：「次数/窗口毫秒」）
    RATE_LIMIT_UPLOAD: z.string().default('5/60000'),
    RATE_LIMIT_GLOBAL_IP: z.string().default('60/60000'),
    // 登录/验证端点 IP 限流：仅防暴力，验证另有 allowedAttempts 兜底，阈值放宽避免误伤共享出口 IP
    RATE_LIMIT_AUTH_IP: z.string().default('20/60000'),
    // 验证码发送端点（有短信/邮件成本）单独限流，与验证端点分离，防止发送 1 次 + 验证 1 次就占满登录额度
    RATE_LIMIT_OTP_SEND: z.string().default('10/60000'),
    // 验证码校验端点：覆盖 better-auth 内置过严规则（默认 3次/60s），暴力破解由 allowedAttempts 兜底
    RATE_LIMIT_OTP_VERIFY: z.string().default('10/60000'),

    // 单个验证码允许的错误次数：better-auth 默认 3 太低，达到上限后验证码会被作废，
    // 之后即使输对也判「不正确」，必须重新获取——放宽以避免几次手误就触顶。
    OTP_ALLOWED_ATTEMPTS: z.coerce.number().int().positive().default(5),

    // 是否信任 X-Real-IP / X-Forwarded-For 头来推断客户端 IP。
    // 仅当请求一定经过受信代理（nginx / CDN）时才能为 true；否则攻击者可伪造 IP 绕过限流。
    TRUST_PROXY_HEADERS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // Redis 限流后端：设置后所有 rate-limiter 走 Redis（多实例共享计数）；
    // 未设置时退化为进程内 Map，启动会 warn。生产水平扩展必须设。
    // 示例：redis://default:password@host:6379/0 或 rediss://... (TLS)
    REDIS_URL: z.string().optional(),

    // 登录方式：email-password | email-otp
    // 运行时变量，通过服务端注入到客户端，改 .env 重启即可生效
    AUTH_METHOD: z.enum(['email-otp', 'email-password']).default('email-otp'),

    // 文件存储：local | oss
    STORAGE_PROVIDER: z.enum(['local', 'oss']).default('local'),
    // 阿里云 OSS（STORAGE_PROVIDER=oss 时必填）
    OSS_REGION: z.string().optional(),
    OSS_ACCESS_KEY_ID: z.string().optional(),
    OSS_ACCESS_KEY_SECRET: z.string().optional(),
    OSS_BUCKET: z.string().optional(),
    OSS_BASE_URL: z.string().optional(), // CDN 或自定义域名，不填则用默认 bucket 域名
  },

  client: {},

  runtimeEnv: {
    DATABASE_URL: stripQuotes(process.env.DATABASE_URL),
    NODE_ENV: stripQuotes(process.env.NODE_ENV),
    BETTER_AUTH_SECRET: stripQuotes(process.env.BETTER_AUTH_SECRET),
    BETTER_AUTH_URL: stripQuotes(process.env.BETTER_AUTH_URL),
    ADMIN_EMAILS: stripQuotes(process.env.ADMIN_EMAILS),
    SMTP_HOST: stripQuotes(process.env.SMTP_HOST),
    SMTP_PORT: stripQuotes(process.env.SMTP_PORT),
    SMTP_USER: stripQuotes(process.env.SMTP_USER),
    SMTP_PASS: stripQuotes(process.env.SMTP_PASS),
    RATE_LIMIT_UPLOAD: stripQuotes(process.env.RATE_LIMIT_UPLOAD),
    RATE_LIMIT_GLOBAL_IP: stripQuotes(process.env.RATE_LIMIT_GLOBAL_IP),
    RATE_LIMIT_AUTH_IP: stripQuotes(process.env.RATE_LIMIT_AUTH_IP),
    RATE_LIMIT_OTP_SEND: stripQuotes(process.env.RATE_LIMIT_OTP_SEND),
    RATE_LIMIT_OTP_VERIFY: stripQuotes(process.env.RATE_LIMIT_OTP_VERIFY),
    OTP_ALLOWED_ATTEMPTS: stripQuotes(process.env.OTP_ALLOWED_ATTEMPTS),
    TRUST_PROXY_HEADERS: stripQuotes(process.env.TRUST_PROXY_HEADERS),
    REDIS_URL: stripQuotes(process.env.REDIS_URL),
    AUTH_METHOD: stripQuotes(process.env.AUTH_METHOD),
    STORAGE_PROVIDER: stripQuotes(process.env.STORAGE_PROVIDER),
    OSS_REGION: stripQuotes(process.env.OSS_REGION),
    OSS_ACCESS_KEY_ID: stripQuotes(process.env.OSS_ACCESS_KEY_ID),
    OSS_ACCESS_KEY_SECRET: stripQuotes(process.env.OSS_ACCESS_KEY_SECRET),
    OSS_BUCKET: stripQuotes(process.env.OSS_BUCKET),
    OSS_BASE_URL: stripQuotes(process.env.OSS_BASE_URL),
  },

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

// ==================== 跨字段条件必填 ====================
// createEnv 只能逐字段校验，表达不了「打开某个开关后哪些变量才必填」。
// 这里补齐，目的是把故障提前到进程启动：
//   - 否则 SMTP 缺失要等第一个用户点「获取验证码」才在运行时抛错（登录直接不可用）
//   - OSS 配置缺失要等管理员上传图片才由 requireOssConfig() 抛错
// 跳过条件：
//   - SKIP_ENV_VALIDATION：构建期（Dockerfile）与单测，此时本就拿不到真实变量
//   - 浏览器环境：env 代理在客户端读取 server 段变量会直接抛错
if (typeof window === 'undefined' && !process.env.SKIP_ENV_VALIDATION) {
  /** @type {string[]} */
  const missing = [];

  // email-otp 模式的验证码只能靠邮件送达，生产环境缺 SMTP 等于登录功能不可用
  if (env.NODE_ENV === 'production' && env.AUTH_METHOD === 'email-otp') {
    if (!env.SMTP_USER)
      missing.push('SMTP_USER（AUTH_METHOD=email-otp 时必填）');
    if (!env.SMTP_PASS)
      missing.push('SMTP_PASS（AUTH_METHOD=email-otp 时必填）');
  }

  if (env.STORAGE_PROVIDER === 'oss') {
    if (!env.OSS_REGION)
      missing.push('OSS_REGION（STORAGE_PROVIDER=oss 时必填）');
    if (!env.OSS_ACCESS_KEY_ID)
      missing.push('OSS_ACCESS_KEY_ID（STORAGE_PROVIDER=oss 时必填）');
    if (!env.OSS_ACCESS_KEY_SECRET)
      missing.push('OSS_ACCESS_KEY_SECRET（STORAGE_PROVIDER=oss 时必填）');
    if (!env.OSS_BUCKET)
      missing.push('OSS_BUCKET（STORAGE_PROVIDER=oss 时必填）');
  }

  if (missing.length > 0) {
    throw new Error(
      `❌ 环境变量校验失败，以下变量在当前配置下必填:\n  - ${missing.join('\n  - ')}`,
    );
  }

  // 不抛错只告警：Next 进程直接暴露公网时 false 才是正确值，无法在这里判断拓扑。
  // 但本仓库自带的 compose + nginx 拓扑下 false 是个静默陷阱 —— getClientIp 恒返回
  // 'unknown'，于是全站 /api/* 共享同一个限流桶（默认 60 次/分钟），
  // 且审计日志的 ip_address 恒为 NULL。默认值保持 false 是出于安全考虑（宁可误伤
  // 也不能让人伪造 IP 绕过限流），代价是部署到代理后必须显式打开。
  if (env.NODE_ENV === 'production' && !env.TRUST_PROXY_HEADERS) {
    console.warn(
      '⚠️  TRUST_PROXY_HEADERS=false：所有 /api/* 请求将共享同一个限流桶，' +
        '审计日志也记不到真实 IP。若本服务位于 nginx / CDN 等受信代理之后，请设为 true。',
    );
  }
}
