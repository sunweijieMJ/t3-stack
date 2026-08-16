import { env } from '@/env';
import type { NonTrpcAuditAction } from '@/server/api/audit-action-labels';
import { writeAuditLog } from '@/server/services/audit';
import { maybePurgeAuditLogs } from '@/server/services/audit-purge';

const CRON_PURGE_ACTION: NonTrpcAuditAction = 'cron.auditPurge';

/**
 * 审计日志自动清理的定时入口。
 *
 * 背景：maybePurgeAuditLogs 此前唯一的调用点是 sys.getAuditLogStats —— 也就是
 * 「有管理员打开后台审计页」才会触发一次。后台默认开启自动清理并保留 90 天，
 * 但只要没人进后台，日志就会一直涨，与配置项承诺的行为不符。
 *
 * 触发方式：
 *   - Vercel：vercel.json 的 crons 每天调一次。Vercel 会自动带上
 *     `Authorization: Bearer $CRON_SECRET`（前提是项目里配了 CRON_SECRET 环境变量）。
 *   - 自建 / Docker：用系统 crontab 调用，自己带同样的头：
 *       curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<域名>/api/cron/audit-purge
 *
 * 未配置 CRON_SECRET 时直接 503 而不是「放行」：这个端点会打 DELETE，
 * 裸奔等于给任何人一个免费的重活接口。
 *
 * 幂等性由 maybePurgeAuditLogs 自己保证：内部有「距上次清理 ≥24h」的频次保护
 * 和 pg_try_advisory_xact_lock 的多实例互斥，重复调用是安全的。
 */
export async function GET(request: Request) {
  if (!env.CRON_SECRET) {
    return Response.json(
      { error: '未配置 CRON_SECRET，定时清理入口已禁用' },
      { status: 503 },
    );
  }

  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // maybePurgeAuditLogs 内部已经把异常吞掉并记日志，这里不会因清理失败而 500，
  // 避免 Vercel Cron 因为一次 DB 抖动就把任务标记成失败并告警。
  await maybePurgeAuditLogs();

  // 同一个删除动作走 tRPC（sys.purgeAuditLogs）是有审计的，走定时任务却没有，
  // 于是审计表里会凭空少掉一批记录而查不到任何原因。这里补一条。
  // userId / userEmail 为空是有意的：执行者是系统而非某个人。
  //
  // 注意这条记录只说明「清理入口被触发过」：maybePurgeAuditLogs 内部有 23h 频次
  // 保护与 advisory lock，实际可能直接返回而没删任何东西，它不对外暴露结果。
  writeAuditLog({
    userId: null,
    userEmail: null,
    action: CRON_PURGE_ACTION,
    input: { trigger: 'cron' },
    result: 'success',
    ipAddress: null,
    userAgent: request.headers.get('user-agent') ?? null,
  });

  return Response.json({ status: 'ok' });
}
