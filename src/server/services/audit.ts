import 'server-only';
import { after } from 'next/server';
import { db } from '@/server/db';
import { adminAuditLog } from '@/server/db/schema';

/**
 * 审计写入的唯一入口。
 *
 * 这段逻辑原先内联在 api/trpc.ts 的中间件里，于是审计只覆盖了 tRPC mutation ——
 * /api/upload 是一次真实的写操作（落盘或写 OSS，产出一个公开可访问的 URL），
 * 做了鉴权也做了限流，却全程不留痕；定时清理走 route handler 打 DELETE，
 * 同样不留痕，而同一个删除动作走 tRPC 时（sys.purgeAuditLogs）是有记录的。
 *
 * 危害不在于「少了几条日志」，而在于审计页看起来是全量的：管理员按它排查
 * 「谁传了这个文件」时会得出「没有人传过」的结论。有盲区的审计比没有审计更危险。
 */
export type AuditLogValues = typeof adminAuditLog.$inferInsert;

/**
 * 记录一条审计日志。不 await，也不会抛错。
 *
 * 必须走 after() 而不是裸 void：Serverless（Vercel）在响应写回后会立即冻结甚至
 * 回收实例，未被保活的 Promise 会被直接丢弃 —— 表现为审计日志随机缺条，
 * 而审计恰恰是最不能丢的数据，且这种丢失不会有任何报错。
 * after() 让 Next 把回调保活到响应之后再 flush；standalone 长进程下行为不变。
 */
export function writeAuditLog(values: AuditLogValues): void {
  after(
    db
      .insert(adminAuditLog)
      .values(values)
      .catch((err) => console.error('[AuditLog] 写入失败:', err)),
  );
}
