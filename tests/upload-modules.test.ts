import { describe, expect, it } from 'vitest';
import { hasPermission } from '@/lib/rbac';
import {
  MODULE_PERMISSIONS,
  resolveUploadModule,
  UPLOAD_MODULES,
} from '@/lib/upload-modules';

describe('resolveUploadModule', () => {
  it('放行已登记的模块', () => {
    for (const m of UPLOAD_MODULES) {
      expect(resolveUploadModule(m)).toBe(m);
    }
  });

  it('未知模块回落到 misc（权限更严的那个），而不是原样放行', () => {
    expect(resolveUploadModule('../../etc')).toBe('misc');
    expect(resolveUploadModule('')).toBe('misc');
    expect(resolveUploadModule(null)).toBe('misc');
    expect(resolveUploadModule(undefined)).toBe('misc');
    // 回落目标本身必须是站点级权限，否则「拼错模块名」会变成绕过校验的口子
    expect(MODULE_PERMISSIONS.misc).toBe('config.manage');
  });
});

describe('上传模块权限', () => {
  // 这两条守的是一个真实回归：/api/upload 曾经一律要 config.manage，
  // 而内容封面图的上传方是 editor —— 该角色只有 content.manage，传封面必 403，
  // 等于内容管理这个角色的核心工作做不了。
  it('editor 能传内容封面', () => {
    expect(hasPermission('editor', MODULE_PERMISSIONS.content)).toBe(true);
  });

  it('editor 不能传站点级资源', () => {
    expect(hasPermission('editor', MODULE_PERMISSIONS.portal)).toBe(false);
    expect(hasPermission('editor', MODULE_PERMISSIONS.avatars)).toBe(false);
    expect(hasPermission('editor', MODULE_PERMISSIONS.misc)).toBe(false);
  });

  it('admin 能传全部模块', () => {
    for (const m of UPLOAD_MODULES) {
      expect(hasPermission('admin', MODULE_PERMISSIONS[m])).toBe(true);
    }
  });

  it('普通用户什么都传不了', () => {
    for (const m of UPLOAD_MODULES) {
      expect(hasPermission('user', MODULE_PERMISSIONS[m])).toBe(false);
    }
  });
});
