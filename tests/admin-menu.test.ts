import { describe, expect, it } from 'vitest';
import {
  ADMIN_MENU,
  defaultAdminPath,
  permissionForAdminPath,
  visibleAdminMenu,
} from '@/lib/admin-menu';
import { hasPermission } from '@/lib/rbac';

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
