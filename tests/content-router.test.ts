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
import { content, user } from '@/server/db/schema';
import { createTestDb, resetDb, type TestDb } from './helpers/db';

// 审计中间件用 next/server 的 after() 把日志写入保活到响应之后，而 after() 要求
// 处于 Next 的请求作用域内 —— 直连 caller 没有请求作用域，会直接抛错并把整个
// mutation 带崩。这里只替换 after 一个导出，其余保持原样。
//
// 替换成同步执行而不是空函数：保持「日志写入照常发起」的行为，避免测试悄悄
// 绕过审计路径，从而掩盖掉中间件本身的问题。
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (task: unknown) => void task };
});

// 审计中间件写的是模块级 db（非 ctx.db），必须一并导向测试库，
// 否则失败的插入会在 teardown 期抛出未处理拒绝，见 helpers/mock-server-db。
const { serverDbHolder, createServerDbProxy } = await vi.hoisted(async () => {
  return await import('./helpers/mock-server-db');
});
vi.mock('@/server/db', () => ({ db: createServerDbProxy() }));

/**
 * 构造一个直连 caller。
 *
 * ctx 里的 db 需要 cast：createTRPCContext 推导出的是 postgres-js 的 db 类型，
 * 而测试用的是 PGlite 的 db。两者的查询构造 API 完全一致（drizzle 之上的同一套
 * pg-core），差别只在底层驱动，运行时不受影响。
 */
function callerFor(
  db: TestDb,
  user: { id: string; email: string; role: Role } | null,
) {
  return createCaller({
    db: db as never,
    session: user ? ({ user } as never) : null,
    headers: new Headers(),
  });
}

const ADMIN = {
  id: 'u-admin',
  email: 'admin@example.com',
  role: 'admin' as Role,
};
const EDITOR = {
  id: 'u-editor',
  email: 'editor@example.com',
  role: 'editor' as Role,
};
const PLAIN = {
  id: 'u-plain',
  email: 'plain@example.com',
  role: 'user' as Role,
};

const draft = {
  type: 'news',
  slug: 'hello',
  title: '标题',
};

/**
 * 写入测试用户。content.author_id 有指向 user 的外键，不先建用户的话
 * 创建内容会因外键约束失败，而 router 会把它统一报成「创建内容失败」。
 */
async function seedUsers(db: TestDb) {
  await db.insert(user).values(
    [ADMIN, EDITOR, PLAIN].map((u) => ({
      id: u.id,
      name: u.email,
      email: u.email,
      role: u.role,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
}

describe('content router 权限', () => {
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
    await seedUsers(db);
  });

  it('未登录不能创建内容', async () => {
    await expect(callerFor(db, null).content.create(draft)).rejects.toThrow(
      /UNAUTHORIZED/i,
    );
  });

  it('普通用户不能创建内容', async () => {
    await expect(callerFor(db, PLAIN).content.create(draft)).rejects.toThrow(
      /content\.manage/,
    );
  });

  it('editor 可以创建内容', async () => {
    const row = await callerFor(db, EDITOR).content.create(draft);

    expect(row?.title).toBe('标题');
  });

  it('admin 可以创建内容', async () => {
    const row = await callerFor(db, ADMIN).content.create(draft);

    expect(row?.id).toBeGreaterThan(0);
  });

  it('普通用户不能查看后台列表', async () => {
    await expect(
      callerFor(db, PLAIN).content.list({ page: 1, pageSize: 10 }),
    ).rejects.toThrow(/content\.manage/);
  });
});

describe('content router 正文净化', () => {
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
    await seedUsers(db);
  });

  it('创建时剥离脚本，落库的是净化后的 HTML', async () => {
    await callerFor(db, ADMIN).content.create({
      ...draft,
      body: '<p>正文</p><script>alert(1)</script>',
    });

    const [row] = await db.select().from(content);
    expect(row?.body).toBe('<p>正文</p>');
  });

  it('更新时同样净化，不能靠改写绕过', async () => {
    const created = await callerFor(db, ADMIN).content.create(draft);
    if (!created) throw new Error('测试前置条件失败：内容未创建');

    await callerFor(db, ADMIN).content.update({
      ...draft,
      id: created.id,
      body: '<p onclick="alert(1)">改写</p>',
    });

    const [row] = await db.select().from(content);
    expect(row?.body).toBe('<p>改写</p>');
  });
});

describe('content router 门户读取', () => {
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
    await seedUsers(db);
  });

  it('草稿不出现在门户列表里', async () => {
    await callerFor(db, ADMIN).content.create(draft);

    const res = await callerFor(db, null).content.listPublished({
      type: 'news',
      page: 1,
      pageSize: 10,
    });

    expect(res.rows).toHaveLength(0);
  });

  it('已发布内容对匿名访客可见', async () => {
    await callerFor(db, ADMIN).content.create({
      ...draft,
      status: 'published',
    });

    const res = await callerFor(db, null).content.listPublished({
      type: 'news',
      page: 1,
      pageSize: 10,
    });

    expect(res.rows).toHaveLength(1);
    expect(res.total).toBe(1);
  });

  it('置顶内容排在前面', async () => {
    const publish = { status: 'published' as const };
    await callerFor(db, ADMIN).content.create({
      ...draft,
      slug: 'normal',
      title: '普通',
      ...publish,
    });
    await callerFor(db, ADMIN).content.create({
      ...draft,
      slug: 'pinned',
      title: '置顶',
      pinned: true,
      ...publish,
    });

    const res = await callerFor(db, null).content.listPublished({
      type: 'news',
      page: 1,
      pageSize: 10,
    });

    expect(res.rows[0]?.title).toBe('置顶');
  });

  it('定向内容对未命中角色返回 NOT_FOUND 而非 FORBIDDEN，避免探测', async () => {
    await callerFor(db, ADMIN).content.create({
      ...draft,
      status: 'published',
      visibleRoles: ['editor'],
    });

    // 断言 code 而非 message：不可见与不存在必须落到同一个 NOT_FOUND，
    // 一旦有人改成 FORBIDDEN，这个接口就变成了「slug 是否存在」的探测器。
    await expect(
      callerFor(db, PLAIN).content.bySlug({ type: 'news', slug: 'hello' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('定向内容对命中角色可读', async () => {
    await callerFor(db, ADMIN).content.create({
      ...draft,
      status: 'published',
      visibleRoles: ['editor'],
    });

    const row = await callerFor(db, EDITOR).content.bySlug({
      type: 'news',
      slug: 'hello',
    });

    expect(row.slug).toBe('hello');
  });
});

describe('content router slug 约束', () => {
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
    await seedUsers(db);
  });

  it('拒绝非法 slug', async () => {
    await expect(
      callerFor(db, ADMIN).content.create({ ...draft, slug: '带空格 和中文' }),
    ).rejects.toThrow();
  });

  it('同 type 下 slug 重复报 CONFLICT 而非 500', async () => {
    await callerFor(db, ADMIN).content.create(draft);

    await expect(callerFor(db, ADMIN).content.create(draft)).rejects.toThrow(
      /CONFLICT|已存在/,
    );
  });
});
