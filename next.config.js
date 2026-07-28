// 导入 env.js 以在启动/构建时触发环境变量校验（含跨字段的条件必填检查）
import './src/env.js';

/** @type {import("next").NextConfig} */
const config = {
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
