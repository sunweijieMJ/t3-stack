import { env } from './src/env.js';

/**
 * @typedef {{ protocol: 'http' | 'https'; hostname: string }} RemotePattern
 */

// 把 OSS base URL 解析为 next/image 的 remotePatterns，
// 让管理员上传到对象存储的图片可以经 next/image 渲染。
/** @returns {RemotePattern[]} */
const buildRemotePatterns = () => {
  /** @type {string[]} */
  const urls = [env.OSS_BASE_URL].filter(
    /** @returns {v is string} */
    (v) => typeof v === 'string' && v.length > 0,
  );

  /** @type {RemotePattern[]} */
  const patterns = [];
  for (const raw of urls) {
    try {
      const u = new URL(raw);
      const protocol = u.protocol === 'http:' ? 'http' : 'https';
      patterns.push({
        protocol,
        hostname: u.hostname,
        // port/pathname 不限定，避免 CDN 子路径变化导致校验失败
      });
    } catch {
      // 无效 URL 跳过，由 env 校验层负责告警
    }
  }
  return patterns;
};

/** @type {import("next").NextConfig} */
const config = {
  output: 'standalone',
  // ali-oss 含 Node.js 原生依赖，不能被 Turbopack 打包
  serverExternalPackages: ['ali-oss'],
  images: {
    remotePatterns: buildRemotePatterns(),
  },
};

export default config;
