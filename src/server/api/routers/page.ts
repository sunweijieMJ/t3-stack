import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { frontendConfigSchema } from '@/constants/frontend-config';
import {
  buildFrontendConfigZod,
  collectAssetUrls,
  type FrontendConfig,
} from '@/lib/frontend-config';
import { systemConfig } from '@/server/db/schema';
import {
  FRONTEND_CONFIG_KEY,
  FRONTEND_CONFIG_TAG,
} from '@/server/services/config';
import { deleteFile } from '@/server/services/storage';
import { adminProcedure, createTRPCRouter } from '../trpc';

const frontendConfigInput = buildFrontendConfigZod(frontendConfigSchema);

/**
 * PG 唯一约束冲突（SQLSTATE 23505）。postgres.js 把服务端错误码放在 err.code 上，
 * 但抛出的不一定是 Error 实例，所以这里按结构而非 instanceof 判断。
 */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === '23505'
  );
}

/**
 * 删除「旧配置引用、新配置不再引用」的上传文件。
 * 不 await：清理失败只会留下一个孤儿文件（等同于改动前的行为），
 * 不该因此让保存配置这个主流程失败。
 *
 * 但要用 after() 保活：Serverless 下响应返回后实例即冻结，裸 void 的删除请求会被
 * 丢弃，每换一次 logo 就在 OSS 里永久留一份没人引用的文件。standalone 下行为不变。
 */
function purgeOrphanAssets(oldValue: unknown, newValue: unknown): void {
  const oldUrls = collectAssetUrls(frontendConfigSchema, oldValue);
  if (oldUrls.size === 0) return;
  const newUrls = collectAssetUrls(frontendConfigSchema, newValue);
  const stale = [...oldUrls].filter((url) => !newUrls.has(url));
  if (stale.length === 0) return;
  after(Promise.all(stale.map((url) => deleteFile(url))));
}

export const pageRouter = createTRPCRouter({
  // 读取前端配置：同时返回 updatedAt 作为乐观锁的版本号
  getFrontendConfig: adminProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db
      .select({
        value: systemConfig.value,
        updatedAt: systemConfig.updatedAt,
      })
      .from(systemConfig)
      .where(eq(systemConfig.key, FRONTEND_CONFIG_KEY))
      .limit(1);
    return {
      value: (row?.value ?? {}) as Partial<FrontendConfig>,
      updatedAt: row?.updatedAt ?? null,
    };
  }),

  // 保存前端配置（乐观锁）：客户端必须回传读取时拿到的 updatedAt，
  // 不匹配 → 说明被他人改过，抛 CONFLICT 让前端刷新；首次保存允许 expectedUpdatedAt=null。
  saveFrontendConfig: adminProcedure
    .input(
      z.object({
        value: frontendConfigInput,
        expectedUpdatedAt: z.iso.datetime().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const now = new Date();

      if (input.expectedUpdatedAt) {
        // 已存在记录：用 WHERE updatedAt=? 做乐观锁
        const expected = new Date(input.expectedUpdatedAt);
        // 先读旧值：更新之后就拿不到了，而清理孤儿文件需要对比新旧的资源 URL。
        // 这里的「读后写」是安全的 —— 若期间被他人改过，下面的 UPDATE 会匹配 0 行
        // 并抛 CONFLICT，purgeOrphanAssets 根本不会执行，不存在误删别人刚传的文件。
        const [before] = await ctx.db
          .select({ value: systemConfig.value })
          .from(systemConfig)
          .where(eq(systemConfig.key, FRONTEND_CONFIG_KEY))
          .limit(1);
        const updated = await ctx.db
          .update(systemConfig)
          .set({ value: input.value, updatedAt: now })
          .where(
            and(
              eq(systemConfig.key, FRONTEND_CONFIG_KEY),
              eq(systemConfig.updatedAt, expected),
            ),
          )
          .returning({ updatedAt: systemConfig.updatedAt });

        if (updated.length === 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: '配置已被其他管理员修改，请刷新后再保存',
          });
        }
        revalidateTag(FRONTEND_CONFIG_TAG, { expire: 0 });
        purgeOrphanAssets(before?.value, input.value);
        return { value: input.value, updatedAt: updated[0]?.updatedAt ?? now };
      }

      // 首次保存：插入；若已存在则报 CONFLICT（说明前端拿到的 null 是脏数据）
      try {
        const inserted = await ctx.db
          .insert(systemConfig)
          .values({
            key: FRONTEND_CONFIG_KEY,
            value: input.value,
            updatedAt: now,
          })
          .returning({ updatedAt: systemConfig.updatedAt });
        revalidateTag(FRONTEND_CONFIG_TAG, { expire: 0 });
        return { value: input.value, updatedAt: inserted[0]?.updatedAt ?? now };
      } catch (err) {
        // 只有主键冲突（23505）才是「别人抢先插了」。裸 catch 会把连接中断、
        // jsonb 过大、权限不足统统报成「被其他管理员修改」，而前端收到 CONFLICT
        // 会去 refetch 重试 —— 真实故障被掩盖成一个无限重试的假冲突。
        if (isUniqueViolation(err)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: '配置已被其他管理员修改，请刷新后再保存',
          });
        }
        console.error('[page.saveFrontendConfig] 首次写入失败:', err);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: '保存失败，请稍后重试',
        });
      }
    }),
});
