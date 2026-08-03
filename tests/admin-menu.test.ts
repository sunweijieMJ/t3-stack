import { describe, expect, it } from 'vitest';
import {
  ADMIN_MENU,
  defaultAdminPath,
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
