import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, gte, ilike, lt, lte, min } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { after } from 'next/server';
import { z } from 'zod';
import { ACTION_LABELS } from '@/server/api/audit-action-labels';
import { adminProcedure, createTRPCRouter } from '@/server/api/trpc';
import { auth } from '@/server/better-auth';
import { user } from '@/server/db/auth-schema';
import { adminAuditLog } from '@/server/db/schema';
import { isAdminEmail } from '@/server/services/admin-check';
import {
  getAuditPurgeConfig,
  maybePurgeAuditLogs,
  setAuditPurgeConfig,
} from '@/server/services/audit-purge';

// 单次导出的行数上限，避免长期运行后全表扫描导致 OOM。
// 命中上限时会通过返回值告知前端，由前端提示用户缩小范围分批导出——
// 不能静默截断，否则用户会以为导全了。
const AUDIT_EXPORT_LIMIT = 10_000;

// 转义 LIKE/ILIKE 通配符，避免用户输入 % / _ 把过滤变成全表匹配
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// 构建审计日志查询的 where 条件（listAuditLogs 和 exportAuditLogs 共用）
function buildAuditLogWhere(input: {
  startDate?: string;
  endDate?: string;
  action?: string;
  userEmail?: string;
}) {
  const conditions = [];
  if (input.startDate) {
    conditions.push(gte(adminAuditLog.createdAt, new Date(input.startDate)));
  }
  if (input.endDate) {
    conditions.push(lte(adminAuditLog.createdAt, new Date(input.endDate)));
  }
  if (input.action) {
    conditions.push(eq(adminAuditLog.action, input.action));
  }
  if (input.userEmail) {
    conditions.push(
      ilike(adminAuditLog.userEmail, `%${escapeLikePattern(input.userEmail)}%`),
    );
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export const adminRouter = createTRPCRouter({
  // ---- 用户管理 ----

  createUser: adminProcedure
    .input(
      z.object({
        email: z.email(),
        // 密码可选：email-otp 模式下登录不使用密码，省略时服务端生成随机强密码占位，
        // 避免管理员为不会被用到的密码凭空编一个。email-password 模式仍应由前端传入。
        password: z.string().min(6).optional(),
        name: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const result = await auth.api.signUpEmail({
          body: {
            email: input.email,
            password: input.password ?? nanoid(24),
            name: input.name,
          },
        });
        return {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (msg.includes('already') || msg.includes('exist')) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: '该邮箱已被注册',
          });
        }
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: '创建用户失败',
        });
      }
    }),

  listUsers: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(desc(user.createdAt));
    // isAdmin 在服务端逐行算好：isAdminEmail 是 server-only，而且 ADMIN_EMAILS
    // 白名单本身也不该整份下发给客户端。前端只用它来提示「你正在删除一个管理员账号」。
    return rows.map((r) => ({ ...r, isAdmin: isAdminEmail(r.email) }));
  }),

  deleteUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.session?.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: '不能删除自己的账户',
        });
      }
      await ctx.db.delete(user).where(eq(user.id, input.userId));
      return { success: true };
    }),

  // ---- 审计日志 ----

  // 获取数据库中实际存在的操作类型列表（附带中文名）
  listDistinctActions: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .selectDistinct({ action: adminAuditLog.action })
      .from(adminAuditLog)
      .orderBy(adminAuditLog.action);
    return rows.map((r) => ({
      value: r.action,
      label: ACTION_LABELS[r.action] ?? r.action,
    }));
  }),

  listAuditLogs: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        startDate: z.iso.datetime().optional(),
        endDate: z.iso.datetime().optional(),
        action: z.string().max(128).optional(),
        userEmail: z.string().max(256).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = buildAuditLogWhere(input);
      const offset = (input.page - 1) * input.pageSize;

      const [logs, countResult] = await Promise.all([
        ctx.db
          .select()
          .from(adminAuditLog)
          .where(where)
          .orderBy(desc(adminAuditLog.createdAt))
          .limit(input.pageSize)
          .offset(offset),
        ctx.db.select({ total: count() }).from(adminAuditLog).where(where),
      ]);

      return { logs, total: countResult[0]?.total ?? 0 };
    }),

  // 导出审计日志（返回全量数据，前端转 Excel）；改为 mutation 以走 auditMiddleware 留痕
  exportAuditLogs: adminProcedure
    .input(
      z.object({
        startDate: z.iso.datetime().optional(),
        endDate: z.iso.datetime().optional(),
        action: z.string().max(128).optional(),
        userEmail: z.string().max(256).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const where = buildAuditLogWhere(input);
      // 多取 1 条用于精确判断是否被截断（总数正好等于上限时不误报）
      const rows = await ctx.db
        .select()
        .from(adminAuditLog)
        .where(where)
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(AUDIT_EXPORT_LIMIT + 1);
      const truncated = rows.length > AUDIT_EXPORT_LIMIT;
      return {
        rows: truncated ? rows.slice(0, AUDIT_EXPORT_LIMIT) : rows,
        truncated,
        limit: AUDIT_EXPORT_LIMIT,
      };
    }),

  // ---- 审计日志清理 ----

  // 日志统计（总数 + 最早记录时间）；顺手触发懒清理（24h 频次保护，失败已被 service 自吞）
  getAuditLogStats: adminProcedure.query(async ({ ctx }) => {
    // after() 而非裸 void：Serverless 下响应返回即冻结实例，未保活的清理任务会被
    // 丢弃，自动清理将永远不生效（且无任何报错）。standalone 下行为不变。
    after(maybePurgeAuditLogs());
    const [countResult, minResult] = await Promise.all([
      ctx.db.select({ total: count() }).from(adminAuditLog),
      ctx.db
        .select({ earliest: min(adminAuditLog.createdAt) })
        .from(adminAuditLog),
    ]);
    return {
      total: countResult[0]?.total ?? 0,
      earliestDate: minResult[0]?.earliest?.toISOString() ?? null,
    };
  }),

  // 自动清理配置（默认开启，保留 90 天）
  getAuditPurgeConfig: adminProcedure.query(async () => {
    return getAuditPurgeConfig();
  }),

  setAuditPurgeConfig: adminProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        retentionDays: z.number().int().min(1).max(3650),
      }),
    )
    .mutation(async ({ input }) => {
      await setAuditPurgeConfig(input);
      return { success: true };
    }),

  // 手动清理指定日期之前的日志
  purgeAuditLogs: adminProcedure
    .input(
      z.object({
        // 与本文件其他日期入参保持一致的写法（z.string().datetime() 等价但不统一）
        beforeDate: z.iso.datetime(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 不能用 .returning({ id }) 再取 length：那会让 PG 把每一行被删的 id 都回传，
      // drizzle 再逐行实例化成对象——清理两年积压的日志时足以打爆内存，
      // 而这里只需要一个计数。postgres.js 的结果对象自带受影响行数（RowList.count）。
      const result = await ctx.db
        .delete(adminAuditLog)
        .where(lt(adminAuditLog.createdAt, new Date(input.beforeDate)));
      return { deleted: result.count };
    }),

  // 通用的 getConfig / setConfig 已移除：
  // 所有系统配置都应通过专用接口（saveFrontendConfig / setAuditPurgeConfig / adminSetFilterTags 等）
  // 写入，以保证 zod 校验与 audit 留痕，避免泛 key/value 写入绕过类型与约束。
});
