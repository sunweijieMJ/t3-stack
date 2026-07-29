import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRIMARY_COLOR,
  frontendConfigSchema,
} from '@/constants/frontend-config';
import {
  buildFrontendConfigZod,
  collectAssetUrls,
  extractDefaults,
  type FrontendSchema,
  mergeConfig,
} from '@/lib/frontend-config';

// 覆盖所有 JsonSchema 节点类型的测试 schema —— 真实的 frontendConfigSchema
// 只用到了其中一部分（没有 number / boolean / 对象数组）。
const testSchema = {
  demo: {
    type: 'object',
    title: 'Demo',
    properties: {
      plain: { type: 'string', title: 'plain', defaultValue: 'hi' },
      i18n: {
        type: 'string',
        title: 'i18n',
        inputType: 'i18n',
        defaultValue: { 'zh-CN': '中', 'en-US': 'en' },
      },
      choice: {
        type: 'string',
        title: 'choice',
        enumType: ['a', 'b'],
        defaultValue: 'a',
      },
      link: { type: 'string', title: 'link', inputType: 'url' },
      cover: { type: 'string', title: 'cover', inputType: 'image' },
      doc: { type: 'string', title: 'doc', inputType: 'file' },
      score: { type: 'number', title: 'score', min: 1, max: 10 },
      count: { type: 'number', title: 'count' },
      flag: { type: 'boolean', title: 'flag', defaultValue: true },
      tags: {
        type: 'array',
        title: 'tags',
        items: { type: 'string', title: 't' },
      },
      gallery: {
        type: 'array',
        title: 'gallery',
        items: {
          type: 'object',
          title: 'item',
          properties: {
            img: { type: 'string', title: 'img', inputType: 'image' },
            caption: { type: 'string', title: 'caption' },
          },
        },
      },
      nested: {
        type: 'object',
        title: 'nested',
        properties: {
          inner: { type: 'string', title: 'inner', defaultValue: 'x' },
        },
      },
    },
  },
} as unknown as FrontendSchema;

const parse = buildFrontendConfigZod(testSchema);

describe('extractDefaults', () => {
  it('递归展开嵌套 object 的默认值', () => {
    const defaults = extractDefaults(testSchema) as Record<string, any>;
    expect(defaults.demo.plain).toBe('hi');
    expect(defaults.demo.flag).toBe(true);
    expect(defaults.demo.nested).toEqual({ inner: 'x' });
  });

  it('未声明 defaultValue 的字段为 undefined', () => {
    const defaults = extractDefaults(testSchema) as Record<string, any>;
    expect(defaults.demo.cover).toBeUndefined();
  });
});

describe('mergeConfig', () => {
  it('空对象返回完整默认配置', () => {
    const cfg = mergeConfig({});
    // 断言对齐常量而不是写死色号：这里要验的是「schema 默认值能透传到 mergeConfig」，
    // 不是某个具体品牌色。写死的话，每次调主题色都会假阳性地挂一条测试。
    expect(cfg.basic?.primaryColor).toBe(DEFAULT_PRIMARY_COLOR);
    expect(cfg.footer?.icpLink).toBe('https://beian.miit.gov.cn/');
  });

  it('深合并：只覆盖传入的字段，同级其他字段保留默认值', () => {
    const cfg = mergeConfig({ basic: { primaryColor: '#000000' } } as never);
    expect(cfg.basic?.primaryColor).toBe('#000000');
    expect(cfg.basic?.defaultPage).toBe('/admin');
  });

  // 数组是整体替换而非按索引合并，否则删元素永远删不掉
  it('数组整体替换', () => {
    const cfg = mergeConfig({ seo: { keywords: ['a'] } } as never);
    expect(cfg.seo?.keywords).toEqual(['a']);
  });

  it('不修改 defaultFrontendConfig 本身', () => {
    mergeConfig({ basic: { primaryColor: '#123456' } } as never);
    expect(mergeConfig({}).basic?.primaryColor).toBe(DEFAULT_PRIMARY_COLOR);
  });
});

describe('buildFrontendConfigZod', () => {
  it('接受各类型的合法值', () => {
    const result = parse.safeParse({
      demo: {
        plain: 'text',
        i18n: { 'zh-CN': '中文' },
        choice: 'b',
        link: 'https://example.com',
        cover: '/uploads/portal/a.png',
        doc: 'https://cdn.example.com/uploads/portal/a.pdf',
        score: 5,
        count: -3,
        flag: false,
        tags: ['x', 'y'],
        gallery: [{ img: '/uploads/portal/b.png', caption: 'c' }],
        nested: { inner: 'v' },
      },
    });
    expect(result.success).toBe(true);
  });

  it('section 与字段都是 strict，未知 key 被拒绝', () => {
    expect(parse.safeParse({ unknownSection: {} }).success).toBe(false);
    expect(parse.safeParse({ demo: { unknownField: 1 } }).success).toBe(false);
  });

  it('所有字段可选，空对象合法', () => {
    expect(parse.safeParse({}).success).toBe(true);
    expect(parse.safeParse({ demo: {} }).success).toBe(true);
  });

  // 配置值会被直接渲染进 <a href> / <img src>，必须挡住可执行伪协议
  it('url 字段拒绝非 http(s) 协议', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      'not-a-url',
    ]) {
      expect(parse.safeParse({ demo: { link: bad } }).success).toBe(false);
    }
  });

  it('url 字段允许空串（表示未配置）', () => {
    expect(parse.safeParse({ demo: { link: '' } }).success).toBe(true);
  });

  // image / file 由 /api/upload 回填：local 存储回相对路径，OSS 回绝对 URL
  it('image 字段接受站内路径与 http(s) 链接', () => {
    expect(parse.safeParse({ demo: { cover: '/uploads/a.png' } }).success).toBe(
      true,
    );
    expect(
      parse.safeParse({ demo: { cover: 'https://cdn.example.com/a.png' } })
        .success,
    ).toBe(true);
  });

  it('image 字段拒绝协议相对 URL（//host 会被解析成跨域绝对地址）', () => {
    expect(
      parse.safeParse({ demo: { cover: '//evil.com/a.png' } }).success,
    ).toBe(false);
  });

  it('number 字段遵守 min / max', () => {
    expect(parse.safeParse({ demo: { score: 0 } }).success).toBe(false);
    expect(parse.safeParse({ demo: { score: 11 } }).success).toBe(false);
    expect(parse.safeParse({ demo: { score: 10 } }).success).toBe(true);
  });

  it('enum 字段拒绝枚举外的值', () => {
    expect(parse.safeParse({ demo: { choice: 'z' } }).success).toBe(false);
  });

  // 整份配置存在 systemConfig 的一行 jsonb 里，不限长单个字段就能撑爆它
  it('字符串长度有上限', () => {
    expect(parse.safeParse({ demo: { plain: 'a'.repeat(8193) } }).success).toBe(
      false,
    );
    expect(
      parse.safeParse({ demo: { link: `https://e.com/${'a'.repeat(2048)}` } })
        .success,
    ).toBe(false);
  });

  it('类型不匹配被拒绝', () => {
    expect(parse.safeParse({ demo: { flag: 'true' } }).success).toBe(false);
    expect(parse.safeParse({ demo: { tags: 'x' } }).success).toBe(false);
    expect(parse.safeParse({ demo: { i18n: 'plain string' } }).success).toBe(
      false,
    );
  });

  it('真实的 frontendConfigSchema 能校验通过自己的默认值', () => {
    const real = buildFrontendConfigZod(frontendConfigSchema);
    expect(real.safeParse(mergeConfig({})).success).toBe(true);
  });
});

describe('collectAssetUrls', () => {
  it('只收集 image / file 字段，跳过普通字符串与外链', () => {
    const urls = collectAssetUrls(testSchema, {
      demo: {
        plain: 'not-a-url',
        link: 'https://example.com',
        cover: '/uploads/portal/a.png',
        doc: '/uploads/portal/b.pdf',
      },
    });
    expect([...urls].sort()).toEqual([
      '/uploads/portal/a.png',
      '/uploads/portal/b.pdf',
    ]);
  });

  it('递归数组里的对象', () => {
    const urls = collectAssetUrls(testSchema, {
      demo: {
        gallery: [
          { img: '/uploads/portal/1.png' },
          { img: '/uploads/portal/2.png' },
          { caption: '没有图' },
        ],
      },
    });
    expect(urls).toEqual(
      new Set(['/uploads/portal/1.png', '/uploads/portal/2.png']),
    );
  });

  it('忽略空串与缺失字段', () => {
    expect(collectAssetUrls(testSchema, { demo: { cover: '' } }).size).toBe(0);
    expect(collectAssetUrls(testSchema, { demo: {} }).size).toBe(0);
  });

  it('非对象输入返回空集合', () => {
    expect(collectAssetUrls(testSchema, null).size).toBe(0);
    expect(collectAssetUrls(testSchema, 'string').size).toBe(0);
    expect(collectAssetUrls(testSchema, undefined).size).toBe(0);
  });

  it('数组字段拿到非数组值时不抛错', () => {
    expect(
      collectAssetUrls(testSchema, { demo: { gallery: 'oops' } }).size,
    ).toBe(0);
  });
});
