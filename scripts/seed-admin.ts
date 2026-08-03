/**
 * 初始管理员种子脚本
 *
 * 本地用法:
 *   npx tsx --env-file=.env scripts/seed-admin.ts <email> <password> [name]
 *
 * 生产环境（Docker / Vercel）:
 *   通过环境变量触发，启动或构建时自动执行:
 *   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=pass1234
 *
 * 幂等且可长期留在环境里：账号已存在时不重复创建、不覆盖密码，只在「库里一个
 * 管理员都没有」时把该账号提升为 admin，保证后台始终有人进得去。
 * 建号完成后可以安全地删掉 SEED_ADMIN_PASSWORD —— 只保留 SEED_ADMIN_EMAIL
 * 不会让后续构建失败。
 *
 * 注意: 需要 DATABASE_URL 和 BETTER_AUTH_SECRET 环境变量
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as authSchema from '@/server/db/auth-schema';

// 优先读命令行参数，其次读环境变量（Docker 场景）
const email = process.argv[2] ?? process.env.SEED_ADMIN_EMAIL;
const password = process.argv[3] ?? process.env.SEED_ADMIN_PASSWORD;
const name = process.argv[4] ?? process.env.SEED_ADMIN_NAME;

// 只有 email 是必需的。密码仅在**首次创建账号**时才需要 —— 账号已存在时本脚本
// 只做「确保还有人能进后台」的角色兜底，那一步不需要密码。
//
// 这个区分不是洁癖：本脚本自身的文档建议「建号后去 Vercel 删掉
// SEED_ADMIN_PASSWORD，避免明文密码长期驻留」。照做之后，若这里仍然强制要求
// 密码，就会 exit(1)，而 vercel-build.sh 是 set -e —— 于是**下一次生产构建
// 直接失败**，且失败原因和「部署」这件事看起来毫无关系。
if (!email) {
  console.error(
    '用法: npx tsx scripts/seed-admin.ts <email> <password> [name]',
  );
  console.error(
    '或设置环境变量: SEED_ADMIN_EMAIL（首次创建还需 SEED_ADMIN_PASSWORD）',
  );
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

/**
 * 把账号提升为管理员。
 *
 * 脚本此前只调 signUpEmail 建账号，完全不碰权限 —— 于是「初始管理员」建出来
 * 其实只是个普通账号，真正的管理员身份还得再配一个 ADMIN_EMAILS。两个变量
 * 名字相近、用途不同，配漏一个的表现是「验证码收得到、能登录、但进不去后台」，
 * 且全程无任何报错，极难定位（本项目线上实际踩过）。
 * user 表现在有 role 列，这一步就该由脚本自己完成。
 */
async function promote(reason: string) {
  await db
    .update(authSchema.user)
    .set({ role: 'admin' })
    .where(eq(authSchema.user.email, email as string));
  console.log(`  已设为管理员（${reason}）`);
}

/** 库里是否已存在任意管理员账号 */
async function hasAnyAdmin(): Promise<boolean> {
  const rows = await db
    .select({ id: authSchema.user.id })
    .from(authSchema.user)
    .where(eq(authSchema.user.role, 'admin'))
    .limit(1);
  return rows.length > 0;
}

/** 账号已存在时的处理：只保证「后台至少有一个人进得去」，不动已有权限安排 */
async function ensureSomeoneCanGetIn() {
  console.log(`管理员 ${email} 已存在，跳过创建`);
  // 不无条件改角色：SEED_ADMIN_EMAIL 常年留在环境变量里，每次部署都强制提权
  // 会覆盖掉运维方有意做的降级。
  // 只在「库里一个管理员都没有」时兜底提升 —— 这正是脚本存在的意义。
  // 存量部署（加 role 列的迁移把所有人都置为 user）也靠这条自愈。
  if (await hasAnyAdmin()) {
    console.log('  库中已有管理员，保持该账号现有角色不变');
  } else {
    await promote('库中没有任何管理员，兜底提升');
  }
}

async function main() {
  try {
    // 先查存在性，而不是「无脑建号 + catch 掉重复错误」：后者在没有密码时
    // 连 signUpEmail 都调不了，而这恰恰是删掉 SEED_ADMIN_PASSWORD 之后的常态。
    const existing = await db
      .select({ id: authSchema.user.id })
      .from(authSchema.user)
      .where(eq(authSchema.user.email, email as string))
      .limit(1);

    if (existing.length > 0) {
      await ensureSomeoneCanGetIn();
      return;
    }

    if (!password) {
      console.error(`错误: ${email} 尚不存在，首次创建需要提供密码`);
      console.error('请设置 SEED_ADMIN_PASSWORD 或作为第二个命令行参数传入');
      process.exit(1);
    }

    console.log(`正在创建管理员用户: ${email}`);
    const result = await auth.api.signUpEmail({
      body: {
        email: email as string,
        password,
        name: name ?? (email as string).split('@').at(0) ?? (email as string),
      },
    });

    console.log('管理员用户创建成功:');
    console.log(`  ID:    ${result.user.id}`);
    console.log(`  Email: ${result.user.email}`);
    console.log(`  Name:  ${result.user.name}`);
    await promote('新建账号');
  } catch (err) {
    // 并发下仍可能撞上唯一约束（两个构建同时跑），此时按「已存在」处理即可
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('already') ||
      msg.includes('exist') ||
      msg.includes('unique')
    ) {
      await ensureSomeoneCanGetIn();
      return;
    }
    // 输出完整错误对象（含 cause / stack），便于排查 SQL/SSL/Schema 问题
    console.error('创建失败:', err);
    const cause = (err as { cause?: unknown })?.cause;
    if (cause) console.error('cause:', cause);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

main();
