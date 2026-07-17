import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';
import { frontendConfigSchema } from '@/constants/frontend-config';
import {
  buildFrontendConfigZod,
  type FrontendConfig,
} from '@/lib/frontend-config';
import { systemConfig } from '@/server/db/schema';
import { FRONTEND_CONFIG_TAG } from '@/server/services/config';
import { adminProcedure, createTRPCRouter } from '../trpc';

const FRONTEND_CONFIG_KEY = 'frontend';
const frontendConfigInput = buildFrontendConfigZod(frontendConfigSchema);

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
      } catch {
        throw new TRPCError({
          code: 'CONFLICT',
          message: '配置已被其他管理员修改，请刷新后再保存',
        });
      }
    }),
});
