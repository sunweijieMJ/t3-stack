import { index, jsonb, serial } from 'drizzle-orm/pg-core';

import { user } from './auth-schema';
import { createTable } from './table-creator';

export * from './auth-schema';
export { createTable } from './table-creator';
export * from './user-relations';

export const systemConfig = createTable('system_config', (d) => ({
  key: d.varchar({ length: 256 }).primaryKey(),
  value: jsonb().notNull(),
  description: d.text(),
  // updatedAt 非空 + insert 默认 now()，作为乐观锁版本字段：
  // saveFrontendConfig 会比对客户端持有的 updatedAt，不匹配则报 CONFLICT。
  updatedAt: d
    .timestamp({ withTimezone: true })
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: d
    .timestamp({ withTimezone: true })
    .$defaultFn(() => new Date())
    .notNull(),
}));

export const adminAuditLog = createTable(
  'admin_audit_log',
  (d) => ({
    id: serial('id').primaryKey(),
    // userId 可空 + ON DELETE SET NULL：用户删除后审计行保留（保留删除痕迹），
    // user_id 字段被置 NULL，userEmail 字段仍保留原邮箱便于追溯。
    userId: d
      .text('user_id')
      .references(() => user.id, { onDelete: 'set null' }),
    userEmail: d.text('user_email'),
    action: d.text('action').notNull(),
    input: jsonb('input'),
    result: d.text('result').notNull(),
    errorMessage: d.text('error_message'),
    ipAddress: d.text('ip_address'),
    userAgent: d.text('user_agent'),
    createdAt: d
      .timestamp('created_at', { withTimezone: true })
      .$defaultFn(() => new Date())
      .notNull(),
  }),
  (t) => [
    index('audit_log_created_at_idx').on(t.createdAt),
    index('audit_log_action_idx').on(t.action),
    // userEmail 是 listAuditLogs 的高频过滤字段，加索引避免全表扫
    index('audit_log_user_email_idx').on(t.userEmail),
  ],
);
