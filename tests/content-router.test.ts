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
import { getSession } from '@/server/better-auth/server';
import { content, systemConfig, user } from '@/server/db/schema';
import {
  getPublishedContentBySlug,
  listPublishedContent,
} from '@/server/services/content-public';
import { deleteFile } from '@/server/services/storage';
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

// 门户读取走 services/content-public（门户页面是 RSC，直接调 service，不经 tRPC）。
// 它通过 getSession() 从登录态推导访问者角色 —— 角色绝不能由入参传入，否则任何人
// 拼一个 role=editor 就能读到定向内容。这里替换掉这一个导出来控制访问者身份，
// 顺带避免把整条 better-auth + env 依赖链拉进单测。
vi.mock('@/server/better-auth/server', () => ({
  getSession: vi.fn(async () => null),
}));

// 封面回收会真的去碰文件系统 / OSS，单测里只关心「有没有按正确的参数调用」。
vi.mock('@/server/services/storage', () => ({
  deleteFile: vi.fn(async () => undefined),
}));

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
 * 登记内容类型。create / update 会校验 type 是否在「门户设置 → 内容类型」里
 * 登记过（未登记的类型在门户一律 404，建出来就是一篇打不开的内容），
 * 不先写这行配置的话，所有写入都会被判为 BAD_REQUEST。
 */
async function seedContentTypes(db: TestDb, slugs = ['news']) {
  await db.insert(systemConfig).values({
    key: 'frontend',
    value: {
      content: { types: slugs.map((s) => ({ slug: s, label: s })) },
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

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
    await seedContentTypes(db);
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
    await seedContentTypes(db);
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

// 打的是 services/content-public —— 门户页面实际调用的就是这一份。
// 早先这些用例走的是 content router 上的 listPublished / bySlug，那两个 procedure
// 运行时零调用点，测它们等于测了一份没人跑的代码（两份实现当时已经开始漂移）。
describe('门户读取（services/content-public）', () => {
  let db: TestDb;
  let close: () => Promise<void>;

  /** 设定当前访问者；null 表示未登录访客 */
  const asViewer = (u: { id: string; email: string; role: Role } | null) => {
    vi.mocked(getSession).mockResolvedValue(
      u ? ({ user: u } as never) : (null as never),
    );
  };

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
    await seedContentTypes(db);
  });

  it('草稿不出现在门户列表里', async () => {
    await callerFor(db, ADMIN).content.create(draft);
    asViewer(null);

    const res = await listPublishedContent({
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
    asViewer(null);

    const res = await listPublishedContent({
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
    asViewer(null);

    const res = await listPublishedContent({
      type: 'news',
      page: 1,
      pageSize: 10,
    });

    expect(res.rows[0]?.title).toBe('置顶');
  });

  it('定向内容对未命中角色不可见，且与「不存在」无法区分', async () => {
    await callerFor(db, ADMIN).content.create({
      ...draft,
      status: 'published',
      visibleRoles: ['editor'],
    });
    asViewer(PLAIN);

    // 两者必须落到完全相同的结果（null），由调用方统一渲染 404。一旦「不可见」
    // 变成别的返回值（抛错 / 空对象），详情页就成了「该 slug 是否存在」的探测器。
    await expect(
      getPublishedContentBySlug('news', 'hello'),
    ).resolves.toBeNull();
    await expect(
      getPublishedContentBySlug('news', 'no-such-slug'),
    ).resolves.toBeNull();
  });

  it('定向内容对命中角色可读', async () => {
    await callerFor(db, ADMIN).content.create({
      ...draft,
      status: 'published',
      visibleRoles: ['editor'],
    });
    asViewer(EDITOR);

    const row = await getPublishedContentBySlug('news', 'hello');

    expect(row?.slug).toBe('hello');
  });
});

describe('内容封面文件回收', () => {
  let db: TestDb;
  let close: () => Promise<void>;

  const OLD_COVER = '/uploads/content/old.png';

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
    await seedContentTypes(db);
    vi.mocked(deleteFile).mockClear();
  });

  /** 建一条带封面的内容，返回它的 id */
  async function createWithCover(): Promise<number> {
    const created = await callerFor(db, ADMIN).content.create({
      ...draft,
      coverImage: OLD_COVER,
    });
    if (!created) throw new Error('测试前置条件失败：内容未创建');
    return created.id;
  }

  it('换封面时删掉旧文件', async () => {
    const id = await createWithCover();

    await callerFor(db, ADMIN).content.update({
      ...draft,
      id,
      coverImage: '/uploads/content/new.png',
    });

    expect(deleteFile).toHaveBeenCalledWith(OLD_COVER);
  });

  it('清空封面时把封面置空并删掉旧文件', async () => {
    const id = await createWithCover();

    await callerFor(db, ADMIN).content.update({
      ...draft,
      id,
      coverImage: null,
    });

    // 库里必须真的被置空。入参若退回 undefined，drizzle 会把该列整个跳过，
    // 表现就是「点掉封面、保存成功、刷新后封面还在」。
    const [row] = await db.select().from(content);
    expect(row?.coverImage).toBeNull();
    expect(deleteFile).toHaveBeenCalledWith(OLD_COVER);
  });

  it('入参不带 coverImage 时不碰旧文件', async () => {
    const id = await createWithCover();

    // 这一路最危险：drizzle 遇到 undefined 会跳过该列，封面其实原封不动。
    // 若用入参而不是「库里的新旧值」来判断是否清理，这里就会把仍在使用的文件删掉。
    await callerFor(db, ADMIN).content.update({ ...draft, id });

    const [row] = await db.select().from(content);
    expect(row?.coverImage).toBe(OLD_COVER);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('删除内容时一并删掉封面', async () => {
    const id = await createWithCover();

    await callerFor(db, ADMIN).content.delete({ id });

    expect(deleteFile).toHaveBeenCalledWith(OLD_COVER);
  });

  it('无封面的内容被删除时不会去删文件', async () => {
    const created = await callerFor(db, ADMIN).content.create(draft);
    if (!created) throw new Error('测试前置条件失败：内容未创建');

    await callerFor(db, ADMIN).content.delete({ id: created.id });

    expect(deleteFile).not.toHaveBeenCalled();
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
    await seedContentTypes(db);
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

describe('content router 类型登记校验', () => {
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
    await seedContentTypes(db);
  });

  it('创建未登记的类型被拒绝', async () => {
    await expect(
      callerFor(db, ADMIN).content.create({ ...draft, type: 'unregistered' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('一个类型都没登记时，连默认类型也建不了', async () => {
    await db.delete(systemConfig);

    await expect(
      callerFor(db, ADMIN).content.create(draft),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('更新时换成未登记的类型被拒绝', async () => {
    const created = await callerFor(db, ADMIN).content.create(draft);
    if (!created) throw new Error('测试前置条件失败：内容未创建');

    await expect(
      callerFor(db, ADMIN).content.update({
        ...draft,
        id: created.id,
        type: 'unregistered',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('类型从清单移除后，历史内容沿用原类型仍可编辑', async () => {
    const created = await callerFor(db, ADMIN).content.create(draft);
    if (!created) throw new Error('测试前置条件失败：内容未创建');

    // 管理员把 news 从清单里删掉，只留 blog
    await db.delete(systemConfig);
    await seedContentTypes(db, ['blog']);

    const updated = await callerFor(db, ADMIN).content.update({
      ...draft,
      id: created.id,
      title: '改个错别字',
    });

    expect(updated?.title).toBe('改个错别字');
  });

  it('类型从清单移除后，仍可把历史内容改成一个已登记的类型', async () => {
    const created = await callerFor(db, ADMIN).content.create(draft);
    if (!created) throw new Error('测试前置条件失败：内容未创建');

    await db.delete(systemConfig);
    await seedContentTypes(db, ['blog']);

    const updated = await callerFor(db, ADMIN).content.update({
      ...draft,
      id: created.id,
      type: 'blog',
    });

    expect(updated?.type).toBe('blog');
  });
});

describe('content router 分类', () => {
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
    await seedContentTypes(db);
  });

  /** 建一棵 a → b → c 的三层分类树，返回各自的 id */
  async function seedTree() {
    const caller = callerFor(db, ADMIN).content;
    const a = await caller.createCategory({ name: 'A', slug: 'a' });
    if (!a) throw new Error('测试前置条件失败：分类 A 未创建');
    const b = await caller.createCategory({
      name: 'B',
      slug: 'b',
      parentId: a.id,
    });
    if (!b) throw new Error('测试前置条件失败：分类 B 未创建');
    const c = await caller.createCategory({
      name: 'C',
      slug: 'c',
      parentId: b.id,
    });
    if (!c) throw new Error('测试前置条件失败：分类 C 未创建');
    return { a, b, c };
  }

  it('updateCategory 能改名与改 slug', async () => {
    const { a } = await seedTree();
    const updated = await callerFor(db, ADMIN).content.updateCategory({
      id: a.id,
      name: '行业动态',
      slug: 'industry',
    });
    expect(updated?.name).toBe('行业动态');
    expect(updated?.slug).toBe('industry');
  });

  it('slug 重复时报 CONFLICT 而不是 500', async () => {
    const { a, b } = await seedTree();
    await expect(
      callerFor(db, ADMIN).content.updateCategory({
        id: b.id,
        name: 'B',
        slug: a.slug,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('不存在的分类报 NOT_FOUND', async () => {
    await expect(
      callerFor(db, ADMIN).content.updateCategory({
        id: 99999,
        name: 'X',
        slug: 'x',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  // 下面三条是这次改动里最有风险的部分：parentId 自引用，数据库层没有任何约束
  // 能拦住环。一旦落库，任何自顶向下遍历这棵树的代码都会无限递归，而且连
  // 「把它改回去」的后台页面本身都打不开，只能手工改库。
  it('不能把父级设为自己', async () => {
    const { a } = await seedTree();
    await expect(
      callerFor(db, ADMIN).content.updateCategory({
        id: a.id,
        name: 'A',
        slug: 'a',
        parentId: a.id,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('不能把父级设为自己的直接子级（两节点环）', async () => {
    const { a, b } = await seedTree();
    await expect(
      callerFor(db, ADMIN).content.updateCategory({
        id: a.id,
        name: 'A',
        slug: 'a',
        parentId: b.id,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('不能把父级设为更深的后代（跨层环）', async () => {
    // a → b → c，此时把 a 挂到 c 底下。只查一层父级的实现会漏掉这种情况，
    // 所以必须显式覆盖。
    const { a, c } = await seedTree();
    await expect(
      callerFor(db, ADMIN).content.updateCategory({
        id: a.id,
        name: 'A',
        slug: 'a',
        parentId: c.id,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('合法的重挂父级不受影响', async () => {
    const { a, c } = await seedTree();
    // 把 c 从 b 底下挪到 a 底下 —— 方向朝上，不成环，应当放行
    const updated = await callerFor(db, ADMIN).content.updateCategory({
      id: c.id,
      name: 'C',
      slug: 'c',
      parentId: a.id,
    });
    expect(updated?.parentId).toBe(a.id);
  });

  it('删除分类不会删掉内容，只把它变成未分类', async () => {
    const { a } = await seedTree();
    const created = await callerFor(db, ADMIN).content.create({
      ...draft,
      categoryId: a.id,
    });
    if (!created) throw new Error('测试前置条件失败：内容未创建');

    await callerFor(db, ADMIN).content.deleteCategory({ id: a.id });

    // 外键是 ON DELETE SET NULL —— 内容必须还在，只是失去了分类。
    // 若哪天有人把它改成 CASCADE，删一个分类会静默带走一批内容，这条会先红。
    const after = await callerFor(db, ADMIN).content.byId({ id: created.id });
    expect(after.id).toBe(created.id);
    expect(after.categoryId).toBeNull();
  });

  it('后台列表能按分类筛选，0 表示未分类', async () => {
    const { a } = await seedTree();
    const caller = callerFor(db, ADMIN).content;
    await caller.create({ ...draft, slug: 'with-cat', categoryId: a.id });
    await caller.create({ ...draft, slug: 'no-cat' });

    const inCategory = await caller.list({ categoryId: a.id });
    expect(inCategory.rows.map((r) => r.slug)).toEqual(['with-cat']);
    // 分类名随列表一起回传，前端不必自己映射
    expect(inCategory.rows[0]?.categoryName).toBe('A');

    const uncategorized = await caller.list({ categoryId: 0 });
    expect(uncategorized.rows.map((r) => r.slug)).toEqual(['no-cat']);
    expect(uncategorized.rows[0]?.categoryName).toBeNull();

    // 不传则不过滤
    expect((await caller.list({})).total).toBe(2);
  });
});
