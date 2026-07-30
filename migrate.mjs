import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * 部署期数据库迁移入口（Dockerfile 的 CMD 与 scripts/vercel-build.sh 都调它）。
 *
 * 直接调用 drizzle 官方 migrator，而不是自己按 _journal.json 手写一遍。
 * 「自己记一套账」踩过一次坑：
 *   - 官方 migrator（`pnpm db:migrate` 走的就是它）把已应用记录写在
 *     **drizzle.__drizzle_migrations**，判据是迁移 SQL 的内容 sha256 + folderMillis；
 *   - 旧版本的本文件写在 **public.__drizzle_migrations**，判据是 tag 字符串。
 * 两张表互相看不见。于是「本地 pnpm db:migrate 建好库 → 容器起来跑本脚本」
 * 会被判定成「一条都没应用过」而重放 0000，而 0000 里的 CREATE TABLE 没有
 * IF NOT EXISTS，直接 42P07 退出（README 里建议的「发版前手动
 * DATABASE_URL=... pnpm db:migrate」同样会踩到这条）。
 *
 * 现在两条路径共用同一张账本、同一套 hash，天生幂等。
 */

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('[migrate] DATABASE_URL not set, skipping migrations');
  process.exit(0);
}

const MIGRATIONS_FOLDER = './drizzle';
const JOURNAL_PATH = join(MIGRATIONS_FOLDER, 'meta', '_journal.json');

// 首次部署、尚未生成任何迁移时目录是空的（Dockerfile 会 mkdir -p drizzle/meta），
// 而官方的 readMigrationFiles 遇到缺失的 journal 会直接抛错。提前放行。
if (!existsSync(JOURNAL_PATH)) {
  console.log('[migrate] No migration journal found, skipping');
  process.exit(0);
}

// SSL 策略必须与 src/server/db/index.ts、scripts/seed-admin.ts 三处保持一致
// （那边有完整说明）：URL 里显式写了 sslmode= 就完全不传 ssl 选项交给
// postgres.js 处理，否则用 'prefer' —— 支持 TLS 就加密（不校验 CA，兼容自签证书），
// 不支持就自动降级明文。
const sslOption = /[?&]sslmode=/.test(DATABASE_URL) ? {} : { ssl: 'prefer' };

const sql = postgres(DATABASE_URL, { max: 1, ...sslOption });

/**
 * 一次性把旧账本（public.__drizzle_migrations，hash 列存的是 tag）搬进
 * 官方账本（drizzle.__drizzle_migrations，hash 列存的是 SQL 内容摘要）。
 *
 * 不搬的话，用旧脚本迁移过的存量库在升级到本版本后会被当成空库重放。
 *
 * created_at 必须写 journal 里的 `when`，而不是「当初实际应用的时间」：
 * 官方 migrator 的判据是 `folderMillis > lastDbMigration.created_at`
 * （见 drizzle-orm/pg-core/dialect.js 的 migrate），写错就会重放或漏跑。
 *
 * 旧表保留不删：它是这次搬迁的唯一凭据，出问题时还能人工核对。
 * 搬完后新账本非空，之后每次调用都会在 count > 0 处早退。
 */
async function adoptLegacyLedger() {
  const [legacy] = await sql`
    SELECT to_regclass('public.__drizzle_migrations') IS NOT NULL AS present
  `;
  if (!legacy?.present) return;

  await sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`;
  await sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  const [current] = await sql`
    SELECT count(*)::int AS count FROM "drizzle"."__drizzle_migrations"
  `;
  if ((current?.count ?? 0) > 0) return;

  const legacyRows = await sql`SELECT hash FROM public.__drizzle_migrations`;
  const appliedTags = new Set(legacyRows.map((r) => r.hash));
  if (appliedTags.size === 0) return;

  const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf-8'));
  const adopted = [];
  for (const entry of journal.entries ?? []) {
    if (!appliedTags.has(entry.tag)) continue;
    const content = readFileSync(
      join(MIGRATIONS_FOLDER, `${entry.tag}.sql`),
      'utf-8',
    );
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    await sql`
      INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
      VALUES (${hash}, ${entry.when})
    `;
    adopted.push(entry.tag);
  }

  if (adopted.length > 0) {
    console.log(
      `[migrate] 已从旧账本 public.__drizzle_migrations 接管 ${adopted.length} 条记录: ${adopted.join(', ')}`,
    );
  }
}

try {
  await adoptLegacyLedger();
  await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
  console.log('[migrate] Done, database is up to date');
} catch (error) {
  console.error('[migrate] Migration failed:', error);
  process.exit(1);
} finally {
  await sql.end();
}
