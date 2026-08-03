'use client';

import {
  BoldOutlined,
  ItalicOutlined,
  LinkOutlined,
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
import { useEffect } from 'react';

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
  const { modal } = App.useApp();

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
        <Button
          icon={<PictureOutlined />}
          onClick={() =>
            promptFor('插入图片地址', (src) =>
              editor.chain().focus().setImage({ src }).run(),
            )
          }
          size="small"
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
