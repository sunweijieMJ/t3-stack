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

// 开发环境本地 PG 不启用 TLS；生产环境启用 TLS 但不强制校验 CA
// （兼容自建 / 云托管 PG 的自签证书，无需额外挂载 CA 证书文件）。
const ssl =
  env.NODE_ENV !== 'production' ? false : { rejectUnauthorized: false };

const conn = globalForDb.conn ?? postgres(env.DATABASE_URL, { ssl });
if (env.NODE_ENV !== 'production') globalForDb.conn = conn;

export const db = drizzle(conn, { schema });
