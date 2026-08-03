import { TRPCError } from '@trpc/server';
import { and, count, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { sanitizeContentHtml } from '@/lib/content-html';
import { CONTENT_STATUSES } from '@/lib/content-visibility';
import { ROLES } from '@/lib/rbac';
import {
  createTRPCRouter,
  permissionProcedure,
  publicProcedure,
} from '@/server/api/trpc';
import { isUniqueViolation } from '@/server/db/pg-error';
import { content, contentCategory } from '@/server/db/schema';
import { getUserRole } from '@/server/services/admin-check';
import { visibleContentWhere } from '@/server/services/content-query';

const manageProcedure = permissionProcedure('content.manage');

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
  coverImage: z.string().max(2048).optional(),
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
      try {
        const updated = await ctx.db
          .update(content)
          .set(toDbValues(rest))
          .where(eq(content.id, id))
          .returning();
        if (updated.length === 0) {
          throw new TRPCError({ code: 'NOT_FOUND', message: '内容不存在' });
        }
        return updated[0];
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        if (isUniqueViolation(err)) throw DUPLICATE_SLUG;
        console.error('[content.update] 更新失败:', err);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: '更新内容失败',
        });
      }
    }),

  delete: manageProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .delete(content)
        .where(eq(content.id, input.id))
        .returning({ id: content.id });
      if (deleted.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: '内容不存在' });
      }
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

  // ---- 门户读取 ----
  //
  // 用 publicProcedure：门户内容对匿名访客开放，可见性由 visibleContentWhere
  // 按当前登录角色（未登录为 null）在 SQL 层收敛，不依赖调用方传角色 ——
  // 角色若由入参传入，任何人都能带上 editor 来读定向内容。

  listPublished: publicProcedure
    .input(
      z.object({
        type: z.string().min(1).max(32),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const viewer = {
        role: ctx.session?.user ? getUserRole(ctx.session.user) : null,
        now: new Date(),
      };
      const where = and(
        eq(content.type, input.type),
        visibleContentWhere(viewer),
      );

      const [rows, totalResult] = await Promise.all([
        ctx.db
          .select({
            id: content.id,
            type: content.type,
            slug: content.slug,
            title: content.title,
            summary: content.summary,
            coverImage: content.coverImage,
            categoryId: content.categoryId,
            pinned: content.pinned,
            publishedAt: content.publishedAt,
          })
          .from(content)
          .where(where)
          // 置顶优先，其次按发布时间倒序；publishedAt 可为空，用 id 兜底保证
          // 排序稳定，否则同一页刷新两次顺序可能不同。
          .orderBy(
            desc(content.pinned),
            desc(content.publishedAt),
            desc(content.id),
          )
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        ctx.db.select({ total: count() }).from(content).where(where),
      ]);

      return { rows, total: totalResult[0]?.total ?? 0 };
    }),

  bySlug: publicProcedure
    .input(z.object({ type: z.string().min(1).max(32), slug: slugSchema }))
    .query(async ({ ctx, input }) => {
      const viewer = {
        role: ctx.session?.user ? getUserRole(ctx.session.user) : null,
        now: new Date(),
      };
      const [row] = await ctx.db
        .select()
        .from(content)
        .where(
          and(
            eq(content.type, input.type),
            eq(content.slug, input.slug),
            visibleContentWhere(viewer),
          ),
        )
        .limit(1);
      // 不可见与不存在返回同一个 NOT_FOUND：区分开会变成一个探测接口，
      // 让未授权者能枚举出哪些 slug 存在但对自己不可见。
      if (!row)
        throw new TRPCError({ code: 'NOT_FOUND', message: '内容不存在' });
      return row;
    }),
});
