import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('[migrate] DATABASE_URL not set, skipping migrations');
  process.exit(0);
}

// SSL 策略必须与 src/server/db/index.ts、scripts/seed-admin.ts 三处保持一致
// （那边有完整说明）：URL 里显式写了 sslmode= 就完全不传 ssl 选项交给
// postgres.js 处理，否则用 'prefer' —— 支持 TLS 就加密（不校验 CA，兼容自签证书），
// 不支持就自动降级明文。
const sslOption = /[?&]sslmode=/.test(DATABASE_URL) ? {} : { ssl: 'prefer' };

const sql = postgres(DATABASE_URL, { max: 1, ...sslOption });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,
      created_at BIGINT
    )
  `;

  const migrationsDir = './drizzle';
  const journalPath = join(migrationsDir, 'meta', '_journal.json');

  if (!existsSync(journalPath)) {
    console.log('[migrate] No migration journal found, skipping');
    process.exit(0);
  }

  const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
  const entries = journal.entries || [];
  let applied = 0;

  for (const entry of entries) {
    const hash = entry.tag;
    const existing =
      await sql`SELECT 1 FROM "__drizzle_migrations" WHERE hash = ${hash}`;

    if (existing.length === 0) {
      const sqlFile = join(migrationsDir, `${entry.tag}.sql`);
      const content = readFileSync(sqlFile, 'utf-8');
      const statements = content
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean);

      await sql.begin(async (tx) => {
        for (const stmt of statements) {
          await tx.unsafe(stmt);
        }
        await tx`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${Date.now()}) ON CONFLICT (hash) DO NOTHING`;
      });

      console.log(`[migrate] Applied: ${entry.tag}`);
      applied++;
    }
  }

  console.log(
    applied > 0
      ? `[migrate] Done, ${applied} migration(s) applied`
      : '[migrate] Database is up to date',
  );
} catch (error) {
  console.error('[migrate] Migration failed:', error);
  process.exit(1);
} finally {
  await sql.end();
}
