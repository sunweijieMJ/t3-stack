/**
 * 让 @/server/db 的模块级 db 指向当前测试库。
 *
 * 审计中间件（server/api/trpc.ts）写日志用的是模块级 db，而不是 ctx.db ——
 * 直连 caller 传进去的测试库对它无效。不接管的话，每条 mutation 都会向
 * DATABASE_URL（测试环境下是个不存在的地址）发起一次插入，失败后走
 * `.catch(console.error)`。这些拒绝在测试文件跑完之后才结算，与 vitest
 * worker 的 teardown 抢跑，表现为「用例全绿但报 Closing rpc while
 * onUserConsoleLog was pending」这种随机失败。
 *
 * 用 Proxy 转发而非直接赋值：vi.mock 的工厂在导入期就执行，那时测试库还没
 * 在 beforeAll 里建好，只能延迟到每次属性访问时再取。
 */
export const serverDbHolder: { db: unknown } = { db: null };

export function createServerDbProxy() {
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        const current = serverDbHolder.db;
        if (!current) {
          throw new Error(
            '测试库尚未注入：请在 beforeAll 里设置 serverDbHolder.db',
          );
        }
        return Reflect.get(current as object, prop);
      },
    },
  );
}
