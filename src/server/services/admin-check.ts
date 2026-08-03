import 'server-only';
import { env } from '@/env';
import {
  hasPermission,
  type Permission,
  type Role,
  resolveRole,
} from '@/lib/rbac';

const adminEmails = (env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails.includes(email.trim().toLowerCase());
}

/**
 * 由 session 上的用户信息算出最终角色。
 *
 * 这是全站唯一的角色来源，鉴权处不要绕过它直接读 user.role —— 那样会漏掉
 * ADMIN_EMAILS 白名单这一路，导致「环境变量里配了管理员却进不去后台」。
 */
export function getUserRole(user: {
  email?: string | null;
  role?: unknown;
}): Role {
  return resolveRole(user.role, isAdminEmail(user.email));
}

/** 判断 session 上的用户是否具备某个权限点。 */
export function userCan(
  user: { email?: string | null; role?: unknown },
  permission: Permission,
): boolean {
  return hasPermission(getUserRole(user), permission);
}
