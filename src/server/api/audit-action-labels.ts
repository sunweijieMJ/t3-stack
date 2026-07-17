// 操作类型 → 中文名称映射（前后端共用，不可引入 server-only 模块）
// 凡新增 adminProcedure 的 mutation 都应在此登记，否则审计日志 UI 会显示原始 path。
export const ACTION_LABELS: Record<string, string> = {
  // 系统管理（sys）
  'sys.createUser': '创建用户',
  'sys.deleteUser': '删除用户',
  'sys.exportAuditLogs': '导出审计日志',
  'sys.purgeAuditLogs': '清理审计日志',
  'sys.setAuditPurgeConfig': '设置日志清理策略',

  // 门户配置（page）
  'page.saveFrontendConfig': '保存门户配置',
};
