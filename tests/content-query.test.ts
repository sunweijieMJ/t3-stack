import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type ContentVisibilityInput,
  isContentVisibleTo,
  type Viewer,
} from '@/lib/content-visibility';
import type { Role } from '@/lib/rbac';
import { content } from '@/server/db/schema';
import { visibleContentWhere } from '@/server/services/content-query';
import { createTestDb, type TestDb } from './helpers/db';

const NOW = new Date('2026-08-03T12:00:00Z');
const PAST = new Date('2026-08-01T00:00:00Z');
const FUTURE = new Date('2026-09-01T00:00:00Z');

/** 覆盖全部状态组合的固定样本，slug 即用例名 */
const FIXTURES: Array<{ slug: string } & ContentVisibilityInput> = [
  {
    slug: 'live-public',
    status: 'published',
    publishedAt: PAST,
    unpublishedAt: null,
    visibleRoles: [],
  },
  {
    slug: 'live-no-publish-time',
    status: 'published',
    publishedAt: null,
    unpublishedAt: null,
    visibleRoles: [],
  },
  {
    slug: 'live-editor-only',
    status: 'published',
    publishedAt: PAST,
    unpublishedAt: null,
    visibleRoles: ['editor'],
  },
  {
    slug: 'live-until-future',
    status: 'published',
    publishedAt: PAST,
    unpublishedAt: FUTURE,
    visibleRoles: [],
  },
  {
    slug: 'draft',
    status: 'draft',
    publishedAt: PAST,
    unpublishedAt: null,
    visibleRoles: [],
  },
  {
    slug: 'archived',
    status: 'archived',
    publishedAt: PAST,
    unpublishedAt: null,
    visibleRoles: [],
  },
  {
    slug: 'scheduled',
    status: 'published',
    publishedAt: FUTURE,
    unpublishedAt: null,
    visibleRoles: [],
  },
  {
    slug: 'expired',
    status: 'published',
    publishedAt: PAST,
    unpublishedAt: PAST,
    visibleRoles: [],
  },
];

async function queryVisibleSlugs(db: TestDb, viewer: Viewer) {
  const rows = await db
    .select({ slug: content.slug })
    .from(content)
    .where(and(eq(content.type, 'news'), visibleContentWhere(viewer)));
  return rows.map((r) => r.slug).sort();
}

/** 用纯函数算出同一批样本里应当可见的 slug，作为 SQL 结果的对照 */
function expectedVisibleSlugs(viewer: Viewer) {
  return FIXTURES.filter((f) => isContentVisibleTo(f, viewer))
    .map((f) => f.slug)
    .sort();
}

describe('visibleContentWhere', () => {
  let db: TestDb;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await db.insert(content).values(
      FIXTURES.map((f) => ({
        type: 'news',
        title: f.slug,
        slug: f.slug,
        status: f.status,
        publishedAt: f.publishedAt,
        unpublishedAt: f.unpublishedAt,
        visibleRoles: [...f.visibleRoles],
      })),
    );
  });

  afterAll(async () => {
    await close();
  });

  it('匿名访客只看到公开且在窗口内的内容', async () => {
    expect(await queryVisibleSlugs(db, { role: null, now: NOW })).toEqual([
      'live-no-publish-time',
      'live-public',
      'live-until-future',
    ]);
  });

  it('editor 额外看到定向给 editor 的内容', async () => {
    expect(await queryVisibleSlugs(db, { role: 'editor', now: NOW })).toContain(
      'live-editor-only',
    );
  });

  it('普通用户看不到定向给 editor 的内容', async () => {
    expect(
      await queryVisibleSlugs(db, { role: 'user', now: NOW }),
    ).not.toContain('live-editor-only');
  });

  it('草稿、归档、未到点、已过期一律不出现', async () => {
    const slugs = await queryVisibleSlugs(db, { role: 'admin', now: NOW });

    expect(slugs).not.toContain('draft');
    expect(slugs).not.toContain('archived');
    expect(slugs).not.toContain('scheduled');
    expect(slugs).not.toContain('expired');
  });

  // 这条是本文件的核心：SQL 谓词和纯函数是同一套语义的两份实现，
  // 一旦有人只改了其中一处（例如给 SQL 加了 admin 后门），这里立刻会红。
  it.each([
    null,
    'user',
    'editor',
    'admin',
  ] as Array<Role | null>)('SQL 过滤结果与纯函数判定完全一致（role=%s）', async (role) => {
    const viewer: Viewer = { role, now: NOW };

    expect(await queryVisibleSlugs(db, viewer)).toEqual(
      expectedVisibleSlugs(viewer),
    );
  });

  it('时间推进后原本未到点的内容变为可见', async () => {
    const later = new Date('2026-09-02T00:00:00Z');

    const slugs = await queryVisibleSlugs(db, { role: null, now: later });

    expect(slugs).toContain('scheduled');
    // 同一时刻 live-until-future 已过下架时间，应当消失
    expect(slugs).not.toContain('live-until-future');
  });
});
