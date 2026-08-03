import { describe, expect, it } from 'vitest';
import { sanitizeContentHtml } from '@/lib/content-html';

describe('sanitizeContentHtml 保留正常排版', () => {
  it('保留常规富文本标签', () => {
    const html =
      '<h2>标题</h2><p><strong>粗</strong><em>斜</em></p><ul><li>项</li></ul>';

    expect(sanitizeContentHtml(html)).toBe(html);
  });

  it('保留表格结构', () => {
    const html = '<table><tbody><tr><td>单元格</td></tr></tbody></table>';

    expect(sanitizeContentHtml(html)).toBe(html);
  });

  it('保留图片及其 alt', () => {
    const html = '<img src="/uploads/portal/a.png" alt="示意图" />';

    const out = sanitizeContentHtml(html);

    expect(out).toContain('src="/uploads/portal/a.png"');
    expect(out).toContain('alt="示意图"');
  });
});

describe('sanitizeContentHtml 拦截脚本注入', () => {
  it('移除 script 标签及其内容', () => {
    const out = sanitizeContentHtml('<p>正文</p><script>alert(1)</script>');

    expect(out).toBe('<p>正文</p>');
    expect(out).not.toContain('alert');
  });

  it('移除内联事件处理器', () => {
    const out = sanitizeContentHtml('<p onclick="alert(1)">点我</p>');

    expect(out).toBe('<p>点我</p>');
  });

  it('移除 javascript: 伪协议链接', () => {
    const out = sanitizeContentHtml('<a href="javascript:alert(1)">链接</a>');

    expect(out).not.toContain('javascript:');
  });

  it('移除 iframe', () => {
    const out = sanitizeContentHtml(
      '<iframe src="https://evil.test"></iframe>',
    );

    expect(out).toBe('');
  });

  it('移除 style 标签，避免样式覆盖整站', () => {
    const out = sanitizeContentHtml(
      '<style>body{display:none}</style><p>正文</p>',
    );

    expect(out).toBe('<p>正文</p>');
  });

  it('移除 data: 伪协议图片', () => {
    const out = sanitizeContentHtml(
      '<img src="data:text/html,<script>alert(1)</script>" />',
    );

    expect(out).not.toContain('data:');
  });
});

describe('sanitizeContentHtml 处理外链', () => {
  it('给外链补 rel，避免 reverse tabnabbing', () => {
    const out = sanitizeContentHtml(
      '<a href="https://example.com" target="_blank">外链</a>',
    );

    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('保留站内相对链接', () => {
    const out = sanitizeContentHtml('<a href="/about">关于</a>');

    expect(out).toContain('href="/about"');
  });

  it('没有 href 的锚点不会因取值为空而出错', () => {
    expect(sanitizeContentHtml('<a>纯文本锚点</a>')).toBe('<a>纯文本锚点</a>');
  });
});

describe('sanitizeContentHtml 边界输入', () => {
  it('空字符串原样返回', () => {
    expect(sanitizeContentHtml('')).toBe('');
  });

  it('非字符串返回空串而不是抛错', () => {
    expect(sanitizeContentHtml(null)).toBe('');
    expect(sanitizeContentHtml(undefined)).toBe('');
    expect(sanitizeContentHtml(123)).toBe('');
  });
});
