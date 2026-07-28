import { env } from '@/env';
import { parseAuthMethod } from '@/lib/auth-methods';
import AdminUsersView from './index';

// 与 signin/page.tsx 同理：AUTH_METHOD 是运行时变量，默认 SSG 会在构建期把它固化，
// 必须按请求求值。这也是本目录不沿用其他 admin 页 `export { default } from './index'`
// 写法的原因 —— 这里需要一个能读 env 的服务端组件。
export const dynamic = 'force-dynamic';

export default function AdminUsersPage() {
  return <AdminUsersView authMethod={parseAuthMethod(env.AUTH_METHOD)} />;
}
