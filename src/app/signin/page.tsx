import { env } from '@/env';
import { parseAuthMethod } from '@/lib/auth-methods';
import { getSiteName } from '@/server/services/config';
import SignInForm from './signin-form';

// 强制动态渲染：env.AUTH_METHOD 与 DB 中的站点名都是运行时变量，
// 默认 SSG 会在构建期预渲染（此时拿不到正确值），必须按请求重新求值。
export const dynamic = 'force-dynamic';

// Server Component：在请求时读取运行时 env 与 DB 配置，
// 通过 props 注入客户端表单。改 .env / 后台设置后均无需重新构建。
export default async function SignInPage() {
  const authMethod = parseAuthMethod(env.AUTH_METHOD);
  const siteName = await getSiteName();
  return <SignInForm authMethod={authMethod} siteName={siteName} />;
}
