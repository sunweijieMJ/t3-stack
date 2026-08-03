/**
 * 基于角色的访问控制（RBAC）。
 *
 * 零依赖纯逻辑模块：服务端（trpc adminProcedure、admin-check）与客户端
 * （后台菜单按权限过滤）共用同一份判定规则，避免两侧各写一套后出现
 * 「菜单看得见、点进去 403」这类不一致。
 *
 * 扩展方式：加角色改 ROLES + ROLE_PERMISSIONS，加权限点改 PERMISSIONS。
 * 业务代码一律只判断权限点，不要直接比对角色名 —— 否则新增角色时要满仓库
 * 找 `role === 'admin'` 这种硬编码。
 */

export const ROLES = ['admin', 'editor', 'user'] as const;
export type Role = (typeof ROLES)[number];

/** 新用户与历史数据的兜底角色，权限最小 */
export const DEFAULT_ROLE: Role = 'user';

export const PERMISSIONS = [
  /** 能否进入后台（菜单可见性与 /admin 路由守卫的总开关） */
  'admin.access',
  'user.manage',
  'config.manage',
  'audit.read',
  /** 清理日志、改保留策略等破坏性操作，与只读分开 */
  'audit.manage',
  'content.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> =
  Object.freeze({
    admin: Object.freeze([...PERMISSIONS]),
    editor: Object.freeze<Permission[]>(['admin.access', 'content.manage']),
    user: Object.freeze<Permission[]>([]),
  });

const ROLE_SET: ReadonlySet<string> = new Set(ROLES);

const NO_PERMISSIONS: readonly Permission[] = Object.freeze([]);

/**
 * 把任意来源的值收敛成合法角色。
 *
 * 不抛错而是回落到 DEFAULT_ROLE：role 的来源是数据库文本列与 session，
 * 历史数据、手工改库、回滚到旧版本都可能带来预期外的值。让鉴权因为一个
 * 脏值直接抛异常，会把「权限不足」变成「整个接口 500」，且回落方向是
 * 权限最小的角色，脏值不会意外提权。
 */
export function normalizeRole(value: unknown): Role {
  return typeof value === 'string' && ROLE_SET.has(value)
    ? (value as Role)
    : DEFAULT_ROLE;
}

export function permissionsOf(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? NO_PERMISSIONS;
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return permissionsOf(role).includes(permission);
}

/**
 * 合并「环境变量白名单」与「数据库角色」两个来源，得到最终角色。
 *
 * ADMIN_EMAILS 必须保留且优先级最高，原因是它是**引导通道**：全新部署时
 * 库里一个 admin 都没有，只能靠环境变量把第一个人送进后台（scripts/seed-admin.ts
 * 也依赖同一份白名单）。如果改成纯数据库角色，一旦最后一个 admin 被误降级，
 * 就再没有任何途径能进后台，只能手工改库。
 *
 * 反过来也意味着：白名单里的邮箱在数据库里被设成什么角色都无所谓，始终是 admin。
 * 这是有意的，不是 bug —— 白名单本身就是「运维层面的最高授权」。
 */
export function resolveRole(dbRole: unknown, isEnvAdmin: boolean): Role {
  return isEnvAdmin ? 'admin' : normalizeRole(dbRole);
}
