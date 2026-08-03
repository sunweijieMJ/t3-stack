import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ROLE } from '@/lib/rbac';
import { user } from '@/server/db/schema';
import { getUserRole } from '@/server/services/admin-check';
import { createTestDb, resetDb, type TestDb } from './helpers/db';

/**
 * 这些用例跑在 drizzle/ 下的真实迁移之上，因此同时也在守护迁移本身：
 * 若 0002 里的 role 列被改坏或漏掉，插入与默认值断言会直接失败。
 */
describe('user.role', () => {
  let db: TestDb;
  let close: () => Promise<void>;

  const baseUser = {
    id: 'u1',
    name: '张三',
    email: 'zhangsan@example.com',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  /** 取回刚写入的用户；取不到说明测试前置条件就没成立，直接失败而非静默跳过断言 */
  async function fetchUser() {
    const [row] = await db.select().from(user).where(eq(user.id, 'u1'));
    if (!row) throw new Error('测试前置条件失败：用户未写入');
    return row;
  }

  it('不指定角色时落库为默认角色', async () => {
    await db.insert(user).values(baseUser);

    expect((await fetchUser()).role).toBe(DEFAULT_ROLE);
  });

  it('可以写入并读回非默认角色', async () => {
    await db.insert(user).values({ ...baseUser, role: 'editor' });

    expect((await fetchUser()).role).toBe('editor');
  });

  it('getUserRole 读取库里的角色', async () => {
    await db.insert(user).values({ ...baseUser, role: 'editor' });

    expect(getUserRole(await fetchUser())).toBe('editor');
  });

  it('库里被手工写入非法角色时按默认角色处理，不会提权', async () => {
    await db.insert(user).values({ ...baseUser, role: 'superuser' });

    expect(getUserRole(await fetchUser())).toBe(DEFAULT_ROLE);
  });
});
