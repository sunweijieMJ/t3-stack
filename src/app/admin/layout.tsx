import { AntdRegistry } from '@ant-design/nextjs-registry';
import { redirect } from 'next/navigation';
import { DEFAULT_PRIMARY_COLOR } from '@/constants/frontend-config';
import { getSession } from '@/server/better-auth/server';
import { getUserRole, userCan } from '@/server/services/admin-check';
import { getFrontendConfig, getSiteName } from '@/server/services/config';
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
  // 角色在服务端算好再注入：getUserRole 要读 ADMIN_EMAILS（server-only），
  // 客户端拿不到白名单，自己算会漏掉「靠环境变量成为管理员」这一路。
  const role = getUserRole(session.user);

  // 站点名与主题色同样在服务端读好再注入。
  //
  // 此前是客户端 useFrontendConfig() 走 page.getFrontendConfig，而那个接口要
  // config.manage —— 但外壳包着**所有**后台页面，于是 editor（只有 content.manage）
  // 每打开一个后台页面都发一个必然 403 的请求（React Query 还会重试），侧边栏
  // 站点名与主题色静默退回默认值。外壳要的只是三个非敏感字段，没有任何理由
  // 挂在配置管理权限上。
  //
  // 放在权限校验之后：没通过的请求不该再多打这两次 DB。
  const [siteName, cfg] = await Promise.all([
    getSiteName(),
    getFrontendConfig(),
  ]);
  const primaryColor = cfg.basic?.primaryColor || DEFAULT_PRIMARY_COLOR;

  return (
    <AntdRegistry>
      <AdminAntdProvider primaryColor={primaryColor}>
        <AdminShell role={role} siteName={siteName}>
          {children}
        </AdminShell>
      </AdminAntdProvider>
    </AntdRegistry>
  );
}
