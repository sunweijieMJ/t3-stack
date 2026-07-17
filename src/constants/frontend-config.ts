import type { FrontendSchema } from '@/lib/frontend-config';

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
        description: '登录后默认跳转的页面路径',
        defaultValue: '/admin',
      },
      defaultLanguage: {
        type: 'string',
        title: '默认语言',
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
          '门户与后台主题色，注入到 CSS 变量 --portal-primary 与 antd colorPrimary',
        inputType: 'color',
        defaultValue: '#ff6b3d',
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
