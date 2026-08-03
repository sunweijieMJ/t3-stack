import type { Permission } from '@/lib/rbac';

/**
 * 上传模块 → 所需权限点。
 *
 * 权限必须按模块区分，不能一律要 config.manage：Logo / OG 图这类**站点级**资源
 * 确实只该由 config.manage 写入，但内容封面属于**内容**，只需要 content.manage。
 * 一律要 config.manage 的后果是 editor（有 content.manage、没有 config.manage）
 * 传封面图直接 403 —— 内容管理是这个角色的全部工作，等于角色形同虚设。
 *
 * 这是历史顺序造成的漏改：21bf406 给 /api/upload 加上 config.manage 时，唯一的
 * 调用点还是门户设置页；072021c 给内容加封面图时没有回头看这里的权限。
 *
 * 放在 lib 而不是 route.ts 里：一来 Next 会校验 route 模块的导出，多导出一个常量
 * 会让构建报错；二来这样它能像 admin-menu 一样作为纯逻辑被测试覆盖。
 */
export const MODULE_PERMISSIONS = {
  portal: 'config.manage',
  avatars: 'config.manage',
  misc: 'config.manage',
  content: 'content.manage',
} as const satisfies Record<string, Permission>;

export type UploadModule = keyof typeof MODULE_PERMISSIONS;

export const UPLOAD_MODULES = Object.keys(MODULE_PERMISSIONS) as UploadModule[];

/** 未知模块回落到 misc —— 回落方向是权限更严的那个，拼错模块名不会放宽校验 */
export function resolveUploadModule(raw: string | null | undefined) {
  return UPLOAD_MODULES.includes(raw as UploadModule)
    ? (raw as UploadModule)
    : 'misc';
}
