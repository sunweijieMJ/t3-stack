import type { CSSProperties } from 'react';
// reset 仅在 portal 子树生效，避免影响 admin 子树的 AntD 组件默认样式
import '@unocss/reset/tailwind.css';
import { PortalFooter } from '@/components/PortalFooter';
import { PortalHeader } from '@/components/PortalHeader';
import { PortalStickyNav } from '@/components/PortalStickyNav';
import { PortalLayoutProvider } from '@/context/portal-layout-context';
import { getFrontendConfig } from '@/server/services/config';

// portal 整体走 ISR：所有页面继承 60s revalidate（admin 改完最坏 60s 见效）。
// 单个页面如需更激进的缓存可在自己的 page.tsx 覆写 revalidate。
export const revalidate = 60;

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cfg = await getFrontendConfig();
  const primaryColor = cfg.basic?.primaryColor || '#ff6b3d';

  return (
    <PortalLayoutProvider>
      <div
        className="portal-root"
        style={
          {
            '--portal-primary': primaryColor,
            '--ant-color-primary': primaryColor,
          } as CSSProperties
        }
      >
        <PortalHeader />
        <main>{children}</main>
        <PortalStickyNav />
        <PortalFooter />
      </div>
    </PortalLayoutProvider>
  );
}
