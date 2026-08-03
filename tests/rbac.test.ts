import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLE,
  hasPermission,
  normalizeRole,
  permissionsOf,
  ROLES,
  resolveRole,
} from '@/lib/rbac';

describe('normalizeRole', () => {
  it('识别合法角色', () => {
    for (const role of ROLES) {
      expect(normalizeRole(role)).toBe(role);
    }
  });

  it('未知角色回落到默认角色', () => {
    expect(normalizeRole('superuser')).toBe(DEFAULT_ROLE);
  });

  it('空值回落到默认角色', () => {
    expect(normalizeRole(null)).toBe(DEFAULT_ROLE);
    expect(normalizeRole(undefined)).toBe(DEFAULT_ROLE);
  });

  it('非字符串回落到默认角色', () => {
    expect(normalizeRole(123)).toBe(DEFAULT_ROLE);
    expect(normalizeRole({ role: 'admin' })).toBe(DEFAULT_ROLE);
  });
});

describe('hasPermission', () => {
  it('admin 拥有全部权限', () => {
    expect(hasPermission('admin', 'user.manage')).toBe(true);
    expect(hasPermission('admin', 'config.manage')).toBe(true);
    expect(hasPermission('admin', 'audit.read')).toBe(true);
    expect(hasPermission('admin', 'content.manage')).toBe(true);
    expect(hasPermission('admin', 'admin.access')).toBe(true);
  });

  it('editor 能管内容但不能管用户', () => {
    expect(hasPermission('editor', 'content.manage')).toBe(true);
    expect(hasPermission('editor', 'user.manage')).toBe(false);
  });

  it('editor 能进后台但读不了审计日志', () => {
    expect(hasPermission('editor', 'admin.access')).toBe(true);
    expect(hasPermission('editor', 'audit.read')).toBe(false);
  });

  it('普通用户没有任何后台权限', () => {
    expect(hasPermission('user', 'admin.access')).toBe(false);
    expect(hasPermission('user', 'content.manage')).toBe(false);
  });

  it('未知角色一律拒绝，不抛错', () => {
    expect(hasPermission('superuser' as never, 'admin.access')).toBe(false);
  });
});

describe('permissionsOf', () => {
  it('返回该角色的全部权限', () => {
    expect(permissionsOf('editor')).toContain('content.manage');
    expect(permissionsOf('editor')).not.toContain('user.manage');
  });

  it('普通用户返回空列表', () => {
    expect(permissionsOf('user')).toHaveLength(0);
  });

  it('返回值被冻结，调用方改不动共享的权限表', () => {
    const perms = permissionsOf('admin');
    expect(() => {
      (perms as string[]).push('injected');
    }).toThrow();
  });
});

describe('resolveRole', () => {
  it('环境变量白名单里的邮箱始终是 admin', () => {
    expect(resolveRole('user', true)).toBe('admin');
  });

  it('白名单优先级高于数据库里的低权限角色', () => {
    expect(resolveRole('editor', true)).toBe('admin');
  });

  it('不在白名单时按数据库角色判定', () => {
    expect(resolveRole('editor', false)).toBe('editor');
    expect(resolveRole('admin', false)).toBe('admin');
  });

  it('不在白名单且数据库角色为脏值时回落到默认角色', () => {
    expect(resolveRole('superuser', false)).toBe(DEFAULT_ROLE);
    expect(resolveRole(null, false)).toBe(DEFAULT_ROLE);
  });
});
