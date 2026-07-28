import type { Config } from 'drizzle-kit';

import { env } from '@/env';

export default {
  schema: ['./src/server/db/schema.ts'],
  dialect: 'postgresql',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  // 业务表统一带 organova_ 前缀（见 db/table-creator.ts），但 better-auth 的四张表
  // 必须用固定的无前缀表名，所以要在这里显式列出。
  // 不列的后果：tablesFilter 只作用于「数据库侧」的 introspect（见 drizzle-kit 的
  // pgPush → pgPushIntrospect），代码侧 schema 不受影响 —— 于是 db:push 会认为库里
  // 没有这四张表而反复生成 CREATE TABLE "user" 并失败，db:studio 里它们也不可见。
  // （db:generate 不连库，所以已生成的迁移文件里四张表是齐全的。）
  tablesFilter: ['organova_*', 'user', 'session', 'account', 'verification'],
} satisfies Config;
