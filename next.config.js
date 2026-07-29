// 导入 env.js 以在启动/构建时触发环境变量校验（含跨字段的条件必填检查）
import './src/env.js';

const isDev = process.env.NODE_ENV === 'development';

/**
 * 内容安全策略。放在 next.config.js 而不是 vercel.json / nginx.conf，是为了让
 * Vercel、Docker+nginx、`next dev` 三种跑法共用同一份定义 —— 之前安全响应头在
 * vercel.json 与 nginx.conf 里各写一遍，改一处漏一处，且 `next dev` 完全没有。
 * （nginx 那边仍保留自己的一份：/uploads/ 与 /_next/static 由 nginx 直出，不经过 Next。）
 *
 * 几处放宽是有明确原因的，不是偷懒：
 *   - script-src 'unsafe-inline'：Next 的 App Router 会往 HTML 里塞 RSC flight 数据与
 *     bootstrap 内联脚本。要收紧必须改用 nonce，而 nonce 要求所有页面动态渲染，
 *     会把门户首页的 ISR 静态化收益全部抵消，代价大于收益。
 *   - style-src 'unsafe-inline'：antd 是 CSS-in-JS（运行时注入 <style>），
 *     framer-motion 与门户组件大量使用 style 属性，两者都受 style-src 约束。
 *   - img-src https:：Logo / OG 图可能存在任意 OSS 或 CDN 域名下（OSS_BASE_URL 可配），
 *     无法在构建期枚举。限定为 https: 至少堵住了 http 明文与非图片协议。
 *   - 'unsafe-eval' 仅在 dev 打开：Turbopack HMR 需要。生产实测无违规（见下方核对记录）。
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // WebSocket 是 dev 的 HMR 通道；生产只需同源 fetch（tRPC / better-auth / 上传）
  `connect-src 'self'${isDev ? ' ws: wss:' : ''}`,
  // three.js / drei 会用 blob: 创建 worker 与纹理
  "worker-src 'self' blob:",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
];

/** @type {import("next").NextConfig} */
const config = {
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // 接口不该被搜索引擎收录
      {
        source: '/api/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex' }],
      },
    ];
  },
  // standalone 是 Docker 部署的前提（Dockerfile 从 .next/standalone 拷贝产物）。
  // Vercel 自己接管产物打包，此时再产出一份 standalone 只是白白拖慢构建、增大缓存，
  // 官方也建议不要设置。VERCEL=1 由 Vercel 构建环境自动注入。
  output: process.env.VERCEL ? undefined : 'standalone',
  // ali-oss 含 Node.js 原生依赖，不能被 Turbopack 打包
  serverExternalPackages: ['ali-oss'],
  // 注意：这里原本有 images.remotePatterns（把 OSS_BASE_URL 解析成 next/image 白名单），
  // 但全项目没有任何地方用 next/image（ImageUploader 与门户都用原生 <img>），属于死配置，
  // 已移除。若将来改用 next/image 渲染 OSS 图片，需要重新加回 remotePatterns，
  // 否则会报 "hostname is not configured under images"。
};

export default config;
