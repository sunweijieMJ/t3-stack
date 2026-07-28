import 'server-only';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '@/env';

/**
 * 上传文件到配置的存储后端（local / OSS）。
 * 返回文件的公开访问 URL。
 *
 * downloadName 为 PDF 等需要"下载而非内联打开"的场景指定，会被写入
 * Content-Disposition: attachment header，让浏览器走下载流程而不是直接渲染。
 *
 * 注意：downloadName 只对 oss 分支有意义。local 分支下文件是被 nginx（生产）或
 * Next 的静态服务（dev）直接吐出来的，这里根本没有机会写响应头，所以
 * uploadToLocal 不接收该参数 —— 强制下载由 nginx.conf 里 /uploads/ 下的
 * `location ~* \.pdf$` 补 Content-Disposition 实现。
 * 唯一的缺口是 `next dev`（不经 nginx），本地开发时 PDF 仍会内联打开。
 */
export async function uploadFile(
  module: string,
  fileName: string,
  buffer: Buffer,
  contentType: string,
  downloadName?: string,
): Promise<string> {
  const key = `uploads/${module}/${fileName}`;
  switch (env.STORAGE_PROVIDER) {
    case 'oss':
      return uploadToOss(key, buffer, contentType, downloadName);
    default:
      return uploadToLocal(module, fileName, buffer);
  }
}

// 按 RFC 5987 编码非 ASCII 文件名，让 Content-Disposition 在所有浏览器都正确显示
function buildContentDisposition(downloadName: string): string {
  const ascii = downloadName.replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(downloadName).replace(/['()]/g, escape);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function uploadToLocal(
  module: string,
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const uploadDir = join(process.cwd(), 'public', 'uploads', module);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, fileName), buffer);
  return `/uploads/${module}/${fileName}`;
}

/**
 * 从 URL 中解析出存储 key（uploads/<module>/<file>）。
 * 同时兼容 OSS 的绝对 URL 与 local 的相对路径 /uploads/...。
 * 不属于本系统上传的外链返回 null（避免误删第三方资源）。
 */
function parseStorageKey(url: string): string | null {
  if (!url) return null;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  const stripped = pathname.replace(/^\//, '');
  return stripped.startsWith('uploads/') ? stripped : null;
}

/**
 * 删除上传时产生的对象。仅识别本系统的 uploads/ 前缀路径，避免误删外链。
 * 删除失败仅记日志：旧图泄漏的损失远小于"误删导致页面图崩"。
 */
export async function deleteFile(
  url: string | null | undefined,
): Promise<void> {
  if (!url) return;
  const key = parseStorageKey(url);
  if (!key) return;

  try {
    switch (env.STORAGE_PROVIDER) {
      case 'oss': {
        const { accessKeyId, accessKeySecret, bucket, region } =
          requireOssConfig();
        const OSS = (await import('ali-oss')).default;
        const client = new OSS({
          region,
          accessKeyId,
          accessKeySecret,
          bucket,
        });
        await client.delete(key);
        return;
      }
      default: {
        const fullPath = join(process.cwd(), 'public', key);
        await unlink(fullPath).catch((err) => {
          if (err?.code !== 'ENOENT') throw err;
        });
        return;
      }
    }
  } catch (err) {
    console.error(`[storage] deleteFile failed for ${key}:`, err);
  }
}

/**
 * 旧 URL 与新 URL 不同时异步删除旧文件。fire-and-forget，不阻塞业务。
 * 用于 adminUpdate 场景：替换封面图时清理被替换的旧图。
 */
export function deleteFileIfChanged(
  oldUrl: string | null | undefined,
  newUrl: string | null | undefined,
): void {
  if (oldUrl && oldUrl !== newUrl) {
    void deleteFile(oldUrl);
  }
}

async function uploadToOss(
  key: string,
  buffer: Buffer,
  contentType: string,
  downloadName?: string,
): Promise<string> {
  const { region, accessKeyId, accessKeySecret, bucket, baseUrl } =
    requireOssConfig();
  const OSS = (await import('ali-oss')).default;
  const client = new OSS({ region, accessKeyId, accessKeySecret, bucket });
  // OSS SDK 透传 headers，Content-Disposition 让浏览器走下载流程而非内联
  const headers: Record<string, string> = downloadName
    ? { 'Content-Disposition': buildContentDisposition(downloadName) }
    : {};
  await client.put(key, buffer, { mime: contentType, headers });
  const base = baseUrl ?? `https://${bucket}.${region}.aliyuncs.com`;
  return `${base}/${key}`;
}

function requireOssConfig() {
  const {
    OSS_REGION,
    OSS_ACCESS_KEY_ID,
    OSS_ACCESS_KEY_SECRET,
    OSS_BUCKET,
    OSS_BASE_URL,
  } = env;
  if (
    !OSS_REGION ||
    !OSS_ACCESS_KEY_ID ||
    !OSS_ACCESS_KEY_SECRET ||
    !OSS_BUCKET
  ) {
    throw new Error(
      'STORAGE_PROVIDER=oss 时必须配置 OSS_REGION / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET',
    );
  }
  return {
    region: OSS_REGION,
    accessKeyId: OSS_ACCESS_KEY_ID,
    accessKeySecret: OSS_ACCESS_KEY_SECRET,
    bucket: OSS_BUCKET,
    baseUrl: OSS_BASE_URL,
  };
}
