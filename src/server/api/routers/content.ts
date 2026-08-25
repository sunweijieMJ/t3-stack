import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, ilike, isNull, type SQL } from 'drizzle-orm';
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

/**
 * 分类树的最大层数。既是环路检测的兜底，也是「别把分类做成无限深」的显式表态：
 * 门户导航展示不了十几层，深树只会让后台的父级下拉变成一堆看不懂的缩进。
 */
const MAX_CATEGORY_DEPTH = 8;

/**
 * 校验把 `id` 挂到 `parentId` 下不会形成环。
 *
 * contentCategory.parentId 自引用，数据库层没有任何约束能拦住环：把 A 的父级设成
 * B、再把 B 的父级设成 A 就成了，而任何**不带深度上限**地自顶向下遍历这棵树的代码
 * 都会无限递归下去。
 *
 * 这道校验与调用侧的深度上限是**有意重复**的两层，别因为「另一边已经挡了」就删掉
 * 任何一边：
 *   - 这里挡的是「坏数据进不来」；
 *   - admin/content 的 categoryDepth 与下面的循环上限挡的是「万一坏数据已经在库里
 *     （历史数据、手工改库），页面也只是显示层级不对，而不是卡死浏览器」。
 * 也正因为有第二层，环并不会让分类管理页打不开，管理员仍能把父级改回「顶层」自救
 * （parentId=null 在本函数开头就直接放行）—— 但那是兜底，不是不做校验的理由。
 *
 * 判据是从目标父级往上走：路上撞见 id 自己，说明 id 是它的祖先，这条边会成环。
 */
async function assertNoCategoryCycle(
  db: PostgresJsDatabase<typeof schema>,
  id: number,
  parentId: number | null,
): Promise<void> {
  if (parentId === null) return;
  if (parentId === id) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: '不能把分类的父级设为它自己',
    });
  }

  let cursor: number | null = parentId;
  for (let depth = 0; depth < MAX_CATEGORY_DEPTH; depth++) {
    if (cursor === null) return;
    if (cursor === id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: '该分类是目标父级的上级，这样设置会形成循环',
      });
    }
    const [row] = await db
      .select({ parentId: contentCategory.parentId })
      .from(contentCategory)
      .where(eq(contentCategory.id, cursor))
      .limit(1);
    if (!row) return; // 父级已被删除，交给外键去处理
    cursor = row.parentId;
  }

  // 走满上限还没到根：要么已经有环（历史脏数据），要么层数超标。两种都拒绝，
  // 拒绝方向是安全的 —— 不会让一条新的坏边进来。
  throw new TRPCError({
    code: 'BAD_REQUEST',
    message: `分类层级不能超过 ${MAX_CATEGORY_DEPTH} 层`,
  });
}

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
        // 0 表示「未分类」（categoryId IS NULL）。用一个哨兵值而不是额外加一个
        // boolean 参数：下拉框的取值天然是单一维度，两个参数会出现
        // 「categoryId=3 且 uncategorized=true」这种表达不出语义的组合。
        // min(0) 而非 positive()：0 就是那个哨兵值，必须能通过校验。
        categoryId: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conditions: SQL[] = [];
      if (input.type) conditions.push(eq(content.type, input.type));
      if (input.status) conditions.push(eq(content.status, input.status));
      if (input.categoryId !== undefined) {
        conditions.push(
          input.categoryId === 0
            ? isNull(content.categoryId)
            : eq(content.categoryId, input.categoryId),
        );
      }
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
            // 分类名随列表一起取回，避免前端拿 categoryId 再去 listCategories 里
            // 自己映射 —— 那样分类被删掉之后（外键 SET NULL）两边会短暂不一致，
            // 表格显示的是一个已经不存在的分类名。leftJoin 保证「没分类」与
            // 「分类已删」都落到 null，语义一致。
            categoryName: contentCategory.name,
          })
          .from(content)
          .leftJoin(contentCategory, eq(content.categoryId, contentCategory.id))
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

  updateCategory: manageProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(128),
        slug: slugSchema.max(128),
        parentId: z.number().int().positive().nullable().optional(),
        sortOrder: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...rest } = input;
      // parentId 显式传 undefined 时表示「不动父级」，此时不需要环路校验；
      // 传 null（挂到顶层）也不可能成环。
      if (rest.parentId !== undefined) {
        await assertNoCategoryCycle(ctx.db, id, rest.parentId ?? null);
      }

      let updated: (typeof contentCategory.$inferSelect)[];
      try {
        updated = await ctx.db
          .update(contentCategory)
          .set(rest)
          .where(eq(contentCategory.id, id))
          .returning();
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: '已存在相同 slug 的分类',
          });
        }
        console.error('[content.updateCategory] 更新失败:', err);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: '更新分类失败',
        });
      }

      if (updated.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '分类不存在' });
      }
      return updated[0];
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
