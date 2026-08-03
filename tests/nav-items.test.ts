import { describe, expect, it } from 'vitest';
import { resolveNavItems } from '@/lib/nav-items';

describe('resolveNavItems', () => {
  it('保留站内路径', () => {
    expect(resolveNavItems([{ label: '新闻', href: '/content/news' }])).toEqual(
      [{ label: '新闻', href: '/content/news' }],
    );
  });

  it('保留 http(s) 外链', () => {
    expect(
      resolveNavItems([{ label: '官网', href: 'https://a.test' }]),
    ).toEqual([{ label: '官网', href: 'https://a.test' }]);
  });

  it('剔除 javascript: 伪协议', () => {
    expect(
      resolveNavItems([{ label: '坏', href: 'javascript:alert(1)' }]),
    ).toEqual([]);
  });

  it('剔除会逃逸出本站的畸形路径', () => {
    expect(resolveNavItems([{ label: '坏', href: '/\\evil.test' }])).toEqual(
      [],
    );
  });

  it('剔除缺少名称或链接的项', () => {
    expect(
      resolveNavItems([
        { label: '', href: '/a' },
        { label: '有名无链', href: '' },
      ]),
    ).toEqual([]);
  });

  it('去除首尾空白', () => {
    expect(resolveNavItems([{ label: '  新闻  ', href: ' /news ' }])).toEqual([
      { label: '新闻', href: '/news' },
    ]);
  });

  it('剔除字段类型不对的项', () => {
    expect(
      resolveNavItems([
        { label: 123, href: '/a' },
        { label: '好', href: 456 },
      ]),
    ).toEqual([]);
  });

  it('非数组输入返回空列表而不是抛错', () => {
    expect(resolveNavItems(undefined)).toEqual([]);
    expect(resolveNavItems(null)).toEqual([]);
    expect(resolveNavItems('nope')).toEqual([]);
  });

  it('跳过数组里的非对象元素', () => {
    expect(resolveNavItems([null, 42, { label: '好', href: '/ok' }])).toEqual([
      { label: '好', href: '/ok' },
    ]);
  });
});
