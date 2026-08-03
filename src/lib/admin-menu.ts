import { hasPermission, type Permission, type Role } from '@/lib/rbac';

/**
 * 后台菜单的唯一定义处。
 *
 * 每一项都绑定它所需要的权限点，并且**必须与对应 router 上的权限点一致** ——
 * 菜单可见性与接口鉴权出自两套判断时，结果就是「菜单看得见、点进去 403」，
 * 用户既不知道自己没权限，也不知道是不是系统坏了。
 *
 * 不含图标：图标是 React 组件，放进来会让这个模块无法作为纯逻辑被测试与复用。
 * 由 admin-shell 按 key 映射。
 */
export interface AdminMenuEntry {
  /** 路由路径，同时作为 antd Menu 的 key */
  key: string;
  label: string;
  /** 访问该页面所需的权限点 */
  permission: Permission;
}

export const ADMIN_MENU: readonly AdminMenuEntry[] = [
  { key: '/admin/users', label: '用户管理', permission: 'user.manage' },
  { key: '/admin/content', label: '内容管理', permission: 'content.manage' },
  { key: '/admin/audit-logs', label: '审计日志', permission: 'audit.read' },
  { key: '/admin/setting', label: '门户设置', permission: 'config.manage' },
] as const;

/** 该角色能看到的菜单项 */
export function visibleAdminMenu(role: Role): AdminMenuEntry[] {
  return ADMIN_MENU.filter((item) => hasPermission(role, item.permission));
}

/**
 * 进入 /admin 后应当落到哪个页面。
 *
 * 不能写死第一个菜单：editor 有后台准入但没有用户管理权限，固定跳
 * /admin/users 会让他一进后台就撞 403。返回 null 表示该角色没有任何
 * 可用页面，调用方应当按「无权限」处理。
 */
export function defaultAdminPath(role: Role): string | null {
  return visibleAdminMenu(role)[0]?.key ?? null;
}
