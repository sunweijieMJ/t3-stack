import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '@/env';
import * as schema from './schema';

/**
 * Cache the database connection in development. This avoids creating a new connection on every HMR
 * update.
 */
const globalForDb = globalThis as unknown as {
  conn: postgres.Sql | undefined;
};

// SSL 策略必须与 migrate.mjs、scripts/seed-admin.ts 三处保持一致，
// 否则会出现「迁移跑通了但应用连不上」这种极难排查的半死状态。
//
// - URL 里显式写了 sslmode= → 完全不传 ssl 选项，交给 postgres.js 按标准语义解析。
//   注意必须「不传 key」而不是传 undefined：postgres.js 用 `k in o` 判断，
//   传 undefined 会被当成显式的 falsy 值而退化成 ssl: false。
// - 否则用 'prefer'：服务端支持 TLS 就加密（且 rejectUnauthorized=false，
//   兼容 RDS / 自建 PG 的自签证书），不支持就自动降级明文。
//
// 不能传 { rejectUnauthorized: false } 对象：那是「强制 TLS」，
// 对同 VPC / docker 网络里的明文 PG 直接连不上；而且 postgres.js 中
// 显式选项优先于 URL query（见 postgres/src/index.js 的 parseOptions），
// 会静默覆盖掉用户写在 DATABASE_URL 里的 sslmode=disable。
const sslOption = /[?&]sslmode=/.test(env.DATABASE_URL)
  ? {}
  : { ssl: 'prefer' as const };

const conn = globalForDb.conn ?? postgres(env.DATABASE_URL, sslOption);
if (env.NODE_ENV !== 'production') globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
