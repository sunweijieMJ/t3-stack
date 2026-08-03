import { AntdRegistry } from '@ant-design/nextjs-registry';
import { redirect } from 'next/navigation';
import { getSession } from '@/server/better-auth/server';
import { userCan } from '@/server/services/admin-check';
import { AdminShell } from './admin-shell';
import { AdminAntdProvider } from './antd-provider';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  // 这两条 redirect 实际上是兜底：proxy.ts 的 adminPatterns 会先一步拦下 /admin/*，
  // 未登录时带着**真实 pathname** 跳登录页，非管理员则打回首页。
  // 之所以保留，是因为 proxy 的 matcher 是配置文件里的一行正则 —— 哪天被改窄了，
  // 这里还能挡住越权访问，而不是直接把后台裸露出去。
  // 不在这里拼 callbackUrl：这层拿不到子路径，写死 /admin 反而会把 proxy 已经
  // 正确回传的路径覆盖成后台首页。
  if (!session?.user) redirect('/signin');

  if (!userCan(session.user, 'admin.access')) {
    redirect('/no-access');
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
