import { redirect } from 'next/navigation';
import { DEFAULT_PRIMARY_COLOR } from '@/constants/frontend-config';
import { env } from '@/env';
import { parseAuthMethod } from '@/lib/auth-methods';
import { safeInternalPath } from '@/lib/safe-path';
import { getSession } from '@/server/better-auth/server';
import { getFrontendConfig, getSiteName } from '@/server/services/config';
import SignInForm from './signin-form';

// 强制动态渲染：env.AUTH_METHOD 与 DB 中的站点名都是运行时变量，
// 默认 SSG 会在构建期预渲染（此时拿不到正确值），必须按请求重新求值。
export const dynamic = 'force-dynamic';

// Server Component：在请求时读取运行时 env 与 DB 配置，通过 props 注入客户端表单。
// 改 .env / 后台设置后均无需重新构建。
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const authMethod = parseAuthMethod(env.AUTH_METHOD);
  const [siteName, cfg, sp] = await Promise.all([
    getSiteName(),
    getFrontendConfig(),
    searchParams,
  ]);

  // callbackUrl 改在服务端解析（本页已是 force-dynamic，读 searchParams 不额外付出代价）。
  // 此前放在客户端用 useSearchParams，被迫把整页包进 Suspense，而 fallback 是 null ——
  // 等于 SSR 阶段登录页输出空 HTML，首屏要等 JS 下载执行完才有内容。
  //
  // 优先级：callbackUrl（用户本来想去的页面）→ 后台配置的默认页面 → 首页。
  // callbackUrl 来自 URL 查询串（攻击者可控），defaultPage 来自后台配置（只有管理员可写），
  // 两者都要过 safeInternalPath 这道开放重定向防护。
  const rawCallback = Array.isArray(sp.callbackUrl)
    ? sp.callbackUrl[0]
    : sp.callbackUrl;
  const redirectTo =
    safeInternalPath(rawCallback) ??
    safeInternalPath(cfg.basic?.defaultPage) ??
    '/';

  // 已登录还停在登录页是没有意义的一屏：典型场景是 session 还在时点了收藏夹里的
  // /signin，或者被 proxy 带着 callbackUrl 打回来但 cookie 其实有效。直接送到目的地。
  // 放在 redirectTo 算完之后，这样 ?callbackUrl= 对已登录用户同样生效
  // （相当于一个走登录页中转的站内跳转），且同样受 safeInternalPath 白名单约束。
  //
  // 要换账号的用户先退出登录即可 —— 后台右上角有「退出登录」。
  const session = await getSession();
  if (session?.user) redirect(redirectTo);

  return (
    <SignInForm
      authMethod={authMethod}
      primaryColor={cfg.basic?.primaryColor || DEFAULT_PRIMARY_COLOR}
      redirectTo={redirectTo}
      siteName={siteName}
    />
  );
}
