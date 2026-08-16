import { describe, expect, it } from 'vitest';
import {
  authIpLimiter,
  globalIpLimiter,
  otpSendLimiter,
  parseRateLimit,
  RateLimiter,
  uploadLimiter,
} from '@/server/services/rate-limiter';

/**
 * 这些用例跑在内存后端上（测试环境没有 REDIS_URL），但被测的是 RateLimiter 自己的
 * key 命名空间逻辑 —— 它对两个后端是同一份代码，Redis 分支只是把同一个 key 拼进
 * `ratelimit:` 前缀。
 *
 * 存在的理由：限流是安全控制，之前一条测试都没有，于是「四个 limiter 共用一个计数桶」
 * 这种全站级缺陷可以一路进到生产而不被任何门禁发现。
 */

// 每个用例用独立 key，避免相互污染（后端是模块级单例，跨用例共享）
let seq = 0;
const freshKey = () => `test-key-${Date.now()}-${seq++}`;

describe('RateLimiter 的计数桶隔离', () => {
  it('不同 limiter 即使传入同一个 key 也各算各的', async () => {
    const key = freshKey();

    // otpSendLimiter 默认 10 次/分钟：先把它打满
    for (let i = 0; i < 10; i++) {
      const r = await otpSendLimiter.check(key);
      expect(r.allowed).toBe(true);
    }
    expect((await otpSendLimiter.check(key)).allowed).toBe(false);

    // 同一个 key 在其他三个 limiter 上必须仍然畅通。
    // 修复前这里会全部返回 false：后端是单例、key 又只有调用方传的那一段，
    // 四个 limiter 实际共用一个桶，谁先打满谁就把其他几个一起顶掉。
    expect((await globalIpLimiter.check(key)).allowed).toBe(true);
    expect((await authIpLimiter.check(key)).allowed).toBe(true);
    expect((await uploadLimiter.check(key)).allowed).toBe(true);
  });

  it('反向也成立：全局限流的计数不会占用验证码发送的额度', async () => {
    const key = freshKey();

    // 全局限流默认 60 次/分钟，这里先压 20 次 —— 已经远超 otpSend 的 10 次上限
    for (let i = 0; i < 20; i++) {
      expect((await globalIpLimiter.check(key)).allowed).toBe(true);
    }

    // 修复前：otpSend 看到桶里已有 20 条 ≥ 10，第一次就 429，
    // 用户拿到的提示是「验证码发送过于频繁」，而他一次都还没发过。
    expect((await otpSendLimiter.check(key)).allowed).toBe(true);
  });

  it('同一 limiter 下不同 key 互不影响', async () => {
    const a = freshKey();
    const b = freshKey();

    for (let i = 0; i < 10; i++) await otpSendLimiter.check(a);
    expect((await otpSendLimiter.check(a)).allowed).toBe(false);
    expect((await otpSendLimiter.check(b)).allowed).toBe(true);
  });
});

describe('RateLimiter 的窗口计数', () => {
  it('达到上限后拒绝，并给出正数的 retryAfterMs', async () => {
    const limiter = new RateLimiter('unit-test', 3, 60_000);
    const key = freshKey();

    for (let i = 0; i < 3; i++) {
      expect((await limiter.check(key)).allowed).toBe(true);
    }

    const denied = await limiter.check(key);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('放行时 retryAfterMs 为 0', async () => {
    const limiter = new RateLimiter('unit-test', 2, 60_000);
    expect(await limiter.check(freshKey())).toEqual({
      allowed: true,
      retryAfterMs: 0,
    });
  });

  it('同名 limiter 的不同实例共享计数（key 前缀相同）', async () => {
    // 这是 name 前缀方案的必然结果，显式钉住：name 是命名空间而不是实例身份，
    // 多实例部署里同名 limiter 本来就该共享计数。
    const key = freshKey();
    const a = new RateLimiter('shared-name', 2, 60_000);
    const b = new RateLimiter('shared-name', 2, 60_000);

    expect((await a.check(key)).allowed).toBe(true);
    expect((await b.check(key)).allowed).toBe(true);
    expect((await a.check(key)).allowed).toBe(false);
  });

  it('窗口过期后重新放行', async () => {
    // 20ms 窗口，跨过它之后旧时间戳应被滑出
    const limiter = new RateLimiter('unit-test-window', 1, 20);
    const key = freshKey();

    expect((await limiter.check(key)).allowed).toBe(true);
    expect((await limiter.check(key)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await limiter.check(key)).allowed).toBe(true);
  });
});

describe('parseRateLimit', () => {
  it('解析 "max/windowMs" 形式', () => {
    expect(parseRateLimit('5/60000', 1, 1)).toEqual([5, 60_000]);
  });

  it('未配置时回落到默认值', () => {
    expect(parseRateLimit(undefined, 7, 1000)).toEqual([7, 1000]);
  });

  it.each([
    ['格式缺少斜杠', '5'],
    ['非数字', 'a/b'],
    ['max 为 0', '0/1000'],
    ['负数窗口', '5/-1'],
    ['空串', ''],
  ])('非法输入（%s）回落到默认值', (_label, value) => {
    expect(parseRateLimit(value, 7, 1000)).toEqual([7, 1000]);
  });
});
