import 'server-only';
import { inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { adminAuditLog, systemConfig } from '@/server/db/schema';

// pg_try_advisory_xact_lock 的 key：用一个固定 bigint 标识 audit purge 作业；
// 多实例并发触发时只有一个能拿到锁，其他立即返回不阻塞。
// 用 xact_lock 而非 session 级 lock：postgres-js 连接池（默认 max=10）下，
// session 级锁/解锁可能落在不同 connection 上，解锁会静默返回 false 导致锁泄漏；
// xact 级锁在事务结束时由 PG 自动释放，无需手动 unlock，也避免跨 connection 风险。
const PURGE_ADVISORY_LOCK_KEY = 1734720001n;

const KEY_ENABLED = 'audit_log_auto_purge_enabled';
const KEY_RETENTION = 'audit_log_retention_days';
const KEY_LAST_PURGE = 'audit_log_last_purge_at';

const DEFAULT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
// 距上次清理 ≥ 23h 才会再次触发。
//
// 不能取整 24h：lastPurgeAt 是在 DELETE 跑完之后才写的，必然晚于触发时刻若干秒，
// 而 vercel.json 的 cron 是精确的 `0 4 * * *`。于是次日 04:00 的
// `now - last` 恒为 24h 减去那几秒，卡在阈值下方被判为「太频繁」直接返回 ——
// 实际效果是每两天才真正清理一次，且 cron 每次都返回 200，看不出任何异常。
// 留 1h 余量，既躲开这个边界，又不至于让「每天最多一次」的语义失真。
const PURGE_INTERVAL_MS = 23 * 60 * 60 * 1000;

export type AuditPurgeConfig = {
  enabled: boolean;
  retentionDays: number;
  /** ISO 字符串，从未清理过则为 null */
  lastPurgeAt: string | null;
};

async function readConfigKeys(keys: string[]) {
  const rows = await db
    .select()
    .from(systemConfig)
    .where(inArray(systemConfig.key, keys));
  return new Map(rows.map((r) => [r.key, r.value]));
}

async function upsertConfig(key: string, value: unknown) {
  await db
    .insert(systemConfig)
    .values({ key, value: value as never })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value: value as never },
    });
}

export async function getAuditPurgeConfig(): Promise<AuditPurgeConfig> {
  const map = await readConfigKeys([
    KEY_ENABLED,
    KEY_RETENTION,
    KEY_LAST_PURGE,
  ]);
  const enabled = map.get(KEY_ENABLED);
  const retention = map.get(KEY_RETENTION);
  const lastPurge = map.get(KEY_LAST_PURGE);
  return {
    enabled: typeof enabled === 'boolean' ? enabled : true,
    retentionDays:
      typeof retention === 'number' && retention > 0
        ? retention
        : DEFAULT_RETENTION_DAYS,
    lastPurgeAt: typeof lastPurge === 'string' ? lastPurge : null,
  };
}

export async function setAuditPurgeConfig(input: {
  enabled: boolean;
  retentionDays: number;
}) {
  await Promise.all([
    upsertConfig(KEY_ENABLED, input.enabled),
    upsertConfig(KEY_RETENTION, input.retentionDays),
  ]);
}

/**
 * 懒触发清理：距上次清理 ≥ 24h 才执行一次，失败仅记日志，不影响调用方。
 * 通过 pg_try_advisory_xact_lock 确保多实例下只有一个进程实际执行 DELETE。
 */
export async function maybePurgeAuditLogs(): Promise<void> {
  try {
    const cfg = await getAuditPurgeConfig();
    if (!cfg.enabled) return;

    const last = cfg.lastPurgeAt ? new Date(cfg.lastPurgeAt).getTime() : 0;
    if (Date.now() - last < PURGE_INTERVAL_MS) return;

    // 整段裹进事务：lock + DELETE + upsert 都跑在同一 connection；
    // xact_lock 在事务 COMMIT/ROLLBACK 时由 PG 自动释放，无需手动 unlock。
    await db.transaction(async (tx) => {
      const lockRows = await tx.execute<{ locked: boolean }>(
        sql`SELECT pg_try_advisory_xact_lock(${PURGE_ADVISORY_LOCK_KEY}) AS locked`,
      );
      if (!lockRows[0]?.locked) return;

      const cutoff = new Date(Date.now() - cfg.retentionDays * DAY_MS);
      await tx.delete(adminAuditLog).where(lt(adminAuditLog.createdAt, cutoff));
      const nowIso = new Date().toISOString();
      await tx
        .insert(systemConfig)
        .values({ key: KEY_LAST_PURGE, value: nowIso as never })
        .onConflictDoUpdate({
          target: systemConfig.key,
          set: { value: nowIso as never },
        });
    });
  } catch (err) {
    console.error('[audit-purge] 自动清理失败:', err);
  }
}
