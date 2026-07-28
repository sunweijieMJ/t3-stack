import { AntdRegistry } from '@ant-design/nextjs-registry';
import { redirect } from 'next/navigation';
import { getSession } from '@/server/better-auth/server';
import { isAdminEmail } from '@/server/services/admin-check';
import { AdminShell } from './admin-shell';
import { AdminAntdProvider } from './antd-provider';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  // 未登录时回带 callbackUrl=/admin，避免登录后落到网站首页（精确子路径需要中间件
  // 注入 pathname，当前实现仅恢复到 admin 首页）；signin 表单已对 callbackUrl 做白名单防护。
  if (!session?.user) redirect('/signin?callbackUrl=/admin');

  if (!isAdminEmail(session.user.email)) {
    redirect('/');
  }

  // AntdRegistry 负责在 SSR 阶段收集 antd 的 CSS-in-JS 并通过 useServerInsertedHTML
  // 注入到 HTML 里。缺了它样式只能等客户端 hydrate 后才生成，admin 首屏会闪一下无样式。
  return (
    <AntdRegistry>
      <AdminAntdProvider>
        <AdminShell>{children}</AdminShell>
      </AdminAntdProvider>
    </AntdRegistry>
  );
}
