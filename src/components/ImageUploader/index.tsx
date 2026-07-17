'use client';

import {
  DeleteOutlined,
  EditOutlined,
  FilePdfOutlined,
  LoadingOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { Upload } from 'antd';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

type AcceptType = 'image' | 'pdf';

interface ImageUploaderProps {
  /** 当前文件 URL */
  value: string | null | undefined;
  /** URL 变化回调（上传成功传 url，删除传 null） */
  onChange: (url: string | null) => void;
  /** 上传模块名，对应 /api/upload?module=xxx */
  module: string;
  /** 接收文件类型，默认 'image' */
  accept?: AcceptType;
  /** 最大文件大小（MB），默认图片 5、PDF 20 */
  maxSize?: number;
  /** 预览区域宽度，默认 240 */
  width?: number;
  /** 预览区域高度，默认 120 */
  height?: number;
  /** 占位文字 */
  placeholder?: string;
}

const ACCEPT_INPUT_MAP: Record<AcceptType, string> = {
  image: 'image/*',
  pdf: 'application/pdf,.pdf',
};

const DEFAULT_MAX_SIZE: Record<AcceptType, number> = {
  image: 5,
  pdf: 20,
};

function getFileNameFromUrl(url: string): string {
  try {
    const path = new URL(url, 'https://x').pathname;
    return decodeURIComponent(path.split('/').pop() ?? url);
  } catch {
    return url;
  }
}

export function ImageUploader({
  value,
  onChange,
  module,
  accept = 'image',
  maxSize,
  width = 240,
  height = 120,
  placeholder,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = maxSize ?? DEFAULT_MAX_SIZE[accept];
  const inputAccept = ACCEPT_INPUT_MAP[accept];
  const defaultPlaceholder =
    accept === 'pdf' ? '点击或拖拽上传 PDF' : '点击或拖拽上传图片';

  async function handleUpload(file: File) {
    if (file.size > limit * 1024 * 1024) {
      toast.error(`文件大小不能超过 ${limit}MB`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/upload?module=${module}&accept=${accept}`, {
        method: 'POST',
        body: fd,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? '上传失败');
        return;
      }
      onChange(data.url);
    } catch {
      toast.error('上传失败，请重试');
    } finally {
      setUploading(false);
    }
  }

  // 已有 PDF：显示文件名 + 操作
  if (value && accept === 'pdf') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          width,
          borderRadius: 8,
          border: '1px solid #d9d9d9',
        }}
      >
        <FilePdfOutlined style={{ fontSize: 20, color: '#d4380d' }} />
        <a
          href={value}
          rel="noreferrer"
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          target="_blank"
          title={value}
        >
          {getFileNameFromUrl(value)}
        </a>
        <input
          accept={inputAccept}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = '';
          }}
          ref={fileInputRef}
          style={{ display: 'none' }}
          type="file"
        />
        {uploading ? (
          <LoadingOutlined />
        ) : (
          <>
            <EditOutlined
              onClick={() => fileInputRef.current?.click()}
              style={{ cursor: 'pointer', color: '#1677ff' }}
              title="更换"
            />
            <DeleteOutlined
              onClick={() => onChange(null)}
              style={{ cursor: 'pointer', color: '#999' }}
              title="删除"
            />
          </>
        )}
      </div>
    );
  }

  // 已有图片：预览 + hover 遮罩
  // hover 状态挂在最外层容器，保证鼠标移出图片但还在容器内时遮罩不会粘住
  if (value) {
    return (
      // figure 是预览图的语义元素；hover 仅装饰性显示遮罩，键盘用户通过遮罩内图标按钮交互
      <figure
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          width,
          height,
          margin: 0,
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid #d9d9d9',
        }}
      >
        <img
          alt="preview"
          src={value}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <input
          accept={inputAccept}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
            e.target.value = '';
          }}
          ref={fileInputRef}
          style={{ display: 'none' }}
          type="file"
        />
        <div
          role="toolbar"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            background: 'rgba(0,0,0,0.45)',
            opacity: hovered || uploading ? 1 : 0,
            pointerEvents: hovered || uploading ? 'auto' : 'none',
            transition: 'opacity 0.2s',
          }}
        >
          {uploading ? (
            <LoadingOutlined style={{ fontSize: 24, color: '#fff' }} />
          ) : (
            <>
              <EditOutlined
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: 22, color: '#fff', cursor: 'pointer' }}
                title="更换图片"
              />
              <DeleteOutlined
                onClick={() => onChange(null)}
                style={{ fontSize: 22, color: '#fff', cursor: 'pointer' }}
                title="删除图片"
              />
            </>
          )}
        </div>
      </figure>
    );
  }

  // 无文件：拖拽上传区域
  return (
    <Upload.Dragger
      accept={inputAccept}
      beforeUpload={(file) => {
        void handleUpload(file);
        return false;
      }}
      disabled={uploading}
      showUploadList={false}
      style={{ width, height, padding: 0 }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height,
          color: '#999',
          fontSize: 13,
        }}
      >
        {uploading ? (
          <LoadingOutlined style={{ fontSize: 24, marginBottom: 8 }} />
        ) : accept === 'pdf' ? (
          <FilePdfOutlined style={{ fontSize: 24, marginBottom: 8 }} />
        ) : (
          <PlusOutlined style={{ fontSize: 24, marginBottom: 8 }} />
        )}
        <span>
          {uploading ? '上传中...' : (placeholder ?? defaultPlaceholder)}
        </span>
      </div>
    </Upload.Dragger>
  );
}
