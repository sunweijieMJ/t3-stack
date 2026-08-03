import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { content, contentCategory, user } from '@/server/db/schema';
import { createTestDb, resetDb, type TestDb } from './helpers/db';

/** 插入分类并返回它；拿不到自增 id 说明前置条件没成立，直接失败 */
async function insertCategory(
  db: TestDb,
  values: { name: string; slug: string },
) {
  const [row] = await db.insert(contentCategory).values(values).returning();
  if (!row) throw new Error('测试前置条件失败：分类未写入');
  return row;
}

describe('content 表', () => {
  let db: TestDb;
  let close: () => Promise<void>;

  const base = { type: 'announcement', slug: 'notice-1', title: '第一条公告' };

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  it('新建内容默认是草稿、未置顶、对所有角色开放', async () => {
    await db.insert(content).values(base);

    const [row] = await db.select().from(content);

    expect(row?.status).toBe('draft');
    expect(row?.pinned).toBe(false);
    expect(row?.visibleRoles).toEqual([]);
    expect(row?.body).toBe('');
  });

  it('可见角色以数组形式读写', async () => {
    await db.insert(content).values({ ...base, visibleRoles: ['editor'] });

    const [row] = await db.select().from(content);

    expect(row?.visibleRoles).toEqual(['editor']);
  });

  it('同一 type 下 slug 不能重复', async () => {
    await db.insert(content).values(base);

    await expect(db.insert(content).values(base)).rejects.toThrow();
  });

  it('不同 type 之间 slug 可以重复', async () => {
    await db.insert(content).values(base);

    await expect(
      db.insert(content).values({ ...base, type: 'news' }),
    ).resolves.not.toThrow();
  });

  it('删除作者后内容保留，署名置空', async () => {
    await db.insert(user).values({
      id: 'u1',
      name: '作者',
      email: 'author@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(content).values({ ...base, authorId: 'u1' });

    await db.delete(user).where(eq(user.id, 'u1'));

    const [row] = await db.select().from(content);
    expect(row).toBeDefined();
    expect(row?.authorId).toBeNull();
  });

  it('删除分类后内容保留，分类置空', async () => {
    const cat = await insertCategory(db, { name: '通知', slug: 'notice' });
    await db.insert(content).values({ ...base, categoryId: cat.id });

    await db.delete(contentCategory).where(eq(contentCategory.id, cat.id));

    const [row] = await db.select().from(content);
    expect(row).toBeDefined();
    expect(row?.categoryId).toBeNull();
  });
});

describe('content_category 表', () => {
  let db: TestDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(async () => {
    await resetDb(db);
  });

  it('slug 全局唯一', async () => {
    await db.insert(contentCategory).values({ name: '通知', slug: 'notice' });

    await expect(
      db.insert(contentCategory).values({ name: '公告', slug: 'notice' }),
    ).rejects.toThrow();
  });

  it('支持父子层级', async () => {
    const parent = await insertCategory(db, { name: '学院', slug: 'school' });

    await db
      .insert(contentCategory)
      .values({ name: '计算机', slug: 'cs', parentId: parent.id });

    const [child] = await db
      .select()
      .from(contentCategory)
      .where(eq(contentCategory.slug, 'cs'));
    expect(child?.parentId).toBe(parent.id);
  });

  it('删除父分类时子分类挂回顶层而非被级联删除', async () => {
    const parent = await insertCategory(db, { name: '学院', slug: 'school' });
    await db
      .insert(contentCategory)
      .values({ name: '计算机', slug: 'cs', parentId: parent.id });

    await db.delete(contentCategory).where(eq(contentCategory.id, parent.id));

    const [child] = await db
      .select()
      .from(contentCategory)
      .where(eq(contentCategory.slug, 'cs'));
    expect(child).toBeDefined();
    expect(child?.parentId).toBeNull();
  });
});
