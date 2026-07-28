import { describe, expect, it } from 'vitest';
import { isSafeInternalPath, safeInternalPath } from '@/lib/safe-path';

describe('isSafeInternalPath', () => {
  it('放行普通站内路径', () => {
    expect(isSafeInternalPath('/')).toBe(true);
    expect(isSafeInternalPath('/admin')).toBe(true);
    expect(isSafeInternalPath('/admin/audit-logs')).toBe(true);
    expect(isSafeInternalPath('/uploads/portal/logo.png')).toBe(true);
  });

  it('放行带查询串与 hash 的站内路径', () => {
    expect(isSafeInternalPath('/admin?tab=1#top')).toBe(true);
  });

  it('空值一律拒绝', () => {
    expect(isSafeInternalPath(null)).toBe(false);
    expect(isSafeInternalPath(undefined)).toBe(false);
    expect(isSafeInternalPath('')).toBe(false);
  });

  it('拒绝绝对 URL 与伪协议', () => {
    expect(isSafeInternalPath('http://evil.com')).toBe(false);
    expect(isSafeInternalPath('https://evil.com/admin')).toBe(false);
    expect(isSafeInternalPath('javascript:alert(1)')).toBe(false);
    expect(isSafeInternalPath('admin')).toBe(false);
  });

  it('拒绝协议相对 URL', () => {
    expect(isSafeInternalPath('//evil.com')).toBe(false);
  });

  // 回归用例：旧实现只判断 startsWith('//')，下面这些在 URL 归一化后
  // 同样会逃逸到外站，构成开放重定向。
  it('拒绝反斜杠形式的协议相对 URL（归一化绕过）', () => {
    expect(isSafeInternalPath('/\\evil.com')).toBe(false);
    expect(isSafeInternalPath('/\\\\evil.com')).toBe(false);
    expect(isSafeInternalPath('\\\\evil.com')).toBe(false);
  });

  it('拒绝借 tab / 换行拆分的协议相对 URL（归一化绕过）', () => {
    expect(isSafeInternalPath('/\t/evil.com')).toBe(false);
    expect(isSafeInternalPath('/\n/evil.com')).toBe(false);
  });

  it('百分号编码的反斜杠是普通路径字符，不逃逸，应放行', () => {
    expect(isSafeInternalPath('/%5C/evil.com')).toBe(true);
  });

  // '//[' 会被当成未闭合的 IPv6 authority，令 new URL 抛错；
  // 解析不出来的输入一律按不安全处理，不能漏到调用方。
  it('URL 解析失败时判定为不安全', () => {
    expect(isSafeInternalPath('//[')).toBe(false);
  });
});

describe('safeInternalPath', () => {
  it('安全时原样返回，便于 ?? 串联兜底', () => {
    expect(safeInternalPath('/admin')).toBe('/admin');
  });

  it('不安全时返回 null', () => {
    expect(safeInternalPath('/\\evil.com')).toBeNull();
    expect(safeInternalPath('https://evil.com')).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
  });
});
