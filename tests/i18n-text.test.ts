import { describe, expect, it } from 'vitest';
import { FALLBACK_LANG, pickI18nText, resolveSiteLang } from '@/lib/i18n-text';

describe('pickI18nText', () => {
  it('纯字符串直接返回', () => {
    expect(pickI18nText('管理系统')).toBe('管理系统');
  });

  it('null / undefined / 空串返回 fallback', () => {
    expect(pickI18nText(undefined, 'zh-CN', 'Site')).toBe('Site');
    expect(pickI18nText(null, 'zh-CN', 'Site')).toBe('Site');
    expect(pickI18nText('', 'zh-CN', 'Site')).toBe('Site');
  });

  it('命中请求的语言', () => {
    const text = { 'zh-CN': '管理系统', 'en-US': 'Management System' };
    expect(pickI18nText(text, 'en-US')).toBe('Management System');
    expect(pickI18nText(text, 'zh-CN')).toBe('管理系统');
  });

  // 回退链：lang → zh-CN → en-US → 任意非空值 → fallback
  it('请求的语言缺失时回退到 zh-CN', () => {
    expect(pickI18nText({ 'zh-CN': '管理系统' }, 'ja-JP')).toBe('管理系统');
  });

  it('zh-CN 也缺失时回退到 en-US', () => {
    expect(pickI18nText({ 'en-US': 'Management System' }, 'ja-JP')).toBe(
      'Management System',
    );
  });

  it('三个都缺失时回退到任意非空值', () => {
    expect(pickI18nText({ 'ja-JP': 'ダイガク' }, 'ko-KR')).toBe('ダイガク');
  });

  // 后台把某语言清空后存的是空串而不是删 key，不能让空串顶掉后面的回退
  it('空串不算有效值，继续沿回退链找', () => {
    expect(pickI18nText({ 'zh-CN': '', 'en-US': 'Fallback' }, 'zh-CN')).toBe(
      'Fallback',
    );
  });

  it('全空的多语言对象返回 fallback', () => {
    expect(pickI18nText({ 'zh-CN': '', 'en-US': '' }, 'zh-CN', 'Site')).toBe(
      'Site',
    );
  });

  it('未显式传 lang 时默认按 zh-CN 取', () => {
    expect(pickI18nText({ 'zh-CN': '中文', 'en-US': 'English' })).toBe('中文');
  });
});

describe('resolveSiteLang', () => {
  it('放行受支持的语言', () => {
    expect(resolveSiteLang('zh-CN')).toBe('zh-CN');
    expect(resolveSiteLang('en-US')).toBe('en-US');
  });

  it('未支持 / 非字符串 / 空值一律回退 zh-CN', () => {
    expect(resolveSiteLang('ja-JP')).toBe(FALLBACK_LANG);
    expect(resolveSiteLang('')).toBe(FALLBACK_LANG);
    expect(resolveSiteLang(undefined)).toBe(FALLBACK_LANG);
    expect(resolveSiteLang(null)).toBe(FALLBACK_LANG);
    expect(resolveSiteLang(123)).toBe(FALLBACK_LANG);
    expect(resolveSiteLang({ 'zh-CN': 'x' })).toBe(FALLBACK_LANG);
  });
});
