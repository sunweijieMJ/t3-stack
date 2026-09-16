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
 * 访问某个后台路径需要的权限点；没有对应菜单项的路径返回 null（不额外限制）。
 *
 * 只靠 visibleAdminMenu 过滤菜单是不够的 —— 那只藏起了入口，直接在地址栏敲
 * /admin/users 照样进得去：页面骨架照常渲染，里面每个 query 都 403，表格空着、
 * 弹一串报错。数据没泄露（服务端拒了），但这正是本文件开头说要避免的那种
 * 「看得见、进去全是 403」，只不过换成了 URL 直达这条路。由 proxy.ts 调用。
 *
 * 前缀匹配是为了覆盖将来的子路由（/admin/content/123）。/admin 自身没有菜单项，
 * 返回 null 放行给 admin/page.tsx 按角色分发落点。
 */
export function permissionForAdminPath(pathname: string): Permission | null {
  const entry = ADMIN_MENU.find(
    (item) => pathname === item.key || pathname.startsWith(`${item.key}/`),
  );
  return entry?.permission ?? null;
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

/**
 * 把「期望落点」收敛成该角色确实进得去的页面。
 *
 * `basic.defaultPage` 由管理员自由填写、可以指向后台，而后台对不同角色开放的
 * 页面并不相同。直接跳过去的结果是「登录成功 → 立刻被路由守卫打到 /no-access」，
 * 用户看到的第一屏是「当前账号无权访问后台」——这对一个只是来看定向内容的
 * user 角色来说完全是误导。
 *
 * 规则：
 *   - 非后台路径 → 原样返回（门户页面不做权限限制）
 *   - 后台路径且有对应权限 → 原样返回
 *   - 有后台准入但进不去这个页面（如 editor 被配到了 /admin/users）→ 他自己的后台首页
 *   - 没有后台准入 → 门户首页
 *
 * 只收紧不放宽：它永远不会把人送进一个权限校验通不过的页面。真正的鉴权仍在
 * proxy.ts 与各 procedure 上，这里只负责「别把人往墙上撞」。
 *
 * 入参应当是已经过 safeInternalPath 的站内路径，本函数不再做开放重定向校验。
 */
export function resolveLandingPath(desired: string, role: Role): string {
  // 必须先切掉查询串与锚点再做匹配。desired 的来源是 ?callbackUrl= 与管理员自由
  // 填写的 defaultPage，safeInternalPath 只保证「不逃逸出本站」，`/admin?tab=1`
  // 照样通过。拿整串去比对的话，它既不等于 '/admin' 也不以 '/admin/' 开头，
  // 于是被当成门户路径原样放行，而 proxy.ts 是按 pathname 匹配的 —— 结果正是
  // 本函数要消除的那一幕：登录成功后被弹到 /no-access。
  // 返回时用原串，查询参数不能丢。
  const pathname = desired.split(/[?#]/)[0] ?? '';

  // 登录流程自身的页面不能当落点：signin 页在有 session 时会跳向落点，
  // 落点又是它自己，两边互相弹成 ERR_TOO_MANY_REDIRECTS。
  if (isAuthPath(pathname)) return '/';

  if (pathname !== '/admin' && !pathname.startsWith('/admin/')) return desired;

  // /admin 自身在 ADMIN_MENU 里没有条目，它要的是「能进后台」这个总开关
  const required = permissionForAdminPath(pathname) ?? 'admin.access';
  if (hasPermission(role, required)) return desired;

  return hasPermission(role, 'admin.access')
    ? (defaultAdminPath(role) ?? '/')
    : '/';
}

function isAuthPath(pathname: string): boolean {
  return pathname === '/signin' || pathname.startsWith('/signin/');
}
