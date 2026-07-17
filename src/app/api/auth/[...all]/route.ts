import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@/server/better-auth';

const { GET, POST: handlePost } = toNextJsHandler(auth.handler);

export { GET };

// 公开注册端点必须在 HTTP 层屏蔽：管理员账号只能通过后台 sys.createUser 创建
// （服务端直接调用 auth.api.signUpEmail，不经过这个 route，不受影响）。
export async function POST(request: Request) {
  const { pathname } = new URL(request.url);
  if (pathname.endsWith('/sign-up/email')) {
    return new Response(null, { status: 404 });
  }
  return handlePost(request);
}
