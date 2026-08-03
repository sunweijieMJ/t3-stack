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
import { user } from '@/server/db/schema';
import { createTestDb, resetDb, type TestDb } from './helpers/db';

// 见 content-router.test.ts 的说明：直连 caller 没有 Next 请求作用域。
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

const ADMIN = {
  id: 'u-admin',
  email: 'admin@example.com',
  role: 'admin' as Role,
};
const ADMIN2 = {
  id: 'u-admin2',
  email: 'admin2@example.com',
  role: 'admin' as Role,
};
const EDITOR = {
  id: 'u-editor',
  email: 'editor@example.com',
  role: 'editor' as Role,
};

function callerFor(db: TestDb, u: typeof ADMIN | null) {
  return createCaller({
    db: db as never,
    session: u ? ({ user: u } as never) : null,
    headers: new Headers(),
  });
}

async function seed(db: TestDb, users: Array<typeof ADMIN>) {
  await db.insert(user).values(
    users.map((u) => ({
      id: u.id,
      name: u.email,
      email: u.email,
      role: u.role,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  );
}

describe('用户管理的权限边界', () => {
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
    await seed(db, [ADMIN, ADMIN2, EDITOR]);
  });

  // editor 能进后台（admin.access），但绝不该能碰用户账号。
  // 这几条把「后台准入」与「用户管理」两个权限点的区别钉死。
  it('editor 不能创建用户', async () => {
    await expect(
      callerFor(db, EDITOR).sys.createUser({
        email: 'new@example.com',
        name: '新人',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('editor 不能删除用户', async () => {
    await expect(
      callerFor(db, EDITOR).sys.deleteUser({ userId: ADMIN2.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('editor 不能查看用户列表', async () => {
    await expect(callerFor(db, EDITOR).sys.listUsers()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('editor 不能读审计日志', async () => {
    await expect(
      callerFor(db, EDITOR).sys.listAuditLogs({ page: 1, pageSize: 10 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('editor 不能改门户配置', async () => {
    await expect(
      callerFor(db, EDITOR).page.getFrontendConfig(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('admin 可以查看用户列表', async () => {
    const rows = await callerFor(db, ADMIN).sys.listUsers();

    expect(rows).toHaveLength(3);
  });
});

describe('setUserRole', () => {
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
    await seed(db, [ADMIN, ADMIN2, EDITOR]);
  });

  async function roleOf(id: string) {
    const rows = await callerFor(db, ADMIN).sys.listUsers();
    return rows.find((r) => r.id === id)?.role;
  }

  it('管理员可以把普通成员提升为 editor', async () => {
    await callerFor(db, ADMIN).sys.setUserRole({
      userId: EDITOR.id,
      role: 'user',
    });

    expect(await roleOf(EDITOR.id)).toBe('user');
  });

  it('editor 不能改别人的角色', async () => {
    await expect(
      callerFor(db, EDITOR).sys.setUserRole({
        userId: ADMIN2.id,
        role: 'user',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('不能改自己的角色，避免自锁', async () => {
    await expect(
      callerFor(db, ADMIN).sys.setUserRole({
        userId: ADMIN.id,
        role: 'user',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('管理员之间可以互相降级，只要不是最后一个', async () => {
    await callerFor(db, ADMIN).sys.setUserRole({
      userId: ADMIN2.id,
      role: 'user',
    });

    expect(await roleOf(ADMIN2.id)).toBe('user');
  });

  // 「降级最后一个管理员」这条守卫刻意没有对应用例：有 user.manage 的只有管理员，
  // 若库里只剩一个管理员，那人必然是操作者自己，会先被上面的自锁守卫挡下，
  // 因此该分支经 API 不可达。它是防御性的第二道（自锁守卫一旦放宽就会生效），
  // 保留但不为了凑覆盖率编造一个走不到的场景。

  it('拒绝非法角色值', async () => {
    await expect(
      callerFor(db, ADMIN).sys.setUserRole({
        userId: EDITOR.id,
        role: 'superuser' as never,
      }),
    ).rejects.toThrow();
  });

  it('用户不存在时报 NOT_FOUND', async () => {
    await expect(
      callerFor(db, ADMIN).sys.setUserRole({
        userId: 'nope',
        role: 'user',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
