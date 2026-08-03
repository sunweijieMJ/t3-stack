/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { after } from 'next/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import type { Permission } from '@/lib/rbac';
import { auth } from '@/server/better-auth';
import { db } from '@/server/db';
import { adminAuditLog } from '@/server/db/schema';
import { userCan } from '@/server/services/admin-check';
import { getClientIp } from '@/server/services/get-client-ip';

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth.api.getSession({
    headers: opts.headers,
  });
  return {
    db,
    session,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure;

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      // 将 session 类型收窄为非空
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

/**
 * 对输入参数进行脱敏，移除密码、token 等敏感字段。
 */
function sanitizeInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(sanitizeInput);
  // 子串匹配，覆盖 newPassword / confirmPassword / apiToken 等驼峰命名。
  // 注意：不要用 endsWith('code')，会误伤 zipCode / countryCode / errorCode /
  // productCode 等业务字段。验证码用更精确的命名匹配：verificationCode /
  // verifyCode / authCode / otpCode（"verify*Code" / "*OtpCode"）。
  const sensitivePatterns = ['password', 'secret', 'token', 'otp'];
  const exactSensitiveKeys = new Set(['code', 'pin', 'pincode', 'captcha']);
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    const isSensitive =
      sensitivePatterns.some((p) => lower.includes(p)) ||
      exactSensitiveKeys.has(lower) ||
      /(?:verif(?:y|ication)|auth|otp)code$/.test(lower);
    sanitized[key] = isSensitive ? '***' : sanitizeInput(value);
  }
  return sanitized;
}

/**
 * 审计日志中间件 —— 记录所有 admin mutation 操作到 adminAuditLog 表。
 *
 * 挂载位置很关键：它必须挂在**管理员校验之前**（见 adminProcedure），
 * 这样已登录但不在 ADMIN_EMAILS 白名单里的用户发起的越权尝试也会被记为
 * result='error' + errorMessage='Admin access required'。安全审计最需要的
 * 恰恰是这类被拒记录；挂在校验之后会导致越权尝试一条都不留痕。
 *
 * 设计：写入不 await，让业务响应不被 DB I/O 阻塞，但必须用 next/server 的 after()
 * 包裹 —— 见 writeLog 处的说明。
 *
 * 日志清理（保留窗口）已从此中间件移除：原先每条 mutation 都额外查 systemConfig
 * 3 个 key，吞性能。改为按需在 getAuditLogStats / setAuditPurgeConfig 入口触发。
 */
const auditMiddleware = t.middleware(
  async ({ ctx, next, path, type, getRawInput }) => {
    // 一律用无参 next()：传 next({ ctx }) 会把 ctx 类型重置回根 context，
    // 抹掉 protectedProcedure 对 session 的非空收窄，导致后续中间件里
    // ctx.session 又变成可能为 null。本中间件不改 ctx，无参透传即可。
    if (type !== 'mutation') return next();
    if (!ctx.session?.user) return next();

    const sessionUser = ctx.session.user;
    const rawInput = await getRawInput();
    const rawIp = getClientIp(ctx.headers);
    const ip = rawIp === 'unknown' ? null : rawIp;
    const ua = ctx.headers.get('user-agent') ?? null;

    const writeLog = (values: typeof adminAuditLog.$inferInsert) => {
      // 必须走 after() 而不是裸 void：Serverless（Vercel）在响应写回后会立即冻结
      // 甚至回收实例，未被保活的 Promise 会被直接丢弃 —— 表现为审计日志随机缺条，
      // 而审计恰恰是最不能丢的数据，且这种丢失不会有任何报错。
      // after() 让 Next 把回调保活到响应之后再 flush；standalone 长进程下行为不变。
      after(
        db
          .insert(adminAuditLog)
          .values(values)
          .catch((err) => console.error('[AuditLog] 写入失败:', err)),
      );
    };

    try {
      const result = await next();
      writeLog({
        userId: sessionUser.id,
        userEmail: sessionUser.email,
        action: path,
        input: sanitizeInput(rawInput) as Record<string, unknown>,
        result: 'success',
        ipAddress: ip,
        userAgent: ua,
      });
      return result;
    } catch (error) {
      writeLog({
        userId: sessionUser.id,
        userEmail: sessionUser.email,
        action: path,
        input: sanitizeInput(rawInput) as Record<string, unknown>,
        result: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        ipAddress: ip,
        userAgent: ua,
      });
      throw error;
    }
  },
);

/**
 * 按权限点保护的过程工厂 —— 要求登录用户具备指定权限。
 *
 * 权限由「ADMIN_EMAILS 白名单 + 数据库 role」共同决定，判定逻辑集中在
 * services/admin-check 的 userCan，见 lib/rbac.ts。
 *
 * 中间件顺序：auditMiddleware 在前，权限校验在后。tRPC 的 .use() 是由外向内
 * 包裹，所以先注册的 audit 能捕获后注册的权限校验抛出的 FORBIDDEN —— 越权尝试
 * 因此仍会留痕，这正是审计最需要的记录。
 */
export const permissionProcedure = (permission: Permission) =>
  protectedProcedure.use(auditMiddleware).use(({ ctx, next }) => {
    if (!userCan(ctx.session.user, permission)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Missing permission: ${permission}`,
      });
    }
    return next({ ctx });
  });

/**
 * 管理员专用过程 —— 要求具备进入后台的权限。
 *
 * 保留这个名字是为了不动现有 router 的调用点；它现在等价于
 * `permissionProcedure('admin.access')`。需要更细粒度时，直接在 router 里
 * 换成对应权限点的 permissionProcedure，例如用户管理用 'user.manage'。
 */
export const adminProcedure = permissionProcedure('admin.access');
