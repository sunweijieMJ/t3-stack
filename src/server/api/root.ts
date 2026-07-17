import { adminRouter } from '@/server/api/routers/admin';
import { pageRouter } from '@/server/api/routers/page';
import { createCallerFactory, createTRPCRouter } from '@/server/api/trpc';

export const appRouter = createTRPCRouter({
  sys: adminRouter,
  page: pageRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
