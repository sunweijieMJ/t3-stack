import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/server/db/schema';

/**
 * 起一个内存态的 Postgres（PGlite），跑完 drizzle/ 下的全部迁移后返回可用的 db。
 *
 * 为什么不是 testcontainers / CI 起 postgres service：
 * check-quality.yml 开头明确写了「不起 Postgres service」，理由是拉镜像 + 等健康检查
 * 要多花约 15s。PGlite 把真正的 Postgres 编译成 WASM 跑在进程内，既不需要 Docker，
 * 也不需要改 CI，同时执行的仍是 drizzle/*.sql 里那份真实 DDL —— 不是 mock。
 *
 * 迁移文件是唯一的表结构来源：这样「schema.ts 改了但忘记 db:generate」会直接让
 * 相关测试失败，而不是等到部署时才发现迁移与代码对不上。
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: './drizzle' });
  return {
    db,
    close: () => client.close(),
  };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>['db'];

/**
 * 清空所有业务表，供各用例之间复用同一个 PGlite 实例。
 *
 * 表名从 pg_tables 动态查询而非写死：新增一张表就得回来补一行的清单迟早会漏，
 * 漏掉的表会以「上一个用例的残留数据」形式污染后续断言，且极难定位。
 *
 * 只取 public schema —— 迁移记录表在 drizzle schema 下，清掉它会让同一实例上
 * 后续的 migrate() 重复执行全部 DDL。
 *
 * RESTART IDENTITY 让 serial 主键归位，CASCADE 绕开外键顺序问题（user 被
 * session / account / audit_log 引用，逐表 delete 需要人工排序）。
 */
export async function resetDb(db: TestDb): Promise<void> {
  const result = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  const tables = result.rows.map((r) => `"${r.tablename}"`);
  if (tables.length === 0) return;
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE`),
  );
}
