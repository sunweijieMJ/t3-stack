import { adminRouter } from '@/server/api/routers/admin';
import { pageRouter } from '@/server/api/routers/page';
import { createTRPCRouter } from '@/server/api/trpc';

export const appRouter = createTRPCRouter({
  sys: adminRouter,
  page: pageRouter,
});

export type AppRouter = typeof appRouter;

// 这里曾经导出 createCaller（配合已删除的 lib/trpc/server.ts 做 RSC 直连调用）。
// 全项目没有任何 Server Component 走 tRPC —— admin 页面全是 'use client' + useQuery，
// 门户页面直接调 services/config。属于 T3 模板残留，一并移除。
// 将来若要在 RSC 里调 tRPC，重新加回 createCallerFactory(appRouter) 即可。
