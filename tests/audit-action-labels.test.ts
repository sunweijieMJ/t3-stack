import { describe, expect, it } from 'vitest';
import { ACTION_LABELS } from '@/server/api/audit-action-labels';
import { appRouter } from '@/server/api/root';

/**
 * ACTION_LABELS 是手工维护的「mutation path → 中文名」字典，供审计日志页的
 * 「操作」列与筛选下拉展示。漏登记不会报错，只会让 UI 退化成显示原始 path
 * （如 sys.resetPassword）——没有任何人会为此提 bug，于是会随时间慢慢烂掉。
 * 这里用路由自省把「记得登记」从约定变成门禁。
 *
 * 只覆盖 mutation：审计中间件本身就只记 mutation（见 server/api/trpc.ts 的
 * `if (type !== 'mutation') return next()`），query 不会出现在日志里。
 */

// _def.procedures / _def.type 是 tRPC 内部结构（v11 下为扁平的 'router.procedure'
// 键值表）。升级 tRPC 若改了这里，下面的 sanity 断言会先失败并给出明确提示，
// 而不是让整个测试静默空跑通过。
function collectMutationPaths(): string[] {
  const procedures = (
    appRouter as unknown as {
      _def: { procedures: Record<string, { _def?: { type?: string } }> };
    }
  )._def.procedures;

  return Object.entries(procedures)
    .filter(([, proc]) => proc?._def?.type === 'mutation')
    .map(([path]) => path)
    .sort();
}

describe('ACTION_LABELS', () => {
  const mutationPaths = collectMutationPaths();

  // 防空跑：内部结构一旦变了，上面会返回空数组，后面两条断言就会「全部通过」
  // 而实际什么都没校验。先钉死一个下界。
  it('能从 appRouter 自省出 mutation（内部结构未变）', () => {
    expect(mutationPaths.length).toBeGreaterThanOrEqual(6);
  });

  it('每个 mutation 都已登记中文名', () => {
    const missing = mutationPaths.filter((p) => !(p in ACTION_LABELS));
    expect(
      missing,
      `以下 mutation 未在 src/server/api/audit-action-labels.ts 登记，` +
        `审计日志会显示原始 path：\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('没有指向已不存在 mutation 的残留条目', () => {
    const known = new Set(mutationPaths);
    const stale = Object.keys(ACTION_LABELS).filter((p) => !known.has(p));
    expect(
      stale,
      `以下条目在 ACTION_LABELS 中，但路由里已没有对应 mutation（重命名或删除后遗留）：\n  ${stale.join('\n  ')}`,
    ).toEqual([]);
  });
});
