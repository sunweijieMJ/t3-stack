import { adminRouter } from '@/server/api/routers/admin';
import { contentRouter } from '@/server/api/routers/content';
import { pageRouter } from '@/server/api/routers/page';
import { createCallerFactory, createTRPCRouter } from '@/server/api/trpc';

export const appRouter = createTRPCRouter({
  sys: adminRouter,
  page: pageRouter,
  content: contentRouter,
});

export type AppRouter = typeof appRouter;

/** 直连调用入口。测试用它跳过 HTTP 层直接验证 router 行为。 */
export const createCaller = createCallerFactory(appRouter);

// createCaller 一度被移除（配合已删除的 lib/trpc/server.ts）：当时全项目没有任何
// Server Component 走 tRPC —— admin 页面全是 'use client' + useQuery，门户页面直接
// 调 services/config，属于 T3 模板残留。
// 现在重新加回，因为 router 的集成测试需要绕过 HTTP 直接调用。运行时仍然没有调用点，
// 但它同时也是将来在 RSC 里调 tRPC 的现成入口。
