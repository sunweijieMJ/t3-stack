import sanitizeHtml from 'sanitize-html';

/**
 * 富文本正文的服务端净化。
 *
 * 正文以 HTML 形式存库、并在门户以 dangerouslySetInnerHTML 渲染，因此净化
 * 必须发生在**写入侧**而不是渲染侧：渲染点会越来越多（列表摘要、详情页、
 * RSS、搜索结果），漏掉任何一处就是一个存储型 XSS；而写入口只有一个。
 *
 * 白名单而非黑名单：黑名单永远追不上绕过手法（大小写、实体编码、畸形标签等）。
 * 这里只放行排版需要的标签与属性，其余一律丢弃。
 *
 * 注意这不能替代前端渲染时的信任边界判断 —— 它保证的是「库里存的 HTML 不含
 * 可执行内容」，前提是所有写入都经过本函数。新增写入口时必须一并接上。
 */
export function sanitizeContentHtml(input: unknown): string {
  if (typeof input !== 'string' || input === '') return '';

  return sanitizeHtml(input, {
    allowedTags: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'p',
      'br',
      'hr',
      'blockquote',
      'pre',
      'code',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'del',
      'sub',
      'sup',
      'ul',
      'ol',
      'li',
      'a',
      'img',
      'figure',
      'figcaption',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'th',
      'td',
      'span',
      'div',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      // class 放行是为了让编辑器的对齐 / 高亮之类的样式类能存活；
      // style 不放行 —— 内联样式可以承载 expression()、position:fixed 覆盖全屏
      // 之类的花样，收益远小于风险，需要样式就走 class。
      '*': ['class'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
    },
    // 只放行 http/https/mailto/tel，堵死 javascript: 与 data: 伪协议。
    // data: 对 img 也不放行：data:text/html 在部分浏览器里可执行脚本，
    // 而正文里的图片都应该走 /api/upload 落到存储后端，没有内联 base64 的场景。
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    // script / style 的**内容**也要丢掉。默认行为只是移除标签，
    // 会把 `alert(1)` 这样的脚本体当作文本留在正文里。
    nonTextTags: ['script', 'style', 'textarea', 'noscript', 'iframe'],
    transformTags: {
      // 外链一律补 rel：target="_blank" 打开的页面可通过 window.opener
      // 把原页面导航到钓鱼站（reverse tabnabbing）。
      a: (tagName, attribs) => {
        const href = attribs.href ?? '';
        const isExternal = /^https?:\/\//i.test(href);
        return {
          tagName,
          attribs: isExternal
            ? { ...attribs, rel: 'noopener noreferrer' }
            : attribs,
        };
      },
    },
  });
}
