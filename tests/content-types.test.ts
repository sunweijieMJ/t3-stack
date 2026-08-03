import { describe, expect, it } from 'vitest';
import { findContentType, resolveContentTypes } from '@/lib/content-types';

describe('resolveContentTypes', () => {
  it('保留合法项', () => {
    expect(resolveContentTypes([{ slug: 'news', label: '新闻' }])).toEqual([
      { slug: 'news', label: '新闻' },
    ]);
  });

  it('去除首尾空白', () => {
    expect(resolveContentTypes([{ slug: ' news ', label: '  新闻 ' }])).toEqual(
      [{ slug: 'news', label: '新闻' }],
    );
  });

  it('剔除 slug 非法的项', () => {
    // slug 会直接进 URL，大写、空格、中文都不放行
    expect(
      resolveContentTypes([
        { slug: 'News', label: 'A' },
        { slug: 'a b', label: 'B' },
        { slug: '新闻', label: 'C' },
      ]),
    ).toEqual([]);
  });

  it('剔除缺少 slug 或 label 的项', () => {
    expect(
      resolveContentTypes([
        { slug: '', label: '新闻' },
        { slug: 'news', label: '' },
      ]),
    ).toEqual([]);
  });

  it('slug 重复时只保留第一个', () => {
    expect(
      resolveContentTypes([
        { slug: 'news', label: '新闻' },
        { slug: 'news', label: '资讯' },
      ]),
    ).toEqual([{ slug: 'news', label: '新闻' }]);
  });

  it('非数组或非对象元素不会导致抛错', () => {
    expect(resolveContentTypes(undefined)).toEqual([]);
    expect(resolveContentTypes('nope')).toEqual([]);
    expect(resolveContentTypes([null, 1, { slug: 'ok', label: '好' }])).toEqual(
      [{ slug: 'ok', label: '好' }],
    );
  });

  it('字段类型不对的项被剔除', () => {
    expect(resolveContentTypes([{ slug: 1, label: '新闻' }])).toEqual([]);
  });
});

describe('findContentType', () => {
  const types = [
    { slug: 'news', label: '新闻' },
    { slug: 'notice', label: '公告' },
  ];

  it('命中时返回该类型', () => {
    expect(findContentType(types, 'notice')).toEqual({
      slug: 'notice',
      label: '公告',
    });
  });

  it('未命中返回 null，供调用方渲染 404', () => {
    expect(findContentType(types, 'nope')).toBeNull();
  });

  it('大小写不同也算未命中，避免同一内容出现两个 URL', () => {
    expect(findContentType(types, 'News')).toBeNull();
  });
});
