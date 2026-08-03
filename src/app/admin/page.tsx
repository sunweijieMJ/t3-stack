import { redirect } from 'next/navigation';
import { defaultAdminPath } from '@/lib/admin-menu';
import { getSession } from '@/server/better-auth/server';
import { getUserRole } from '@/server/services/admin-check';

/**
 * 后台首页只做落点分发。
 *
 * 不能写死 /admin/setting：那个页面要 config.manage，而 editor 只有
 * content.manage —— 一进后台就撞 403。按角色取第一个有权限的页面。
 */
export default async function AdminIndexPage() {
  const session = await getSession();
  // layout 已经挡过未登录与无后台权限的情况，这里只处理落点
  const target = session?.user
    ? defaultAdminPath(getUserRole(session.user))
    : null;
  redirect(target ?? '/no-access');
}
