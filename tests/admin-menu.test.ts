import { describe, expect, it } from 'vitest';
import {
  ADMIN_MENU,
  defaultAdminPath,
  permissionForAdminPath,
  resolveLandingPath,
  visibleAdminMenu,
} from '@/lib/admin-menu';
import { hasPermission, ROLES } from '@/lib/rbac';

describe('visibleAdminMenu', () => {
  it('admin 能看到全部菜单', () => {
    expect(visibleAdminMenu('admin')).toHaveLength(ADMIN_MENU.length);
  });

  it('editor 只看到内容管理', () => {
    expect(visibleAdminMenu('editor').map((m) => m.key)).toEqual([
      '/admin/content',
    ]);
  });

  it('普通用户看不到任何菜单', () => {
    expect(visibleAdminMenu('user')).toHaveLength(0);
  });

  // 这条是本文件的存在理由：菜单可见性与接口鉴权必须出自同一份权限判定。
  // 两边各写一套的后果是「菜单看得见、点进去 403」，用户完全无法理解。
  it.each([
    'admin',
    'editor',
    'user',
  ] as const)('菜单可见性与权限判定完全一致（role=%s）', (role) => {
    const visible = visibleAdminMenu(role).map((m) => m.key);
    const expected = ADMIN_MENU.filter((m) =>
      hasPermission(role, m.permission),
    ).map((m) => m.key);

    expect(visible).toEqual(expected);
  });
});

describe('defaultAdminPath', () => {
  it('admin 落到第一个菜单', () => {
    expect(defaultAdminPath('admin')).toBe(ADMIN_MENU[0]?.key);
  });

  it('editor 落到自己有权限的页面而不是第一个菜单', () => {
    expect(defaultAdminPath('editor')).toBe('/admin/content');
  });

  it('没有任何后台权限时返回 null', () => {
    expect(defaultAdminPath('user')).toBeNull();
  });
});

describe('permissionForAdminPath', () => {
  it('菜单页返回对应权限点', () => {
    expect(permissionForAdminPath('/admin/users')).toBe('user.manage');
    expect(permissionForAdminPath('/admin/content')).toBe('content.manage');
    expect(permissionForAdminPath('/admin/audit-logs')).toBe('audit.read');
    expect(permissionForAdminPath('/admin/setting')).toBe('config.manage');
  });

  it('子路由继承父页面的权限点', () => {
    expect(permissionForAdminPath('/admin/content/123')).toBe('content.manage');
    expect(permissionForAdminPath('/admin/users/abc/edit')).toBe('user.manage');
  });

  it('/admin 自身不额外限制，交给落点分发', () => {
    expect(permissionForAdminPath('/admin')).toBeNull();
  });

  it('未登记的后台路径不额外限制（交给 404）', () => {
    expect(permissionForAdminPath('/admin/nope')).toBeNull();
  });

  // 前缀匹配不能退化成 startsWith(item.key)：那样 /admin/users-export 这种
  // 同前缀的**不同**页面会被误判成继承 /admin/users 的权限。
  it('同前缀的不同路径不会被误匹配', () => {
    expect(permissionForAdminPath('/admin/users-export')).toBeNull();
    expect(permissionForAdminPath('/admin/settings')).toBeNull();
  });

  // 这条守的是 URL 直达：菜单藏起来了，地址栏敲进去也必须被挡下。
  it.each([
    ['editor', '/admin/users', false],
    ['editor', '/admin/setting', false],
    ['editor', '/admin/audit-logs', false],
    ['editor', '/admin/content', true],
    ['admin', '/admin/users', true],
  ] as const)('role=%s 访问 %s → %s', (role, path, allowed) => {
    const permission = permissionForAdminPath(path);
    expect(permission === null || hasPermission(role, permission)).toBe(
      allowed,
    );
  });
});

describe('resolveLandingPath', () => {
  it('门户路径不受角色影响', () => {
    for (const role of ROLES) {
      expect(resolveLandingPath('/', role)).toBe('/');
      expect(resolveLandingPath('/content/news', role)).toBe('/content/news');
    }
  });

  it('有权限的后台路径原样返回', () => {
    expect(resolveLandingPath('/admin', 'admin')).toBe('/admin');
    expect(resolveLandingPath('/admin/users', 'admin')).toBe('/admin/users');
    expect(resolveLandingPath('/admin/content', 'editor')).toBe(
      '/admin/content',
    );
  });

  // 这条是本函数的存在理由：普通用户登录后的第一屏不能是「无权访问后台」。
  it('没有后台准入的角色被送回门户首页', () => {
    expect(resolveLandingPath('/admin', 'user')).toBe('/');
    expect(resolveLandingPath('/admin/content', 'user')).toBe('/');
  });

  it('能进后台但进不去该页面时，落到自己的后台首页', () => {
    expect(resolveLandingPath('/admin/users', 'editor')).toBe('/admin/content');
    expect(resolveLandingPath('/admin/setting', 'editor')).toBe(
      '/admin/content',
    );
  });

  // 带查询串的后台路径必须照样被识别出来。safeInternalPath 会放行
  // `/admin?tab=1`，而 proxy.ts 是按 pathname 匹配的 —— 这里若只比整串，
  // 它会被当成门户路径原样放行，然后在路由守卫那里被弹到 /no-access。
  it('查询串与锚点不影响后台路径识别', () => {
    expect(resolveLandingPath('/admin?tab=1', 'user')).toBe('/');
    expect(resolveLandingPath('/admin/content#top', 'user')).toBe('/');
    expect(resolveLandingPath('/admin/users?page=2', 'editor')).toBe(
      '/admin/content',
    );
  });

  it('有权限时保留查询串', () => {
    expect(resolveLandingPath('/admin/content?page=2', 'admin')).toBe(
      '/admin/content?page=2',
    );
  });

  // 登录页在有 session 时会跳向落点；落点又是登录页的话两边互相弹，
  // 浏览器最终报 ERR_TOO_MANY_REDIRECTS。
  it.each(ROLES)('登录流程自身的页面不能作为落点（role=%s）', (role) => {
    expect(resolveLandingPath('/signin', role)).toBe('/');
    expect(resolveLandingPath('/signin/landing', role)).toBe('/');
    expect(resolveLandingPath('/signin?callbackUrl=/admin', role)).toBe('/');
  });

  // 只收紧不放宽：返回值必须是该角色真正通得过路由守卫的路径，
  // 判据与 proxy.ts 用的是同一个 permissionForAdminPath。
  it.each(ROLES)('返回值一定能通过路由守卫（role=%s）', (role) => {
    const candidates = [
      '/',
      '/content/news',
      '/admin',
      '/admin/users',
      '/admin/content',
      '/admin/audit-logs',
      '/admin/setting',
      // 带查询串/锚点的形态一并纳入：它们曾经绕开整条判断
      '/admin?tab=1',
      '/admin/users?page=2',
      '/admin/setting#seo',
      '/signin',
      '/signin/landing?to=/admin',
    ];
    for (const desired of candidates) {
      const landing = resolveLandingPath(desired, role);
      const pathname = landing.split(/[?#]/)[0] ?? '';
      expect(pathname.startsWith('/signin')).toBe(false);
      if (pathname !== '/admin' && !pathname.startsWith('/admin/')) continue;
      expect(hasPermission(role, 'admin.access')).toBe(true);
      const permission = permissionForAdminPath(pathname);
      expect(permission === null || hasPermission(role, permission)).toBe(true);
    }
  });
});
