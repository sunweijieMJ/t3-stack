import 'server-only';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { cache } from 'react';
import {
  type ContentType,
  findContentType,
  resolveContentTypes,
} from '@/lib/content-types';
import type { Viewer } from '@/lib/content-visibility';
import { getSession } from '@/server/better-auth/server';
import { db } from '@/server/db';
import { content } from '@/server/db/schema';
import { getUserRole } from '@/server/services/admin-check';
import { getFrontendConfig } from '@/server/services/config';
import { visibleContentWhere } from '@/server/services/content-query';

/**
 * 由当前登录态解析出访问者。未登录时 role 为 null。
 *
 * 角色只能这样得来 —— 从服务端 session 推导，绝不能由路由参数或查询串传入，
 * 否则任何人拼一个 ?role=editor 就能读到定向内容。
 */
export async function getViewer(): Promise<Viewer> {
  const session = await getSession();
  return {
    role: session?.user ? getUserRole(session.user) : null,
    now: new Date(),
  };
}

/**
 * 页码上界。offset 由 (page-1)*pageSize 算出，不封顶的话一个大页码就是一次
 * 深分页全表扫；内容表也不可能有这么多页，超出即视为无效输入。
 */
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;

/** 收敛成 [1, MAX_PAGE] 内的整数，非法输入一律回落到第 1 页 */
export function clampPage(value: unknown): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}

function clampPageSize(value: unknown): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(n, MAX_PAGE_SIZE);
}

/**
 * 门户列表：置顶优先，其次发布时间倒序，id 兜底保证翻页顺序稳定。
 *
 * 第二档必须用 COALESCE(published_at, created_at) 而不能直接 `desc(publishedAt)`：
 * 后台的「发布时间」是可选项，不填就落 NULL，而 PostgreSQL 的 DESC 默认 NULLS FIRST ——
 * 这类内容会**永久排在所有填了时间的内容之前**，连置顶项都压不住它（同属 pinned=false 档），
 * 列表页还因为取不到日期而不显示时间，现场看不出任何异常。
 *
 * 回落到 created_at 而不是简单加 NULLS LAST：未填发布时间的内容在 visibleContentWhere 里
 * 是「立即生效」的（见 lib/content-visibility），把它沉到列表最底同样不对 ——
 * 它应该按「什么时候有的这篇」排，这正是 created_at 的语义。
 */
export async function listPublishedContent(params: {
  type: string;
  page?: number;
  pageSize?: number;
}) {
  // 页码在这里收敛，而不是只在调用页收敛：offset 直接由它算出，一个 Infinity /
  // 1e21 / 小数传进来，postgres.js 会把它按 String(x) 发给 PG 去转 bigint 并直接
  // 报语法错误 —— 门户列表页因此渲染 500，而不是回落到第 1 页。
  // 放在 service 里，将来任何新调用方（RSS、搜索、API）都自动受保护。
  const page = clampPage(params.page);
  const pageSize = clampPageSize(params.pageSize);
  const viewer = await getViewer();
  const where = and(eq(content.type, params.type), visibleContentWhere(viewer));

  const [rows, totalResult] = await Promise.all([
    db
      .select({
        id: content.id,
        slug: content.slug,
        title: content.title,
        summary: content.summary,
        coverImage: content.coverImage,
        pinned: content.pinned,
        publishedAt: content.publishedAt,
      })
      .from(content)
      .where(where)
      .orderBy(
        desc(content.pinned),
        sql`coalesce(${content.publishedAt}, ${content.createdAt}) desc`,
        desc(content.id),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(content).where(where),
  ]);

  return { rows, total: totalResult[0]?.total ?? 0, page, pageSize };
}

/**
 * 门户详情。不可见与不存在一律返回 null，由调用方渲染 404，避免变成探测接口。
 *
 * 裹 React.cache 做请求级去重：详情页的 generateMetadata 与页面组件会各调一次
 * （同一组 type/slug），不去重就是每个请求两趟同样的查询。Next 的自动去重只覆盖
 * 被它扩展过的 fetch()，直连 Drizzle 的查询不在其列 —— 同 getFrontendConfig 的处理。
 */
export const getPublishedContentBySlug = cache(
  async (type: string, slug: string) => {
    const viewer = await getViewer();
    const [row] = await db
      .select()
      .from(content)
      .where(
        and(
          eq(content.type, type),
          eq(content.slug, slug),
          visibleContentWhere(viewer),
        ),
      )
      .limit(1);
    return row ?? null;
  },
);

/** 后台配置的内容类型清单 */
export async function getContentTypes(): Promise<ContentType[]> {
  const cfg = await getFrontendConfig();
  return resolveContentTypes(cfg.content?.types);
}

/** 按 slug 取类型；未登记返回 null，调用方据此 404 */
export async function getContentType(
  slug: string,
): Promise<ContentType | null> {
  return findContentType(await getContentTypes(), slug);
}

/**
 * 供 sitemap 使用：匿名可见的全部内容。
 *
 * 视角固定为未登录访客 —— sitemap 是公开文件，把仅限特定角色可见的内容
 * 列进去等于把它们泄露给所有人（连同标题和 URL）。
 *
 * 设上限而非全量：内容表会持续增长，无上限的查询迟早会拖垮 sitemap 请求。
 * 超出部分不会被收录，这对模板的默认行为是可接受的取舍。
 */
const SITEMAP_LIMIT = 5000;

export async function listSitemapContent() {
  return db
    .select({
      type: content.type,
      slug: content.slug,
      updatedAt: content.updatedAt,
    })
    .from(content)
    .where(visibleContentWhere({ role: null, now: new Date() }))
    .orderBy(desc(content.updatedAt))
    .limit(SITEMAP_LIMIT);
}
