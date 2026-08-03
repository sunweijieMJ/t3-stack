import type { Role } from '@/lib/rbac';

/** 内容的存储状态（人工设置） */
export const CONTENT_STATUSES = ['draft', 'published', 'archived'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/**
 * 内容的实际生效状态（存储状态 + 时间窗口共同决定）。
 * 与 ContentStatus 分开是因为「已发布」并不等于「现在对外可见」——
 * 定时发布未到点、定时下架已过期，库里的 status 都还是 'published'。
 */
export type ContentState =
  | 'draft'
  | 'scheduled'
  | 'live'
  | 'expired'
  | 'archived';

export interface ContentVisibilityInput {
  status: ContentStatus;
  /** 定时发布时间；null 表示发布即生效 */
  publishedAt: Date | null;
  /** 定时下架时间；null 表示长期有效 */
  unpublishedAt: Date | null;
  /** 可见角色白名单；空数组表示不限制（含未登录访客） */
  visibleRoles: readonly Role[];
}

export interface Viewer {
  /** null 表示未登录访客 */
  role: Role | null;
  now: Date;
}

/**
 * 计算内容此刻的实际状态。
 *
 * 判定顺序是有讲究的：先看人工状态（draft / archived 一票否决），再看下架时间，
 * 最后才看发布时间。下架优先于发布，是为了让「下架时间早于发布时间」这种
 * 配错的数据落到 expired 而不是 live —— 配错时宁可少露出，不可多露出。
 */
export function resolveContentState(
  content: ContentVisibilityInput,
  now: Date,
): ContentState {
  if (content.status === 'draft') return 'draft';
  if (content.status === 'archived') return 'archived';
  if (content.unpublishedAt && content.unpublishedAt <= now) return 'expired';
  if (content.publishedAt && content.publishedAt > now) return 'scheduled';
  return 'live';
}

/**
 * 判断某个访问者此刻能否看到这条内容。
 *
 * 这是**门户侧**的可见性，不包含后台预览：草稿对管理员同样返回 false。
 * 后台要看草稿应当走带权限校验的管理接口，而不是让这个函数按角色开口子——
 * 一旦开了口子，任何复用它的门户查询都会跟着把草稿露给管理员之外的角色，
 * 因为调用方很容易只传角色而忘了区分「门户浏览」和「后台预览」两种场景。
 *
 * visibleRoles 为空表示公开。非空时按白名单匹配，且**不给 admin 特权**：
 * 「仅教师可见」的内容对管理员也应当隐藏，否则按角色定向投放就失去了意义。
 */
export function isContentVisibleTo(
  content: ContentVisibilityInput,
  viewer: Viewer,
): boolean {
  if (resolveContentState(content, viewer.now) !== 'live') return false;
  if (content.visibleRoles.length === 0) return true;
  if (viewer.role === null) return false;
  return content.visibleRoles.includes(viewer.role);
}
