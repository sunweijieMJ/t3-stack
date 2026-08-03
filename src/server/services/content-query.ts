import { and, eq, gt, isNull, lte, or, type SQL, sql } from 'drizzle-orm';
import type { Viewer } from '@/lib/content-visibility';
import { content } from '@/server/db/schema';

/**
 * 「此刻对该访问者可见」的 SQL 谓词，供门户侧列表与详情查询共用。
 *
 * 为什么不复用 lib/content-visibility 的 isContentVisibleTo：那是逐行判定的
 * 纯函数，用它过滤就得先把全表捞进内存，分页和排序都没法交给数据库。列表页
 * 必须在 SQL 里过滤。
 *
 * 于是同一套语义存在两份实现，这是真实的重复风险 —— 由 tests/content-query
 * 里的交叉验证兜底：同一批样本分别走 SQL 与纯函数，结果必须逐个相等。谁只改
 * 了一处（比如给 SQL 悄悄加了 admin 后门），那条用例立刻会红。改可见性规则时
 * 两处要一起改，并确认该测试仍然通过。
 *
 * 语义与 resolveContentState 保持一致：
 * - 只认 status='published'（草稿与归档一律不可见）
 * - published_at 为空视为立即生效
 * - unpublished_at 为空视为长期有效，到点即失效（用 > now，与纯函数的
 *   `unpublishedAt <= now 判为 expired` 互为补集）
 * - visible_roles 为空数组表示公开；非空时按角色匹配，且不给 admin 特权
 */
export function visibleContentWhere(viewer: Viewer): SQL {
  const conditions: SQL[] = [
    eq(content.status, 'published'),
    // biome-ignore lint/style/noNonNullAssertion: or() 入参非空时必定返回 SQL
    or(isNull(content.publishedAt), lte(content.publishedAt, viewer.now))!,
    // biome-ignore lint/style/noNonNullAssertion: 同上
    or(isNull(content.unpublishedAt), gt(content.unpublishedAt, viewer.now))!,
  ];

  // 角色过滤：cardinality=0 表示不限制。已登录时再放行「角色命中白名单」的行，
  // 用 = ANY(...) 而非 && 运算符 —— 前者只需一个标量参数，避免把角色包成数组
  // 再走数组重叠，SQL 更直白且能利用同样的索引路径。
  const noRoleLimit = sql`cardinality(${content.visibleRoles}) = 0`;
  conditions.push(
    viewer.role === null
      ? noRoleLimit
      : // biome-ignore lint/style/noNonNullAssertion: or() 入参非空时必定返回 SQL
        or(noRoleLimit, sql`${viewer.role} = ANY(${content.visibleRoles})`)!,
  );

  // biome-ignore lint/style/noNonNullAssertion: and() 入参非空时必定返回 SQL
  return and(...conditions)!;
}
