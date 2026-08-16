import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { Role } from '@/lib/rbac';
import { createCaller } from '@/server/api/root';
import { adminAuditLog, systemConfig, user } from '@/server/db/schema';
import { createTestDb, resetDb, type TestDb } from './helpers/db';

// 见 content-router.test.ts 的说明：直连 caller 没有 Next 请求作用域，
// 替换成同步执行而不是空函数，保持审计写入照常发起。
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (task: unknown) => void task };
});

// 审计中间件写的是模块级 db（非 ctx.db），必须一并导向测试库。
const { serverDbHolder, createServerDbProxy } = await vi.hoisted(async () => {
  return await import('./helpers/mock-server-db');
});
vi.mock('@/server/db', () => ({ db: createServerDbProxy() }));

vi.mock('@/server/services/storage', () => ({
  deleteFile: vi.fn(async () => undefined),
}));

const ADMIN = {
  id: 'u-admin',
  email: 'admin@example.com',
  role: 'admin' as Role,
};

function callerFor(db: TestDb) {
  return createCaller({
    db: db as never,
    session: { user: ADMIN } as never,
    headers: new Headers(),
  });
}

/**
 * 审计写入走 after()，测试里被替换成「发起但不等待」，所以要轮询等它落库。
 * 直接查一次很容易在插入完成前就断言，变成随机失败的测试。
 */
async function waitForAuditLog(db: TestDb, action: string) {
  for (let i = 0; i < 50; i++) {
    const rows = await db.select().from(adminAuditLog);
    const hit = rows.find((r) => r.action === action);
    if (hit) return hit;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`审计日志未在超时内写入：${action}`);
}

describe('审计入参的脱敏与体积控制', () => {
  let db: TestDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    serverDbHolder.db = db;
  });
  afterAll(async () => {
    await close();
  });
  beforeEach(async () => {
    await resetDb(db);
    await db.insert(user).values({
      id: ADMIN.id,
      name: ADMIN.email,
      email: ADMIN.email,
      role: ADMIN.role,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(systemConfig).values({
      key: 'frontend',
      value: { content: { types: [{ slug: 'news', label: 'news' }] } },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('超长正文在写入审计表前被截断', async () => {
    // 富文本正文本身不限长度（见 routers/content.ts），不截断的话内容本体
    // 存一份、审计表再存一份完整副本，列表与导出接口都会跟着膨胀。
    const hugeBody = `<p>${'x'.repeat(50_000)}</p>`;
    await callerFor(db).content.create({
      type: 'news',
      slug: 'huge',
      title: '超长正文',
      body: hugeBody,
    });

    const log = await waitForAuditLog(db, 'content.create');
    const input = log.input as { body?: string; title?: string };

    expect(input.body).toBeTypeOf('string');
    expect(input.body?.length ?? 0).toBeLessThan(2200);
    expect(input.body).toContain('已截断');
    // 短字段不受影响，审计的主要价值在它们身上
    expect(input.title).toBe('超长正文');
  });

  it('正常长度的入参原样记录', async () => {
    await callerFor(db).content.create({
      type: 'news',
      slug: 'normal',
      title: '普通内容',
      body: '<p>短正文</p>',
      summary: '摘要',
    });

    const log = await waitForAuditLog(db, 'content.create');
    const input = log.input as {
      body?: string;
      summary?: string;
      slug?: string;
    };
    expect(input.body).toBe('<p>短正文</p>');
    expect(input.summary).toBe('摘要');
    expect(input.slug).toBe('normal');
  });

  it('敏感字段被脱敏，且越权尝试同样留痕', async () => {
    // createUser 需要 user.manage，ADMIN 有；这里关注的是 password 不能落库
    await callerFor(db).sys.createUser({
      email: 'someone@example.com',
      name: '某人',
      password: 'super-secret-value',
    });

    const log = await waitForAuditLog(db, 'sys.createUser');
    const input = log.input as { password?: string; email?: string };
    expect(input.password).toBe('***');
    expect(input.email).toBe('someone@example.com');
    expect(JSON.stringify(log.input)).not.toContain('super-secret-value');
  });
});
