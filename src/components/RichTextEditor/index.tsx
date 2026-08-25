'use client';

import {
  BoldOutlined,
  FileImageOutlined,
  ItalicOutlined,
  LinkOutlined,
  LoadingOutlined,
  OrderedListOutlined,
  PictureOutlined,
  RedoOutlined,
  StrikethroughOutlined,
  UndoOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { App, Button, Divider, Select, Space, theme } from 'antd';
import { useEffect, useRef, useState } from 'react';

interface RichTextEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const HEADING_OPTIONS = [
  { value: 0, label: '正文' },
  { value: 1, label: '标题 1' },
  { value: 2, label: '标题 2' },
  { value: 3, label: '标题 3' },
];

/**
 * 与服务端 app/api/upload/route.ts 的 MAX_IMAGE_SIZE 保持一致。
 * 前端先拦一道只是为了省掉一次注定失败的往返（大图上传要等很久才收到 400），
 * 真正的把关在服务端 —— 这里改大不会让服务端放行。
 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * 正文插图走 module=content，不能用 portal。
 *
 * 权限点由模块决定（见 lib/upload-modules 的 MODULE_PERMISSIONS）：content 要
 * content.manage，portal 要 config.manage。写成 portal 的话，只有内容编辑权的
 * editor 传图会直接 403 —— 而写文章正是这个角色的全部工作。
 */
const UPLOAD_URL = '/api/upload?module=content&accept=image';

/**
 * 富文本正文编辑器。
 *
 * 只暴露服务端白名单（lib/content-html.ts）里放行的能力：加粗、斜体、删除线、
 * 标题、列表、引用、链接、图片。刻意不提供字体、字号、颜色、内联样式 ——
 * 这些产出的 style 属性会在写入时被净化掉，给了用户就是让人白做工，
 * 保存后发现格式丢失比一开始就没有这个按钮更糟。
 *
 * 作为受控组件使用：value 变化时同步回编辑器，但要先比对当前 HTML，
 * 否则每次 onChange 触发父组件重渲染都会重新 setContent，光标被打回开头。
 */
export function RichTextEditor({
  value = '',
  onChange,
  placeholder = '在此输入正文…',
  minHeight = 320,
}: RichTextEditorProps) {
  const { token } = theme.useToken();
  const { modal, message } = App.useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    // SSR 阶段不渲染：tiptap 会立即操作 DOM，服务端渲染出的结构与客户端
    // 首次渲染不一致，React 会报 hydration mismatch。
    immediatelyRender: false,
    extensions: [StarterKit, Link.configure({ openOnClick: false }), Image],
    content: value,
    onUpdate: ({ editor: e }) => onChange?.(e.getHTML()),
    editorProps: {
      attributes: {
        style: `min-height:${minHeight}px;padding:12px;outline:none;`,
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    // 只有外部值与编辑器当前内容真的不同才回灌，避免打断正在进行的输入
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) return null;

  const currentHeading =
    HEADING_OPTIONS.slice(1).find((h) =>
      editor.isActive('heading', { level: h.value }),
    )?.value ?? 0;

  /**
   * 上传一张图片并插入到光标处。
   *
   * 此前编辑器只有「粘贴图片地址」一条路，而 /api/upload 早就就绪 —— 写文章插图
   * 得先去别处传一遍再回来贴链接，属于漏改而非取舍（封面图那侧已经有 ImageUploader）。
   *
   * editor 在这里必然非空：调用点在 `if (!editor) return null` 之后，但闭包里拿到的
   * 是渲染时的实例，上传是异步的，所以仍然显式判一次再用。
   */
  async function uploadAndInsert(file: File) {
    if (file.size > MAX_IMAGE_BYTES) {
      message.error(
        `图片不能超过 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB`,
      );
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(UPLOAD_URL, { method: 'POST', body: fd });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        // 服务端的错误文案本身就是给人看的（格式不支持 / 超限 / 无权限 / 限流），
        // 直接透传比换成笼统的「上传失败」有用得多。
        message.error(data.error ?? '上传失败');
        return;
      }
      editor?.chain().focus().setImage({ src: data.url }).run();
    } catch {
      message.error('上传失败，请重试');
    } finally {
      setUploading(false);
    }
  }

  const promptFor = (title: string, onOk: (input: string) => void) => {
    let input = '';
    modal.confirm({
      title,
      content: (
        <input
          onChange={(e) => {
            input = e.target.value;
          }}
          placeholder="https://"
          style={{ width: '100%', padding: 6, marginTop: 8 }}
        />
      ),
      okText: '确定',
      cancelText: '取消',
      onOk: () => {
        const trimmed = input.trim();
        if (trimmed) onOk(trimmed);
      },
    });
  };

  return (
    <div
      style={{
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadius,
      }}
    >
      <Space
        size={2}
        style={{
          padding: 8,
          borderBottom: `1px solid ${token.colorBorder}`,
          flexWrap: 'wrap',
        }}
      >
        <Select
          onChange={(level) =>
            level === 0
              ? editor.chain().focus().setParagraph().run()
              : editor
                  .chain()
                  .focus()
                  .toggleHeading({ level: level as 1 | 2 | 3 })
                  .run()
          }
          options={HEADING_OPTIONS}
          size="small"
          style={{ width: 96 }}
          value={currentHeading}
        />
        <Divider type="vertical" />
        <Button
          icon={<BoldOutlined />}
          onClick={() => editor.chain().focus().toggleBold().run()}
          size="small"
          type={editor.isActive('bold') ? 'primary' : 'text'}
        />
        <Button
          icon={<ItalicOutlined />}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          size="small"
          type={editor.isActive('italic') ? 'primary' : 'text'}
        />
        <Button
          icon={<StrikethroughOutlined />}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          size="small"
          type={editor.isActive('strike') ? 'primary' : 'text'}
        />
        <Divider type="vertical" />
        <Button
          icon={<UnorderedListOutlined />}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          size="small"
          type={editor.isActive('bulletList') ? 'primary' : 'text'}
        />
        <Button
          icon={<OrderedListOutlined />}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          size="small"
          type={editor.isActive('orderedList') ? 'primary' : 'text'}
        />
        <Divider type="vertical" />
        <Button
          icon={<LinkOutlined />}
          onClick={() =>
            promptFor('插入链接', (href) =>
              editor.chain().focus().setLink({ href }).run(),
            )
          }
          size="small"
          type={editor.isActive('link') ? 'primary' : 'text'}
        />
        {/* 上传本地图片。两个图片按钮都保留：上传是主路径（图片进自己的存储，
            可控、可回收），贴 URL 仍然有用 —— 引用已有素材或外部图床时不必重传。
            没有 Tooltip，用原生 title 与工具栏其他按钮保持一致的轻量做法。 */}
        <input
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // 先清空再上传：不清的话同一张图第二次选中时 value 没变化，
            // onChange 根本不触发，用户会以为按钮坏了。
            e.target.value = '';
            if (file) void uploadAndInsert(file);
          }}
          ref={fileInputRef}
          style={{ display: 'none' }}
          type="file"
        />
        <Button
          disabled={uploading}
          icon={uploading ? <LoadingOutlined /> : <PictureOutlined />}
          onClick={() => fileInputRef.current?.click()}
          size="small"
          title="上传图片"
          type="text"
        />
        <Button
          icon={<FileImageOutlined />}
          onClick={() =>
            promptFor('插入图片地址', (src) =>
              editor.chain().focus().setImage({ src }).run(),
            )
          }
          size="small"
          title="按 URL 插入图片"
          type="text"
        />
        <Divider type="vertical" />
        <Button
          disabled={!editor.can().undo()}
          icon={<UndoOutlined />}
          onClick={() => editor.chain().focus().undo().run()}
          size="small"
          type="text"
        />
        <Button
          disabled={!editor.can().redo()}
          icon={<RedoOutlined />}
          onClick={() => editor.chain().focus().redo().run()}
          size="small"
          type="text"
        />
      </Space>
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}
