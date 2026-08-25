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
    ['注册端点', '/api/auth/sign-up/email'],
  ])('登录前的认证端点按 IP（%s）', (_label, pathname) => {
    expect(shouldKeyByUser(pathname)).toBe(false);
  });

  it.each([
    ['会话查询', '/api/auth/get-session'],
    ['登出', '/api/auth/sign-out'],
  ])('已登录才有意义的认证端点按用户（%s）', (_label, pathname) => {
    // get-session 挂在 admin-shell 上、包着每个后台页面，是后台最高频的已登录
    // 请求。留在 IP 桶里会让「NAT 出口互相挤 429」只解决一半。
    expect(shouldKeyByUser(pathname)).toBe(true);
  });

  it('白名单是精确匹配，不能被子路径撑开', () => {
    // 默认（IP 计数）是更严的那一侧，白名单一旦退化成前缀匹配，
    // better-auth 将来在这些路径下加子端点会静默进入宽松桶。
    expect(shouldKeyByUser('/api/auth/get-session/evil')).toBe(false);
    expect(shouldKeyByUser('/api/auth/sign-out/x')).toBe(false);
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
