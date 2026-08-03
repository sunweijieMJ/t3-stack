import type { FrontendSchema } from '@/lib/frontend-config';

/**
 * 主题色兜底值。此前门户 layout / antd provider / 登录页各写一份 '#ff6b3d'，
 * 改一处漏三处；同时首页 SCSS 又硬编码了另一个绿色，配置项等于对门户完全无效。
 * 现在统一到这一个常量 + 一条 CSS 变量链：
 *   basic.primaryColor → --portal-primary → 首页 SCSS / 登录页 --accent / antd colorPrimary
 */
export const DEFAULT_PRIMARY_COLOR = '#00a852';

export const frontendConfigSchema = {
  basic: {
    type: 'object',
    title: '基础配置',
    properties: {
      systemTitle: {
        type: 'string',
        title: '系统标题',
        description: '显示在头部和浏览器标签页的系统名称，支持多语言配置',
        inputType: 'i18n',
        defaultValue: { 'zh-CN': '管理系统', 'en-US': 'Management System' },
      },
      defaultPage: {
        type: 'string',
        title: '默认页面',
        description:
          '登录后默认跳转的页面路径（须以 / 开头）。若登录链接自带 callbackUrl，则以 callbackUrl 优先',
        defaultValue: '/admin',
      },
      defaultLanguage: {
        type: 'string',
        title: '默认语言',
        description:
          '决定站点标题、SEO 描述等多语言字段按哪种语言取值，同时决定 html lang 与 og:locale',
        enumType: ['zh-CN', 'en-US'],
        defaultValue: 'zh-CN',
      },
      logoImage: {
        type: 'string',
        title: 'Logo',
        description: '上传系统 Logo 图片，存储为 URL',
        inputType: 'image',
        uploadModule: 'portal',
        defaultValue: '',
      },
      primaryColor: {
        type: 'string',
        title: '主题色',
        description:
          '全站强调色，注入到 CSS 变量 --portal-primary 与 antd colorPrimary，门户首页、登录页、后台三处同时生效',
        inputType: 'color',
        defaultValue: DEFAULT_PRIMARY_COLOR,
      },
    },
  },
  content: {
    type: 'object',
    title: '内容类型',
    description:
      '门户可访问的内容类型；未在此登记的类型，其列表页与详情页一律 404',
    properties: {
      types: {
        type: 'array',
        title: '类型清单',
        description:
          '标识只能用小写字母、数字和连字符，会直接出现在 URL 中（/content/<标识>）',
        span: 24,
        items: {
          type: 'object',
          title: '类型',
          properties: {
            slug: { type: 'string', title: '标识', defaultValue: '' },
            label: { type: 'string', title: '名称', defaultValue: '' },
          },
        },
        defaultValue: [],
      },
    },
  },
  nav: {
    type: 'object',
    title: '导航菜单',
    description: '门户顶部导航；不配置则不显示导航栏',
    properties: {
      items: {
        type: 'array',
        title: '菜单项',
        description:
          '链接支持站内路径（以 / 开头，如 /content/news）与 http(s) 外链；其他协议会被丢弃',
        span: 24,
        items: {
          type: 'object',
          title: '菜单项',
          properties: {
            label: {
              type: 'string',
              title: '名称',
              defaultValue: '',
            },
            href: {
              type: 'string',
              title: '链接',
              defaultValue: '',
            },
          },
        },
        defaultValue: [],
      },
    },
  },
  seo: {
    type: 'object',
    title: 'SEO 配置',
    description: '门户站默认元信息，被各页面 metadata 继承',
    properties: {
      defaultTitle: {
        type: 'string',
        title: '默认标题',
        description: '当页面没有自己的 title 时使用，支持多语言',
        inputType: 'i18n',
        defaultValue: { 'zh-CN': '', 'en-US': '' },
      },
      defaultDescription: {
        type: 'string',
        title: '默认描述',
        description: 'meta description / OpenGraph description',
        inputType: 'i18n',
        defaultValue: { 'zh-CN': '', 'en-US': '' },
        span: 24,
      },
      keywords: {
        type: 'array',
        title: '关键词',
        description: '回车添加，将作为 meta keywords 输出',
        items: { type: 'string', title: '关键词' },
        defaultValue: [],
        span: 24,
      },
      ogImage: {
        type: 'string',
        title: 'OG Image',
        description: '社交分享时使用的预览图，建议 1200x630',
        inputType: 'image',
        uploadModule: 'portal',
        defaultValue: '',
        span: 24,
      },
    },
  },
  footer: {
    type: 'object',
    title: '页脚配置',
    description: '门户页脚展示信息',
    properties: {
      tagline: {
        type: 'string',
        title: 'Slogan',
        defaultValue: '',
      },
      address: {
        type: 'string',
        title: '地址',
        description: '支持换行（输入 \\n 或多行文本）',
        inputType: 'textarea',
        defaultValue: '',
        span: 24,
      },
      copyright: {
        type: 'string',
        title: '版权信息',
        defaultValue: '© 2026. All Rights Reserved.',
        span: 24,
      },
      icp: {
        type: 'string',
        title: 'ICP 备案号',
        description: '中国大陆访问需要展示',
        defaultValue: '',
      },
      icpLink: {
        type: 'string',
        title: 'ICP 链接',
        inputType: 'url',
        defaultValue: 'https://beian.miit.gov.cn/',
      },
    },
  },
  social: {
    type: 'object',
    title: '社交媒体',
    description: '展示在页脚的社交链接，留空则不显示',
    properties: {
      email: {
        type: 'string',
        title: '联系邮箱',
        description: '页脚 mailto 链接的邮箱地址',
        defaultValue: '',
      },
      linkedin: {
        type: 'string',
        title: 'LinkedIn',
        inputType: 'url',
        defaultValue: '',
      },
      x: {
        type: 'string',
        title: 'X / Twitter',
        inputType: 'url',
        defaultValue: '',
      },
      youtube: {
        type: 'string',
        title: 'YouTube',
        inputType: 'url',
        defaultValue: '',
      },
      weibo: {
        type: 'string',
        title: '微博',
        inputType: 'url',
        defaultValue: '',
      },
    },
  },
} as const satisfies FrontendSchema;
