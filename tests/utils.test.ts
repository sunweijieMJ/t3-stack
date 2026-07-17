import { describe, expect, it, vi } from 'vitest';
import { parseAuthMethod } from '@/lib/auth-methods';

// 通过 mock @/env 控制 TRUST_PROXY_HEADERS 取值；默认 false，仅测试用例显式覆盖时为 true
const envMock = vi.hoisted(() => ({ TRUST_PROXY_HEADERS: true }));
vi.mock('@/env', () => ({ env: envMock }));

const { getClientIp } = await import('@/server/services/get-client-ip');

describe('getClientIp (TRUST_PROXY_HEADERS=true)', () => {
  it('优先读取 x-real-ip', () => {
    envMock.TRUST_PROXY_HEADERS = true;
    const headers = new Headers({ 'x-real-ip': '1.2.3.4' });
    expect(getClientIp(headers)).toBe('1.2.3.4');
  });

  // 安全语义：nginx 用 $proxy_add_x_forwarded_for 追加，最后一项才是受信代理观测的真实
  // 对端 IP；第一项是客户端可伪造的值，不能用于限流/审计 key。
  it('x-real-ip 缺失时取 x-forwarded-for 最后一项', () => {
    envMock.TRUST_PROXY_HEADERS = true;
    const headers = new Headers({ 'x-forwarded-for': '5.6.7.8, 9.10.11.12' });
    expect(getClientIp(headers)).toBe('9.10.11.12');
  });

  it('x-forwarded-for 单值时直接返回该值', () => {
    envMock.TRUST_PROXY_HEADERS = true;
    const headers = new Headers({ 'x-forwarded-for': '5.6.7.8' });
    expect(getClientIp(headers)).toBe('5.6.7.8');
  });

  it('两个 header 都缺失时返回 unknown', () => {
    envMock.TRUST_PROXY_HEADERS = true;
    expect(getClientIp(new Headers())).toBe('unknown');
  });

  it('接受包含 headers 属性的请求对象', () => {
    envMock.TRUST_PROXY_HEADERS = true;
    const req = { headers: new Headers({ 'x-real-ip': '127.0.0.1' }) };
    expect(getClientIp(req)).toBe('127.0.0.1');
  });
});

describe('getClientIp (TRUST_PROXY_HEADERS=false)', () => {
  it('不信任代理时无视 header，统一返回 unknown，防止伪造', () => {
    envMock.TRUST_PROXY_HEADERS = false;
    const headers = new Headers({
      'x-real-ip': '1.2.3.4',
      'x-forwarded-for': '5.6.7.8',
    });
    expect(getClientIp(headers)).toBe('unknown');
  });
});

describe('parseAuthMethod', () => {
  it('返回合法的 email-otp', () => {
    expect(parseAuthMethod('email-otp')).toBe('email-otp');
  });

  it('返回合法的 email-password', () => {
    expect(parseAuthMethod('email-password')).toBe('email-password');
  });

  it('未知值回退到默认 email-otp', () => {
    expect(parseAuthMethod('unknown')).toBe('email-otp');
  });

  it('undefined 回退到默认 email-otp', () => {
    expect(parseAuthMethod(undefined)).toBe('email-otp');
  });

  it('去除首尾空格后仍能正确识别', () => {
    expect(parseAuthMethod('  email-password  ')).toBe('email-password');
  });
});
