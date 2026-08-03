import 'server-only';
import { and, count, desc, eq } from 'drizzle-orm';
import type { Viewer } from '@/lib/content-visibility';
import { getSession } from '@/server/better-auth/server';
import { db } from '@/server/db';
import { content } from '@/server/db/schema';
import { getUserRole } from '@/server/services/admin-check';
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

/** 门户列表：置顶优先，其次发布时间倒序，id 兜底保证翻页顺序稳定 */
export async function listPublishedContent(params: {
  type: string;
  page?: number;
  pageSize?: number;
}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;
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
        desc(content.publishedAt),
        desc(content.id),
      )
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(content).where(where),
  ]);

  return { rows, total: totalResult[0]?.total ?? 0, page, pageSize };
}

/** 门户详情。不可见与不存在一律返回 null，由调用方渲染 404，避免变成探测接口 */
export async function getPublishedContentBySlug(type: string, slug: string) {
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
}
