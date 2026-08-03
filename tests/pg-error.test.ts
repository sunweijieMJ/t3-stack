import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from '@/server/db/pg-error';

describe('isUniqueViolation', () => {
  it('识别 postgres.js 形状：code 直接挂在错误上', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('识别 PGlite 形状：code 挂在 cause 上', () => {
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
  });

  it('识别多层包装', () => {
    expect(isUniqueViolation({ cause: { cause: { code: '23505' } } })).toBe(
      true,
    );
  });

  it('其他 SQLSTATE 不误判', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation({ cause: { code: '42P01' } })).toBe(false);
  });

  it('普通错误不误判', () => {
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
  });

  it('空值不抛错', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });

  it('cause 链过深时放弃查找，不会无限下钻', () => {
    // 7 层包装，最里层才是唯一冲突；超出查找深度上限后按「不是」处理
    let err: unknown = { code: '23505' };
    for (let i = 0; i < 7; i++) err = { cause: err };

    expect(isUniqueViolation(err)).toBe(false);
  });

  it('自引用的 cause 链不会死循环', () => {
    const err: Record<string, unknown> = { code: 'X' };
    err.cause = err;

    expect(isUniqueViolation(err)).toBe(false);
  });
});
