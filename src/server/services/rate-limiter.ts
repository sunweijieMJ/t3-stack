import 'server-only';
import type { Redis as IORedis } from 'ioredis';
import { env } from '@/env';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

interface LimiterBackend {
  check(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<RateLimitResult>;
}

// ---- 进程内后端（fallback；多实例下各实例独立计数，仅适合单机开发） ----
class MemoryBackend implements LimiterBackend {
  private windows = new Map<string, number[]>();

  constructor() {
    setInterval(() => this.cleanup(), 60_000).unref();
  }

  check(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    return Promise.resolve(this.checkSync(key, maxRequests, windowMs));
  }

  private checkSync(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): RateLimitResult {
    const now = Date.now();
    const timestamps = (this.windows.get(key) ?? []).filter(
      (t) => now - t < windowMs,
    );
    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0] ?? now;
      this.windows.set(key, timestamps);
      return { allowed: false, retryAfterMs: oldest + windowMs - now };
    }
    timestamps.push(now);
    this.windows.set(key, timestamps);
    return { allowed: true, retryAfterMs: 0 };
  }

  private cleanup() {
    const now = Date.now();
    const maxAge = 5 * 60_000; // 保留窗口最大覆盖 5 分钟数据
    for (const [key, timestamps] of this.windows) {
      const valid = timestamps.filter((t) => now - t < maxAge);
      if (valid.length === 0) this.windows.delete(key);
      else this.windows.set(key, valid);
    }
  }
}

// ---- Redis 后端（生产用，多实例共享计数） ----
// 用 sorted set 实现 sliding window：成员是 nonce，score 是 timestamp。
// 单条 Lua 脚本保证 ZREMRANGEBYSCORE + ZCARD + ZADD + EXPIRE 原子执行。
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxRequests = tonumber(ARGV[3])
local nonce = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)
if count >= maxRequests then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {0, tonumber(oldest[2]) or now}
end
redis.call('ZADD', key, now, nonce)
redis.call('PEXPIRE', key, windowMs + 1000)
return {1, 0}
`;

class RedisBackend implements LimiterBackend {
  private client: IORedis;

  constructor(client: IORedis) {
    this.client = client;
  }

  async check(
    key: string,
    maxRequests: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const nonce = `${now}-${Math.random().toString(36).slice(2)}`;
    try {
      const [allowed, oldest] = (await this.client.eval(
        SLIDING_WINDOW_LUA,
        1,
        `ratelimit:${key}`,
        String(now),
        String(windowMs),
        String(maxRequests),
        nonce,
      )) as [number, number];
      if (allowed === 1) return { allowed: true, retryAfterMs: 0 };
      return { allowed: false, retryAfterMs: oldest + windowMs - now };
    } catch (err) {
      // Redis 故障时 fail-open，避免限流挂了整站打不开；告警靠监控
      console.error('[rate-limiter] Redis check failed, fail-open:', err);
      return { allowed: true, retryAfterMs: 0 };
    }
  }
}

let backendPromise: Promise<LimiterBackend> | null = null;

async function getBackend(): Promise<LimiterBackend> {
  if (!backendPromise) {
    backendPromise = (async () => {
      if (env.REDIS_URL) {
        try {
          const { Redis } = await import('ioredis');
          const client = new Redis(env.REDIS_URL, {
            // 必须显式等握手完成再把 client 交出去（见下面的 await connect）。
            // 原来是 lazyConnect:false + enableOfflineQueue:false —— 前者只是「发起」
            // 握手而不等待，后者让未就绪时的命令立刻抛错。在 Serverless 上这是致命组合：
            // Vercel 在响应返回后会冻结进程，未被 await 的握手根本没机会推进，于是
            // 每一次调用都撞上 `Stream isn't writeable`，被 check() 的 catch 吞掉后
            // fail-open —— 表现为「配了 REDIS_URL，Redis 里却一个 key 都没有」，
            // 限流实际上从未生效。线上日志实测每次请求都报，不是冷启动的偶发窗口。
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            // 允许离线排队：断线重连期间命令排队等待，而不是直接抛错。
            // 上限由 commandTimeout 兜住，Redis 真挂了也不会把请求吊死。
            enableOfflineQueue: true,
            connectTimeout: 3000,
            commandTimeout: 2000,
          });
          client.on('error', (err) => {
            console.error('[rate-limiter] Redis client error:', err.message);
          });
          await client.connect();
          return new RedisBackend(client);
        } catch (err) {
          // 连不上就退化为内存后端。注意 backendPromise 是记忆化的，本进程不会再重试：
          // Serverless 下实例短暂，下一个实例自然会重连，这是自愈的；长驻部署
          // （Docker 单实例）则会一直用内存后端直到重启 —— 单实例场景下内存计数本就有效，
          // 代价可接受，换来的是「Redis 挂了不会让每个请求都付一次 connectTimeout」。
          console.error(
            '[rate-limiter] Failed to init Redis backend, fallback to memory:',
            err,
          );
          return new MemoryBackend();
        }
      }
      console.warn(
        '[rate-limiter] REDIS_URL not set, using in-memory backend. ' +
          'Multi-instance deployments will NOT share rate limit state.',
      );
      return new MemoryBackend();
    })();
  }
  return backendPromise;
}

export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async check(key: string): Promise<RateLimitResult> {
    const backend = await getBackend();
    return backend.check(key, this.maxRequests, this.windowMs);
  }
}

export function parseRateLimit(
  value: string | undefined,
  defaultMax: number,
  defaultWindowMs: number,
): [number, number] {
  if (!value) return [defaultMax, defaultWindowMs];
  const [rawMax, rawWindowMs] = value.split('/');
  if (rawMax === undefined || rawWindowMs === undefined)
    return [defaultMax, defaultWindowMs];
  const max = parseInt(rawMax, 10);
  const windowMs = parseInt(rawWindowMs, 10);
  if (
    Number.isNaN(max) ||
    Number.isNaN(windowMs) ||
    max <= 0 ||
    windowMs <= 0
  ) {
    return [defaultMax, defaultWindowMs];
  }
  return [max, windowMs];
}

function rl(
  envValue: string | undefined,
  defaultMax: number,
  defaultWindowMs: number,
) {
  return new RateLimiter(
    ...parseRateLimit(envValue, defaultMax, defaultWindowMs),
  );
}

export const uploadLimiter = rl(env.RATE_LIMIT_UPLOAD, 5, 60_000);
export const globalIpLimiter = rl(env.RATE_LIMIT_GLOBAL_IP, 60, 60_000);
// 登录/验证端点限流：仅覆盖登录与验证尝试，验证本身另有 better-auth allowedAttempts 兜底，
// 阈值可宽松，避免共享 NAT 出口 IP 时误伤正常用户。
export const authIpLimiter = rl(env.RATE_LIMIT_AUTH_IP, 20, 60_000);
// 验证码发送限流：仅覆盖 send-verification-otp 这类有成本（邮件）的端点，与验证端点分离，
// 防止「发送 1 次 + 验证 1 次」就占满登录额度。
export const otpSendLimiter = rl(env.RATE_LIMIT_OTP_SEND, 10, 60_000);
