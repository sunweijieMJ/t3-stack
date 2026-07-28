import { describe, expect, it } from 'vitest';
import { isOtpInvalidated, resolveAuthError } from '@/lib/auth-error';

const FALLBACK = '验证码错误，请重试';

describe('resolveAuthError', () => {
  it('error 为空时返回 fallback', () => {
    expect(resolveAuthError(null, FALLBACK)).toBe(FALLBACK);
    expect(resolveAuthError(undefined, FALLBACK)).toBe(FALLBACK);
  });

  // 限流由 src/proxy.ts 返回，message 已是中文，应原样透传而不是被兜底文案覆盖
  it('429 且 message 为中文时透传原文', () => {
    expect(
      resolveAuthError(
        { status: 429, message: '验证码发送过于频繁，请稍后再试' },
        FALLBACK,
      ),
    ).toBe('验证码发送过于频繁，请稍后再试');
  });

  it('429 但 message 是英文时用通用限流文案', () => {
    expect(
      resolveAuthError({ status: 429, message: 'Too Many Requests' }, FALLBACK),
    ).toBe('操作太频繁，请稍后再试');
  });

  it('识别 RATE_LIMITED / TOO_MANY_REQUESTS code', () => {
    expect(resolveAuthError({ code: 'RATE_LIMITED' }, FALLBACK)).toBe(
      '操作太频繁，请稍后再试',
    );
    expect(resolveAuthError({ code: 'too_many_requests' }, FALLBACK)).toBe(
      '操作太频繁，请稍后再试',
    );
  });

  it('识别验证码过期（code 与 message 两条路径）', () => {
    expect(resolveAuthError({ code: 'OTP_EXPIRED' }, FALLBACK)).toContain(
      '已过期',
    );
    expect(resolveAuthError({ message: 'OTP expired' }, FALLBACK)).toContain(
      '已过期',
    );
  });

  it('识别错误次数过多', () => {
    expect(resolveAuthError({ code: 'TOO_MANY_ATTEMPTS' }, FALLBACK)).toContain(
      '错误次数过多',
    );
    expect(
      resolveAuthError({ message: 'Too many attempts' }, FALLBACK),
    ).toContain('错误次数过多');
  });

  it('识别验证码不正确', () => {
    expect(resolveAuthError({ code: 'INVALID_OTP' }, FALLBACK)).toContain(
      '不正确',
    );
    expect(resolveAuthError({ message: 'Invalid OTP' }, FALLBACK)).toContain(
      '不正确',
    );
  });

  it('识别验证码不存在', () => {
    expect(resolveAuthError({ code: 'OTP_NOT_FOUND' }, FALLBACK)).toContain(
      '已失效',
    );
    expect(resolveAuthError({ message: 'OTP not found' }, FALLBACK)).toContain(
      '已失效',
    );
  });

  it('识别邮箱格式错误', () => {
    expect(resolveAuthError({ message: 'Invalid email' }, FALLBACK)).toBe(
      '邮箱格式不正确',
    );
  });

  // 后端自定义错误（如 tRPC 抛的中文 message）本身就是给用户看的，不该被吞掉
  it('已是中文的未知错误直接透传', () => {
    expect(resolveAuthError({ message: '该邮箱已被注册' }, FALLBACK)).toBe(
      '该邮箱已被注册',
    );
  });

  it('未知的英文错误统一用场景兜底文案，不向用户暴露英文', () => {
    expect(
      resolveAuthError({ message: 'Something went wrong' }, FALLBACK),
    ).toBe(FALLBACK);
  });
});

describe('isOtpInvalidated', () => {
  it('error 为空时返回 false', () => {
    expect(isOtpInvalidated(null)).toBe(false);
    expect(isOtpInvalidated(undefined)).toBe(false);
  });

  // 这三种情况 better-auth 会直接删掉验证码记录，旧码再输也没用
  it.each([
    { code: 'TOO_MANY_ATTEMPTS' },
    { message: 'Too many attempts' },
    { code: 'OTP_EXPIRED' },
    { message: 'OTP expired' },
    { code: 'OTP_NOT_FOUND' },
    { message: 'OTP not found' },
  ])('验证码已被服务端作废：%o', (error) => {
    expect(isOtpInvalidated(error)).toBe(true);
  });

  // 单纯输错一位不该清空输入框、也不该放开「重新获取」
  it('普通的验证码输错不算作废', () => {
    expect(isOtpInvalidated({ code: 'INVALID_OTP' })).toBe(false);
  });
});
