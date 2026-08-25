import { describe, expect, it } from 'vitest';
import { shouldKeyByUser } from '@/lib/rate-limit-scope';

/**
 * 这条判断写反是**安全方向**的错误：把 /api/auth/* 也纳入按用户计数，等于把
 * 登录前表面的 IP 限流让出去。所以每条分支都显式钉住，而不是只测一个 happy path。
 */
describe('shouldKeyByUser', () => {
  it.each([
    '/api/trpc',
    '/api/trpc/content.list',
    '/api/upload',
    '/api/cron/audit-purge',
    '/api/health',
  ])('业务 API 在有登录态时按用户计数：%s', (pathname) => {
    expect(shouldKeyByUser(pathname)).toBe(true);
  });

  it.each([
    ['登录端点', '/api/auth/sign-in/email'],
    ['验证码登录', '/api/auth/sign-in/email-otp'],
    ['验证码发送', '/api/auth/email-otp/send-verification-otp'],
    ['会话查询', '/api/auth/get-session'],
    ['登出', '/api/auth/sign-out'],
  ])('认证端点一律按 IP（%s）', (_label, pathname) => {
    expect(shouldKeyByUser(pathname)).toBe(false);
  });

  it('前缀匹配不能被相似路径骗过', () => {
    // /api/authors 不是认证端点，不该被 '/api/auth' 的前缀误伤 ——
    // 这正是 IP_ONLY_PREFIXES 里带尾斜杠的原因。
    expect(shouldKeyByUser('/api/authors')).toBe(true);
    expect(shouldKeyByUser('/api/authz/check')).toBe(true);
  });

  it.each([
    '/admin',
    '/admin/users',
    '/',
    '/content/news',
    '/signin',
  ])('非 API 路径一律返回 false：%s', (pathname) => {
    expect(shouldKeyByUser(pathname)).toBe(false);
  });
});
