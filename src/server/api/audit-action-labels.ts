// 操作类型 → 中文名称映射（前后端共用，不可引入 server-only 模块）
// 凡新增 adminProcedure 的 mutation 都应在此登记，否则审计日志 UI 会显示原始 path。

/**
 * 非 tRPC 的审计动作。
 *
 * 单独一张表而不是混进下面的字典：tests/audit-action-labels.test.ts 靠路由自省
 * 来强制「每个 mutation 都已登记、且没有指向不存在 mutation 的残留条目」，
 * 而这些动作来自 route handler 与定时任务，自省看不到它们 —— 直接混写会让那条
 * 「无残留条目」的断言把它们误判成垃圾并变红。
 *
 * 用 as const 导出类型，调用点写错 action 名会直接编译报错，而不是等到有人
 * 翻审计日志时才发现那一列显示的是原始字符串。
 */
export const NON_TRPC_AUDIT_ACTIONS = {
  'upload.file': '上传文件',
  'cron.auditPurge': '定时清理审计日志',
} as const;

export type NonTrpcAuditAction = keyof typeof NON_TRPC_AUDIT_ACTIONS;

export const ACTION_LABELS: Record<string, string> = {
  // 系统管理（sys）
  'sys.createUser': '创建用户',
  'sys.deleteUser': '删除用户',
  'sys.setUserRole': '修改用户角色',
  'sys.exportAuditLogs': '导出审计日志',
  'sys.purgeAuditLogs': '清理审计日志',
  'sys.setAuditPurgeConfig': '设置日志清理策略',

  // 门户配置（page）
  'page.saveFrontendConfig': '保存门户配置',

  // 内容管理（content）
  'content.create': '创建内容',
  'content.update': '更新内容',
  'content.delete': '删除内容',
  'content.createCategory': '创建内容分类',
  'content.updateCategory': '更新内容分类',
  'content.deleteCategory': '删除内容分类',

  // 非 tRPC 入口（route handler / 定时任务）
  ...NON_TRPC_AUDIT_ACTIONS,
};
