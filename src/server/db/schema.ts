import { index, jsonb, serial } from 'drizzle-orm/pg-core';

import { user } from './auth-schema';
import { createTable } from './table-creator';

export * from './auth-schema';
export * from './content-schema';
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
    // 这里曾经有 audit_log_user_email_idx，注释写的是「高频过滤字段，避免全表扫」，
    // 但它一次都没被用上：user_email 的唯一过滤方式是
    // `ilike(userEmail, '%...%')`（见 routers/admin.ts 的 buildAuditLogWhere），
    // 前导通配符 + 大小写不敏感，普通 btree 索引一条都命中不了
    // （即使去掉前导 %，ILIKE 在非 C collation 下也要 text_pattern_ops）。
    // 于是它只剩每次写审计日志时的维护开销，纯负收益，已删除。
    //
    // 真要给邮箱搜索加速，两条路：
    //   1. CREATE EXTENSION pg_trgm + GIN 索引（能吃下 ILIKE '%x%'，
    //      代价是自建部署的 PG 镜像必须带 contrib）；
    //   2. 把语义改成前缀匹配，配 lower(user_email) 的表达式索引，不引扩展。
    // 当前审计表有 90 天保留上限、邮箱搜索又是低频人工操作，先都不做。
  ],
);
