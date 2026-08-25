import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { NextRequest } from 'next/server';

import { env } from '@/env';
import { appRouter } from '@/server/api/root';
import { createTRPCContext } from '@/server/api/trpc';

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

/**
 * 生产环境同样要落日志。
 *
 * 原先这里是 `env.NODE_ENV === 'development' ? ... : undefined` —— 生产环境
 * 除了各 router 里手写的那几处 console.error，其余 procedure 抛出的异常
 * （DB 连接断了、约束冲突没被识别、第三方 SDK 报错）全部静默：客户端只收到
 * 一句被替换过的中文提示，服务端日志里一个字都没有。线上出问题时只能靠猜。
 *
 * 生产只记 INTERNAL_SERVER_ERROR 这一类「非预期」错误，不记
 * UNAUTHORIZED / FORBIDDEN / NOT_FOUND / CONFLICT / BAD_REQUEST ——
 * 那些是正常的业务分支（越权尝试另有审计日志覆盖，见 services/audit），
 * 全记会让真正的故障淹没在噪声里。
 *
 * 不打印 input：入参可能含验证码、密码等敏感字段，脱敏逻辑在审计中间件里
 * （api/trpc.ts 的 sanitizeInput），这里不重复一遍，只留定位所需的 path。
 */
const EXPECTED_CODES = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'BAD_REQUEST',
  'TOO_MANY_REQUESTS',
]);

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    allowMethodOverride: true,
    createContext: () => createContext(req),
    onError: ({ path, error, type }) => {
      if (env.NODE_ENV === 'development') {
        console.error(
          `❌ tRPC failed on ${path ?? '<no-path>'}: ${error.message}`,
        );
        return;
      }
      if (EXPECTED_CODES.has(error.code)) return;
      console.error(
        `[tRPC] ${type} ${path ?? '<no-path>'} ${error.code}: ${error.message}`,
        error.cause ?? '',
      );
    },
  });

export { handler as GET, handler as POST };
