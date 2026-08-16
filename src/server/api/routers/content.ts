import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { after } from 'next/server';
import { z } from 'zod';
import { sanitizeContentHtml } from '@/lib/content-html';
import { resolveContentTypes } from '@/lib/content-types';
import { CONTENT_STATUSES } from '@/lib/content-visibility';
import { ROLES } from '@/lib/rbac';
import { createTRPCRouter, permissionProcedure } from '@/server/api/trpc';
import { isUniqueViolation } from '@/server/db/pg-error';
import type * as schema from '@/server/db/schema';
import { content, contentCategory, systemConfig } from '@/server/db/schema';
import { FRONTEND_CONFIG_KEY } from '@/server/services/config';
import { deleteFile } from '@/server/services/storage';

const manageProcedure = permissionProcedure('content.manage');

/**
 * 校验 type 是否在「门户设置 → 内容类型」里登记过。
 *
 * 门户对未登记的类型一律 404（见 app/(portal)/content/[type]/page.tsx），
 * 所以放进来一个没登记的类型，等于建了一篇永远打不开的内容，而后台列表
 * 还会显示「已发布」—— 这种失败完全没有声音。后台表单已经收敛成下拉框，
 * 这里是绕开 UI 直接调接口时的第二道。
 *
 * 直接用 ctx.db 读而不是走 services/config 的 getFrontendConfig：那条路裹了
 * unstable_cache（60s）与 React cache，校验读到过期快照会把刚登记的类型判为
 * 非法。校验要的是此刻的真实值，且这是低频的后台写操作，多一次查询无所谓。
 */
async function assertRegisteredType(
  db: PostgresJsDatabase<typeof schema>,
  type: string,
): Promise<void> {
  const [row] = await db
    .select({ value: systemConfig.value })
    .from(systemConfig)
    .where(eq(systemConfig.key, FRONTEND_CONFIG_KEY))
    .limit(1);
  const types = resolveContentTypes(
    (row?.value as { content?: { types?: unknown } } | undefined)?.content
      ?.types,
  );
  if (!types.some((t) => t.slug === type)) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `内容类型「${type}」未在门户设置中登记，保存后在门户无法访问。请先到「门户设置 → 内容类型」添加。`,
    });
  }
}

/** slug 只允许小写字母、数字与连字符：它会直接进 URL，放开会引入编码与路由歧义 */
const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9-]+$/, 'slug 只能包含小写字母、数字和连字符');

const contentInput = z.object({
  type: z.string().min(1).max(32),
  slug: slugSchema,
  title: z.string().min(1).max(256),
  summary: z.string().max(1000).optional(),
  // 富文本正文不设长度上限校验，而是在净化后落库；净化会剔除绝大部分注入体积
  body: z.string().optional(),
  // nullable 不能省：前端清除封面时传 null，只写 optional 的话 null 会被 zod 拒绝，
  // 而改传 undefined 又会被 drizzle 的 buildUpdateSet 整列剔除（值为 undefined 的列
  // 不会进 SET 子句），结果是封面一旦上传就再也删不掉。与下方 categoryId 保持一致。
  coverImage: z.string().max(2048).nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  status: z.enum(CONTENT_STATUSES).optional(),
  publishedAt: z.iso.datetime().nullable().optional(),
  unpublishedAt: z.iso.datetime().nullable().optional(),
  visibleRoles: z.array(z.enum(ROLES)).optional(),
  pinned: z.boolean().optional(),
});

/** 把入参里的日期字符串与富文本正文转换成可直接落库的形态 */
function toDbValues(input: z.infer<typeof contentInput>) {
  return {
    ...input,
    // 正文必须经过净化再落库：库里存的就是最终会被渲染的 HTML，
    // 净化放在这里而不是渲染侧，见 lib/content-html.ts 的说明。
    body: sanitizeContentHtml(input.body ?? ''),
    publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
    unpublishedAt: input.unpublishedAt ? new Date(input.unpublishedAt) : null,
  };
}

const DUPLICATE_SLUG = new TRPCError({
  code: 'CONFLICT',
  message: '同类型下已存在相同 slug 的内容',
});

export const contentRouter = createTRPCRouter({
  // ---- 后台管理 ----

  list: manageProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        type: z.string().max(32).optional(),
        status: z.enum(CONTENT_STATUSES).optional(),
        keyword: z.string().max(128).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions: SQL[] = [];
      if (input.type) conditions.push(eq(content.type, input.type));
      if (input.status) conditions.push(eq(content.status, input.status));
      if (input.keyword) {
        // 转义 LIKE 通配符，避免用户输入的 % / _ 把过滤变成全表匹配
        const escaped = input.keyword.replace(/[\\%_]/g, (m) => `\\${m}`);
        conditions.push(ilike(content.title, `%${escaped}%`));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, totalResult] = await Promise.all([
        ctx.db
          // 显式列出字段，不能用 select()：正文是完整富文本 HTML，
          // 一页 20 条全带上会让列表接口的响应体膨胀到不可接受，而列表
          // 一个字都不显示正文。编辑时由 byId 单独取完整记录。
          .select({
            id: content.id,
            type: content.type,
            slug: content.slug,
            title: content.title,
            summary: content.summary,
            categoryId: content.categoryId,
            status: content.status,
            publishedAt: content.publishedAt,
            unpublishedAt: content.unpublishedAt,
            visibleRoles: content.visibleRoles,
            pinned: content.pinned,
            updatedAt: content.updatedAt,
          })
          .from(content)
          .where(where)
          .orderBy(desc(content.updatedAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        ctx.db.select({ total: count() }).from(content).where(where),
      ]);

      return { rows, total: totalResult[0]?.total ?? 0 };
    }),

  byId: manageProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(content)
        .where(eq(content.id, input.id))
        .limit(1);
      if (!row)
        throw new TRPCError({ code: 'NOT_FOUND', message: '内容不存在' });
      return row;
    }),

  create: manageProcedure
    .input(contentInput)
    .mutation(async ({ ctx, input }) => {
      await assertRegisteredType(ctx.db, input.type);
      try {
        const [row] = await ctx.db
          .insert(content)
          .values({
            ...toDbValues(input),
            authorId: ctx.session.user.id,
          })
          .returning();
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) throw DUPLICATE_SLUG;
        console.error('[content.create] 创建失败:', err);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: '创建内容失败',
        });
      }
    }),

  update: manageProcedure
    .input(contentInput.extend({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;

      // 沿用原有类型时不校验登记状态：类型清单是可编辑的，管理员移除某个类型后，
      // 该类型下的历史内容连改个错别字都会保存失败 —— 而此时最需要的恰恰是能把它
      // 改成一个有效类型。换成**别的**类型时仍然必须已登记。
      // 后台表单会把这种未登记的原类型作为额外选项标注出来，两边语义一致。
      const [existing] = await ctx.db
        // 顺带取出旧封面：这一次查询本来就要发（上面的类型校验需要），
        // 多选一列不额外增加开销，却是「换封面后回收旧文件」唯一的信息来源。
        .select({ type: content.type, coverImage: content.coverImage })
        .from(content)
        .where(eq(content.id, id))
        .limit(1);
      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '内容不存在' });
      }
      if (rest.type !== existing.type) {
        await assertRegisteredType(ctx.db, rest.type);
      }

      // try 只裹住 DB 调用本身。此前 NOT_FOUND 也抛在里面，catch 才不得不先写一句
      // `err instanceof TRPCError` 把它放行；收窄范围后那句判断就不需要了，
      // 也避免下面的封面清理万一抛错被误报成「更新内容失败」。
      let updated: (typeof content.$inferSelect)[];
      try {
        updated = await ctx.db
          .update(content)
          .set(toDbValues(rest))
          .where(eq(content.id, id))
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) throw DUPLICATE_SLUG;
        console.error('[content.update] 更新失败:', err);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: '更新内容失败',
        });
      }

      if (updated.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '内容不存在' });
      }

      // 换封面 / 清空封面后，把不再被引用的旧文件删掉，否则每换一次就在存储里
      // 永久留一份孤儿。
      //
      // 比的是「库里的旧值」与「库里的新值」，而不是入参 rest.coverImage ——
      // 入参为 undefined 时 drizzle 会把该列整个跳过（值不变），拿入参判断会把
      // 「这次没动封面」误当成「封面被清空」，把仍在使用的文件删掉。
      const newCover = updated[0]?.coverImage ?? null;
      if (existing.coverImage && existing.coverImage !== newCover) {
        after(deleteFile(existing.coverImage));
      }

      return updated[0];
    }),

  delete: manageProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .delete(content)
        .where(eq(content.id, input.id))
        // 顺带取回封面 URL：内容行没了就再也查不到它引用过哪个文件，
        // 不在这一次 returning 里拿，孤儿文件就永远无法回收。
        .returning({ id: content.id, coverImage: content.coverImage });
      if (deleted.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '内容不存在' });
      }

      // 封面文件跟着内容一起删。不 await：清理失败只会留下一个孤儿文件
      // （等同于改动前的行为），不该让删除内容这个主流程失败；deleteFile 内部
      // 已经自己吞掉异常并记日志。
      //
      // 用 after() 而非裸 void：Serverless 下响应返回后实例即冻结，未保活的删除
      // 请求会被直接丢弃 —— 与 routers/page.ts 的 purgeOrphanAssets 同一处理。
      const removedCover = deleted[0]?.coverImage;
      if (removedCover) after(deleteFile(removedCover));

      return { success: true };
    }),

  // ---- 分类 ----

  listCategories: manageProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(contentCategory)
      .orderBy(contentCategory.sortOrder, contentCategory.id);
  }),

  createCategory: manageProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        slug: slugSchema.max(128),
        parentId: z.number().int().positive().nullable().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const [row] = await ctx.db
          .insert(contentCategory)
          .values(input)
          .returning();
        return row;
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: '已存在相同 slug 的分类',
          });
        }
        console.error('[content.createCategory] 创建失败:', err);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: '创建分类失败',
        });
      }
    }),

  deleteCategory: manageProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      // 引用该分类的内容不会被删除，外键是 ON DELETE SET NULL，
      // 内容会挂回「未分类」；子分类同理挂回顶层。
      const deleted = await ctx.db
        .delete(contentCategory)
        .where(eq(contentCategory.id, input.id))
        .returning({ id: contentCategory.id });
      if (deleted.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '分类不存在' });
      }
      return { success: true };
    }),

  // 门户读取（listPublished / bySlug）曾经也挂在这里，已移除。
  //
  // 它们与 server/services/content-public 的 listPublishedContent /
  // getPublishedContentBySlug 是同一套查询的两份实现，而门户页面是 RSC，直接调
  // service，从来没有走过这两个 procedure —— 运行时零调用点，只有测试在用。
  //
  // 危害不是多几十行代码，而是**测试测的是没人跑的那一份**：两份实现已经开始
  // 漂移（tRPC 版的 select 比 service 版多了 type / categoryId），而任何针对
  // service 版的改动都不会让测试变红。现在测试直接打 service，删掉这层重复。
  //
  // 将来若确实需要从客户端组件读门户内容，再在这里加回一个 publicProcedure 薄封装
  // 转调 content-public 即可，不要重新抄一份查询。
});
