import { redirect } from 'next/navigation';
import { resolveLandingPath } from '@/lib/admin-menu';
import { safeInternalPath } from '@/lib/safe-path';
import { getSession } from '@/server/better-auth/server';
import { getUserRole } from '@/server/services/admin-check';

/**
 * 登录成功后的落点分发。
 *
 * 为什么要绕这一趟服务端：落点可能指向后台，而「这个账号能不能进这个后台页面」
 * 取决于 ADMIN_EMAILS 白名单与数据库角色的**合并**结果，getUserRole 是 server-only，
 * 客户端算不出来。在客户端只按 session.user.role 判断会漏掉「靠白名单当管理员」
 * 那一路，等于把 lib/rbac 的判定复制出第二份 —— 那正是该模块开头明确要避免的。
 *
 * 不做这一步的后果：defaultPage 指向 /admin 时（旧版本的默认值就是它，且会被
 * 可视化编辑器连同其他默认值一起显式写进库里，所以存量部署几乎都是这个值），
 * 普通用户登录成功后立刻被路由守卫弹到 /no-access，第一屏是「当前账号无权访问后台」。
 * signin/page.tsx 里那次收敛只覆盖「已登录又访问登录页」，覆盖不到首次登录。
 */
export const dynamic = 'force-dynamic';

export default async function SignInLandingPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string | string[] }>;
}) {
  const { to } = await searchParams;
  const raw = Array.isArray(to) ? to[0] : to;
  // to 来自客户端，同样要过开放重定向白名单 —— 不能因为「是我们自己拼的」就免检
  const desired = safeInternalPath(raw) ?? '/';

  const session = await getSession();
  // 会话没建立起来（cookie 被拦截、时钟偏移导致签名过期等）：回登录页重来，
  // 并把原本的目的地带上，避免用户重新登录后又落回默认页。
  if (!session?.user) {
    redirect(`/signin?callbackUrl=${encodeURIComponent(desired)}`);
  }

  redirect(resolveLandingPath(desired, getUserRole(session.user)));
}
