/** PG 唯一约束冲突的 SQLSTATE */
const UNIQUE_VIOLATION = '23505';

/** 沿 cause 链最多向下查这么多层，兼顾包装深度与自引用链的死循环防护 */
const MAX_CAUSE_DEPTH = 5;

/**
 * 判断一个错误是否为 PG 唯一约束冲突。
 *
 * 必须沿 cause 链查找，因为 SQLSTATE 的位置随驱动而变：
 * - postgres.js（生产）把 code 直接挂在抛出的对象上；
 * - PGlite（测试）抛的是一层 `Failed query: ...` 包装，真正的 PG 错误在 cause 上。
 *
 * 只认 err.code 的写法在生产能跑通、在测试里却永远返回 false，于是「重复 slug
 * 应报 CONFLICT」这类分支在测试中根本走不到，真出问题也发现不了。两种形状都
 * 认下来，判定才与驱动无关。
 *
 * 按结构而非 instanceof 判断：驱动抛出的不一定是 Error 实例。
 */
export function isUniqueViolation(err: unknown): boolean {
  let current = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (typeof current !== 'object' || current === null) return false;
    if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    const next = (current as { cause?: unknown }).cause;
    if (next === current) return false;
    current = next;
  }
  return false;
}
