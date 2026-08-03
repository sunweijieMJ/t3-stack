import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminAuditLog, systemConfig, user } from '@/server/db/schema';
import { createTestDb, resetDb, type TestDb } from './helpers/db';

describe('createTestDb', () => {
  let db: TestDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  it('返回一个已建好表结构、可读写的数据库', async () => {
    await db
      .insert(systemConfig)
      .values({ key: 'frontend', value: { title: 'demo' } });

    const rows = await db.select().from(systemConfig);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe('frontend');
    expect(rows[0]?.value).toEqual({ title: 'demo' });
  });

  it('resetDb 清空所有业务表', async () => {
    await db.insert(systemConfig).values({ key: 'stale', value: {} });
    await db.insert(user).values({
      id: 'u1',
      name: '测试用户',
      email: 'stale@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await resetDb(db);

    expect(await db.select().from(systemConfig)).toHaveLength(0);
    expect(await db.select().from(user)).toHaveLength(0);
  });

  it('resetDb 后自增主键从头开始', async () => {
    await db
      .insert(adminAuditLog)
      .values({ action: 'first', result: 'success' });
    await resetDb(db);
    await db
      .insert(adminAuditLog)
      .values({ action: 'second', result: 'success' });

    const rows = await db.select().from(adminAuditLog);

    expect(rows[0]?.id).toBe(1);
  });
});
