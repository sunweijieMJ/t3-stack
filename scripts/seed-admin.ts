/**
 * 初始管理员种子脚本
 *
 * 本地用法:
 *   npx tsx --env-file=.env scripts/seed-admin.ts <email> <password> [name]
 *
 * 生产环境（Docker）:
 *   通过环境变量触发，容器启动时自动执行:
 *   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=pass1234
 *
 * 注意: 需要 DATABASE_URL 和 BETTER_AUTH_SECRET 环境变量
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as authSchema from '@/server/db/auth-schema';

// 优先读命令行参数，其次读环境变量（Docker 场景）
const email = process.argv[2] ?? process.env.SEED_ADMIN_EMAIL;
const password = process.argv[3] ?? process.env.SEED_ADMIN_PASSWORD;
const name = process.argv[4] ?? process.env.SEED_ADMIN_NAME;

if (!email || !password) {
  console.error(
    '用法: npx tsx scripts/seed-admin.ts <email> <password> [name]',
  );
  console.error('或设置环境变量: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('错误: 缺少 DATABASE_URL 环境变量');
  process.exit(1);
}
if (!process.env.BETTER_AUTH_SECRET) {
  console.error('错误: 缺少 BETTER_AUTH_SECRET 环境变量');
  process.exit(1);
}

// SSL 策略必须与 src/server/db/index.ts、migrate.mjs 三处保持一致
// （那边有完整说明）：URL 里显式写了 sslmode= 就完全不传 ssl 选项交给
// postgres.js 处理，否则用 'prefer' —— 支持 TLS 就加密（不校验 CA，兼容自签证书），
// 不支持就自动降级明文。此前这里硬传 { rejectUnauthorized: false } 强制 TLS，
// 会让「migrate 通过 → seed 失败 → set -e 退容器」，排查方向被严重误导。
const sslOption = /[?&]sslmode=/.test(process.env.DATABASE_URL)
  ? {}
  : { ssl: 'prefer' as const };

const conn = postgres(process.env.DATABASE_URL, sslOption);
const db = drizzle(conn, { schema: authSchema });

const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: authSchema.user,
      session: authSchema.session,
      account: authSchema.account,
      verification: authSchema.verification,
    },
  }),
});

async function main() {
  console.log(`正在创建管理员用户: ${email}`);

  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: email as string,
        password: password as string,
        name: name ?? (email as string).split('@').at(0) ?? (email as string),
      },
    });

    console.log('管理员用户创建成功:');
    console.log(`  ID:    ${result.user.id}`);
    console.log(`  Email: ${result.user.email}`);
    console.log(`  Name:  ${result.user.name}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('already') ||
      msg.includes('exist') ||
      msg.includes('unique')
    ) {
      console.log(`管理员 ${email} 已存在，跳过创建`);
    } else {
      // 输出完整错误对象（含 cause / stack），便于排查 SQL/SSL/Schema 问题
      console.error('创建失败:', err);
      const cause = (err as { cause?: unknown })?.cause;
      if (cause) console.error('cause:', cause);
      process.exit(1);
    }
  } finally {
    await conn.end();
  }
}

main();
