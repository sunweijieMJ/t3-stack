import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

/** Strip surrounding quotes that Docker --env-file preserves verbatim */
const stripQuotes = (/** @type {string | undefined} */ v) =>
  v?.replace(/^["']|["']$/g, '');

/**
 * Vercel 上 BETTER_AUTH_URL 存在先有鸡还是先有蛋的问题：一键部署（Deploy Button）
 * 在首次构建前就要求填环境变量，而此时域名还没分配，用户根本填不出来。
 * 缺它又会因为 `NODE_ENV=production 时 z.url()` 直接构建失败。
 * 这里用 Vercel 注入的域名兜底（显式配置的 BETTER_AUTH_URL 始终优先）：
 *   - 生产：VERCEL_PROJECT_PRODUCTION_URL —— 稳定的生产域名，不随每次部署变化，
 *     用它签发的 cookie 与回调地址在多次部署之间保持一致。
 *   - 预览/开发：VERCEL_URL —— 本次部署的专属域名。不能在这里用生产域名，
 *     否则预览环境的登录回调会打到生产站上。
 * 两者都不带协议，Vercel 全站 HTTPS，补 https:// 即可。
 */
const vercelBaseUrl = () => {
  const host =
    process.env.VERCEL_ENV === 'production'
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_URL;
  return host ? `https://${host}` : undefined;
};

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    // 生产要求 ≥32 字符：这把密钥用于签名 session cookie，长度不够等于给伪造留门。
    // 之前只写 z.string()，`BETTER_AUTH_SECRET=abc` 也能过校验并正常启动。
    // 生成：openssl rand -base64 32
    BETTER_AUTH_SECRET:
      process.env.NODE_ENV === 'production'
        ? z
            .string()
            .min(
              32,
              'BETTER_AUTH_SECRET 至少 32 字符（openssl rand -base64 32）',
            )
        : z.string().optional(),
    BETTER_AUTH_URL:
      process.env.NODE_ENV === 'production' ? z.url() : z.url().optional(),

    ADMIN_EMAILS: z.string().optional(),

    // 定时任务鉴权口令（/api/cron/*）。Vercel 上配了它就会自动带
    // `Authorization: Bearer <值>` 调用 crons；不配则该端点直接 503。
    CRON_SECRET: z.string().optional(),

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
    //
    // 默认值随平台而定，而不是一律 false：
    //   - Vercel：函数永远跑在 Vercel 边缘代理之后，客户端无法直连，X-Forwarded-For
    //     由平台改写，伪造不了。这里默认 false 反而是纯粹的坑 —— 全站 /api/* 会挤进
    //     同一个 'unknown' 限流桶（默认 60 次/分钟），审计日志 IP 恒为 NULL。
    //   - 其他环境：保持 false。裸跑 Next（无反代）时 header 完全由客户端控制，
    //     必须由部署者显式确认拓扑后再打开（本仓库的 docker-compose 已设为 true）。
    TRUST_PROXY_HEADERS: z
      .enum(['true', 'false'])
      .default(process.env.VERCEL ? 'true' : 'false')
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
    // 用 || 而非 ??：emptyStringAsUndefined 的转换发生在 runtimeEnv 组装之后，
    // 空串走 ?? 不会触发兜底，仍会带着 '' 去撞 z.url() 校验。
    BETTER_AUTH_URL:
      stripQuotes(process.env.BETTER_AUTH_URL) || vercelBaseUrl(),
    ADMIN_EMAILS: stripQuotes(process.env.ADMIN_EMAILS),
    CRON_SECRET: stripQuotes(process.env.CRON_SECRET),
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
//   - SKIP_ENV_VALIDATION：Dockerfile 构建与单测，此时本就拿不到真实变量
//   - 浏览器环境：env 代理在客户端读取 server 段变量会直接抛错
//   - `next build` 构建期：见下方说明
//
// 为什么要放过构建期：SMTP / OSS 都是**纯运行时**依赖，编译产物一个字节都不依赖它们，
// 但 `next build` 会把 NODE_ENV 置为 production，于是这段检查在构建期也会触发。
// 后果是「想构建一次产物，先得把邮箱密码交给 CI」——Vercel 上尤其别扭：
// 一键部署时用户还没配 SMTP，首次构建直接红。CI 只能灌一组假值绕过
// （见 check-quality.yml），那这道校验在构建期本来也没验到任何真东西。
// 放过构建、保留启动：`next start` / standalone server.js 拉起时依旧 fail-fast。
//
// 判据为什么不用 NEXT_PHASE：Next 16 加载 next.config.js 时还没有设置它（实测为 undefined）。
// 退回到进程判据 —— next 官方入口脚本 + 子命令 build。构建期的静态生成跑在 worker
// 子进程里（argv 不同），所以父进程一旦判定就写回 process.env，让 worker 继承。
const NEXT_BIN_RE = /[\\/]next[\\/]dist[\\/]bin[\\/]next$/;
const isNextBuild =
  process.env.__NEXT_BUILD_PHASE === '1' ||
  (NEXT_BIN_RE.test(process.argv[1] ?? '') && process.argv[2] === 'build');
if (isNextBuild) process.env.__NEXT_BUILD_PHASE = '1';

if (
  typeof window === 'undefined' &&
  !process.env.SKIP_ENV_VALIDATION &&
  !isNextBuild
) {
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

  // Serverless（Vercel）与本项目默认值不兼容的两处，只告警不阻断：
  // 用不到上传、且能接受单实例限流的部署仍然是可用的，不该被拦住。
  if (process.env.VERCEL) {
    if (env.STORAGE_PROVIDER === 'local') {
      console.warn(
        '⚠️  Vercel 上 STORAGE_PROVIDER=local 不可用：函数文件系统只读且实例短暂，' +
          '后台上传 Logo / PDF 会失败。请设为 oss 并配齐 OSS_* 变量。',
      );
    }
    if (!env.REDIS_URL) {
      console.warn(
        '⚠️  Vercel 上未配置 REDIS_URL：限流退化为进程内计数，而 Serverless 每个实例' +
          '各算各的，限流几乎失效。请配置 Redis（Upstash 等）后端。',
      );
    }
  }
}
