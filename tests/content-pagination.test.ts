import { describe, expect, it, vi } from 'vitest';

// content-public 会拉起 db / better-auth 依赖链，这里只测其中的纯页码收敛函数，
// 把这两条依赖挡掉即可，避免为一个纯函数启一整套集成环境。
vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/better-auth/server', () => ({
  getSession: vi.fn(async () => null),
}));

const { clampPage } = await import('@/server/services/content-public');

describe('clampPage', () => {
  it('正常页码原样返回', () => {
    expect(clampPage(1)).toBe(1);
    expect(clampPage(7)).toBe(7);
    expect(clampPage('3')).toBe(3);
  });

  it.each([
    ['Infinity 字符串', 'Infinity'],
    ['非数字', 'abc'],
    ['空串', ''],
    ['0', '0'],
    ['负数', '-5'],
    ['undefined', undefined],
    ['null', null],
  ])('非法输入（%s）回落到第 1 页', (_label, value) => {
    // 这些值原先会经 Number() 变成 Infinity / NaN / 0 / 负数，
    // 再算进 offset 传给 PG —— 门户列表页因此 500 而不是回落。
    expect(clampPage(value)).toBe(1);
  });

  it('小数向下取整，不产生非整数页语义', () => {
    // 旧实现下 ?page=1.5 会得到 offset=5 这种「半页」偏移
    expect(clampPage('1.9')).toBe(1);
    expect(clampPage(2.7)).toBe(2);
  });

  it('超大页码被封顶，避免深分页全表扫', () => {
    expect(clampPage(999_999_999)).toBe(10_000);
    // 科学计数法是合法的有限数，走封顶而不是回落 —— 关键是它不再被原样
    // 塞进 offset 交给 PG 去转 bigint（那会直接抛语法错误并渲染 500）。
    expect(clampPage('1e21')).toBe(10_000);
  });
});
