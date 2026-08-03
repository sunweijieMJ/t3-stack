import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth-schema';
import { createTable } from './table-creator';

/**
 * 内容分类。自引用 parentId 支持无限层级，删除父级时子级挂回顶层
 * （set null）而不是级联删掉整棵子树 —— 误删一个父分类不该带走底下所有内容。
 */
export const contentCategory = createTable(
  'content_category',
  (d) => ({
    id: serial('id').primaryKey(),
    name: d.varchar({ length: 128 }).notNull(),
    slug: d.varchar({ length: 128 }).notNull().unique(),
    parentId: integer('parent_id').references(
      (): AnyPgColumn => contentCategory.id,
      { onDelete: 'set null' },
    ),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: d
      .timestamp('created_at', { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d
      .timestamp('updated_at', { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (t) => [index('content_category_parent_idx').on(t.parentId)],
);

/**
 * 统一内容表。公告、新闻、文章、案例等都存在这里，靠 type 区分。
 *
 * 不为每类内容单独建表：这些内容在权限、发布、检索上的行为完全一致，
 * 分表意味着每加一种内容就要复制一套增删改查、一套后台界面和一套可见性
 * 判定，而三份可见性判定迟早会各自跑偏。加一种内容在这里只是多一个 type 值。
 *
 * body 存净化后的 HTML，净化在写入侧完成（见 lib/content-html.ts）。
 * status / publishedAt / unpublishedAt / visibleRoles 的组合语义定义在
 * lib/content-visibility.ts。单行判定用那里的纯函数；列表查询要分页，必须
 * 在 SQL 里过滤，走 services/content-query 的 visibleContentWhere。两者是
 * 同一套语义的两份实现，由 tests/content-query 的交叉验证保证不跑偏 ——
 * 改可见性规则时两处都要改。
 */
export const content = createTable(
  'content',
  (d) => ({
    id: serial('id').primaryKey(),
    type: d.varchar({ length: 32 }).notNull(),
    slug: d.varchar({ length: 200 }).notNull(),
    title: d.varchar({ length: 256 }).notNull(),
    summary: text('summary'),
    body: text('body').notNull().default(''),
    coverImage: text('cover_image'),
    categoryId: integer('category_id').references(() => contentCategory.id, {
      onDelete: 'set null',
    }),
    status: d.varchar({ length: 16 }).notNull().default('draft'),
    /** 定时发布；null 表示发布即生效 */
    publishedAt: d.timestamp('published_at', { withTimezone: true }),
    /** 定时下架；null 表示长期有效 */
    unpublishedAt: d.timestamp('unpublished_at', { withTimezone: true }),
    /**
     * 可见角色白名单，空数组表示公开。
     * 用 text[] 而非 jsonb：PG 的数组重叠运算符（&&）能直接下推到 SQL 做过滤，
     * jsonb 要绕 jsonb_array_elements，写法和索引都更别扭。
     */
    visibleRoles: text('visible_roles')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    pinned: boolean('pinned').notNull().default(false),
    // 作者删号后内容保留，署名置空 —— 与 admin_audit_log 对 user 的处理一致。
    authorId: text('author_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: d
      .timestamp('created_at', { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: d
      .timestamp('updated_at', { withTimezone: true })
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date())
      .notNull(),
  }),
  (t) => [
    // slug 只在同一 type 内唯一：公告和新闻各有一篇 slug='2026-notice' 是合理的，
    // 全局唯一会让两类内容互相抢名字。
    uniqueIndex('content_type_slug_idx').on(t.type, t.slug),
    // 门户列表的固定查询形态：按 type 过滤 + 按状态过滤 + 置顶优先 + 时间倒序。
    index('content_type_status_idx').on(t.type, t.status),
    index('content_published_at_idx').on(t.publishedAt),
    index('content_category_idx').on(t.categoryId),
  ],
);
