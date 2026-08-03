import { describe, expect, it } from 'vitest';
import {
  type ContentVisibilityInput,
  isContentVisibleTo,
  normalizeContentStatus,
  resolveContentState,
} from '@/lib/content-visibility';

const NOW = new Date('2026-08-03T12:00:00Z');
const PAST = new Date('2026-08-01T00:00:00Z');
const FUTURE = new Date('2026-09-01T00:00:00Z');

function content(
  over: Partial<ContentVisibilityInput> = {},
): ContentVisibilityInput {
  return {
    status: 'published',
    publishedAt: PAST,
    unpublishedAt: null,
    visibleRoles: [],
    ...over,
  };
}

describe('resolveContentState', () => {
  it('草稿状态直接返回 draft', () => {
    expect(resolveContentState(content({ status: 'draft' }), NOW)).toBe(
      'draft',
    );
  });

  it('归档状态直接返回 archived', () => {
    expect(resolveContentState(content({ status: 'archived' }), NOW)).toBe(
      'archived',
    );
  });

  it('已发布且在窗口内返回 live', () => {
    expect(resolveContentState(content(), NOW)).toBe('live');
  });

  it('发布时间未到返回 scheduled', () => {
    expect(resolveContentState(content({ publishedAt: FUTURE }), NOW)).toBe(
      'scheduled',
    );
  });

  it('已过下架时间返回 expired', () => {
    expect(resolveContentState(content({ unpublishedAt: PAST }), NOW)).toBe(
      'expired',
    );
  });

  it('没有发布时间的已发布内容视为立即生效', () => {
    expect(resolveContentState(content({ publishedAt: null }), NOW)).toBe(
      'live',
    );
  });

  it('下架时间早于发布时间时以下架为准，不会误判为 live', () => {
    expect(
      resolveContentState(
        content({ publishedAt: PAST, unpublishedAt: PAST }),
        NOW,
      ),
    ).toBe('expired');
  });
});

describe('isContentVisibleTo 按发布状态', () => {
  it('live 内容对匿名访客可见', () => {
    expect(isContentVisibleTo(content(), { role: null, now: NOW })).toBe(true);
  });

  it('草稿对任何人都不可见，包括管理员', () => {
    expect(
      isContentVisibleTo(content({ status: 'draft' }), {
        role: 'admin',
        now: NOW,
      }),
    ).toBe(false);
  });

  it('未到发布时间的内容不可见', () => {
    expect(
      isContentVisibleTo(content({ publishedAt: FUTURE }), {
        role: 'admin',
        now: NOW,
      }),
    ).toBe(false);
  });

  it('已下架的内容不可见', () => {
    expect(
      isContentVisibleTo(content({ unpublishedAt: PAST }), {
        role: null,
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe('isContentVisibleTo 按角色范围', () => {
  it('未限定角色时所有人可见', () => {
    expect(
      isContentVisibleTo(content({ visibleRoles: [] }), {
        role: null,
        now: NOW,
      }),
    ).toBe(true);
  });

  it('限定角色时命中的角色可见', () => {
    expect(
      isContentVisibleTo(content({ visibleRoles: ['editor'] }), {
        role: 'editor',
        now: NOW,
      }),
    ).toBe(true);
  });

  it('限定角色时未命中的角色不可见', () => {
    expect(
      isContentVisibleTo(content({ visibleRoles: ['editor'] }), {
        role: 'user',
        now: NOW,
      }),
    ).toBe(false);
  });

  it('限定角色时匿名访客不可见', () => {
    expect(
      isContentVisibleTo(content({ visibleRoles: ['user'] }), {
        role: null,
        now: NOW,
      }),
    ).toBe(false);
  });

  it('限定多个角色时任一命中即可见', () => {
    expect(
      isContentVisibleTo(content({ visibleRoles: ['editor', 'user'] }), {
        role: 'user',
        now: NOW,
      }),
    ).toBe(true);
  });

  it('角色限定不会给 admin 开后门', () => {
    expect(
      isContentVisibleTo(content({ visibleRoles: ['editor'] }), {
        role: 'admin',
        now: NOW,
      }),
    ).toBe(false);
  });
});

describe('normalizeContentStatus', () => {
  it('识别合法状态', () => {
    expect(normalizeContentStatus('draft')).toBe('draft');
    expect(normalizeContentStatus('published')).toBe('published');
    expect(normalizeContentStatus('archived')).toBe('archived');
  });

  it('未知状态回落到 draft，即最不暴露的一侧', () => {
    expect(normalizeContentStatus('live')).toBe('draft');
    expect(normalizeContentStatus('')).toBe('draft');
  });

  it('空值与非字符串不抛错', () => {
    expect(normalizeContentStatus(null)).toBe('draft');
    expect(normalizeContentStatus(undefined)).toBe('draft');
    expect(normalizeContentStatus(42)).toBe('draft');
  });
});

describe('resolveContentState 对脏状态的处理', () => {
  it('库里被写入非法 status 时按草稿处理，不会误发布', () => {
    const dirty = { ...content(), status: 'whatever' as never };

    expect(resolveContentState(dirty, NOW)).toBe('draft');
    expect(isContentVisibleTo(dirty, { role: 'admin', now: NOW })).toBe(false);
  });
});
