import { nanoid } from 'nanoid';
import { NextResponse } from 'next/server';

import { auth } from '@/server/better-auth';
import { isAdminEmail } from '@/server/services/admin-check';
import { uploadLimiter } from '@/server/services/rate-limiter';
import { uploadFile } from '@/server/services/storage';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_MODULES = ['portal', 'avatars', 'misc'] as const;
const ACCEPT_TYPES = ['image', 'pdf'] as const;
type AcceptType = (typeof ACCEPT_TYPES)[number];

type DetectedFile = { ext: string; mime: string; kind: AcceptType };

// 通过文件头魔术字节判断真实格式，不依赖客户端提供的 MIME type
function detectFileType(buffer: Buffer): DetectedFile | null {
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg', kind: 'image' };
  }
  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { ext: 'png', mime: 'image/png', kind: 'image' };
  }
  // WebP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { ext: 'webp', mime: 'image/webp', kind: 'image' };
  }
  // PDF: 25 50 44 46 2D ("%PDF-")
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return { ext: 'pdf', mime: 'application/pdf', kind: 'pdf' };
  }
  return null;
}

export async function POST(request: Request) {
  try {
    // 仅 admin 可上传：先校验登录态，再校验邮箱白名单
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    if (!isAdminEmail(session.user.email)) {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }
    const rateLimitKey = session.user.id;

    const rateCheck = await uploadLimiter.check(rateLimitKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: `上传过于频繁，请 ${Math.ceil(rateCheck.retryAfterMs / 1000)} 秒后重试`,
        },
        { status: 429 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    }

    const url = new URL(request.url);
    const acceptParam = url.searchParams.get('accept') ?? 'image';
    const accept = ACCEPT_TYPES.includes(acceptParam as AcceptType)
      ? (acceptParam as AcceptType)
      : 'image';

    const maxSize = accept === 'pdf' ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      return NextResponse.json(
        {
          error: `文件大小不能超过 ${Math.floor(maxSize / 1024 / 1024)}MB`,
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const detected = detectFileType(buffer);
    if (!detected || detected.kind !== accept) {
      return NextResponse.json(
        {
          error:
            accept === 'pdf'
              ? '仅支持 PDF 格式文件'
              : '仅支持 jpg/png/webp 格式图片',
        },
        { status: 400 },
      );
    }

    const moduleParam = url.searchParams.get('module') ?? 'misc';
    const module = ALLOWED_MODULES.includes(
      moduleParam as (typeof ALLOWED_MODULES)[number],
    )
      ? moduleParam
      : 'misc';

    const fileName = `${Date.now()}-${nanoid()}.${detected.ext}`;
    // PDF 强制下载（避免浏览器内联渲染 + 潜在 PDF JS 引擎风险）；图片仍内联展示
    const downloadName = detected.kind === 'pdf' ? file.name : undefined;
    const fileUrl = await uploadFile(
      module,
      fileName,
      buffer,
      detected.mime,
      downloadName,
    );

    return NextResponse.json({ url: fileUrl, name: file.name });
  } catch (err) {
    console.error('[upload] 失败', err);
    return NextResponse.json({ error: '上传失败，请重试' }, { status: 500 });
  }
}
