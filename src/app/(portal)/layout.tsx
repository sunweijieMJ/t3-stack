import type { CSSProperties } from 'react';
import { DEFAULT_PRIMARY_COLOR } from '@/constants/frontend-config';
// reset 仅在 portal 子树生效，避免影响 admin 子树的 AntD 组件默认样式
import '@unocss/reset/tailwind.css';
import { PortalFooter } from '@/components/PortalFooter';
import { PortalHeader } from '@/components/PortalHeader';
import { PortalStickyNav } from '@/components/PortalStickyNav';
import { pickI18nText } from '@/lib/i18n-text';
import { resolveNavItems } from '@/lib/nav-items';
import { getDefaultLang, getFrontendConfig } from '@/server/services/config';

// portal 整体走 ISR：所有页面继承 60s revalidate（admin 改完最坏 60s 见效）。
// 单个页面如需更激进的缓存可在自己的 page.tsx 覆写 revalidate。
export const revalidate = 60;

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [cfg, lang] = await Promise.all([
    getFrontendConfig(),
    getDefaultLang(),
  ]);
  const primaryColor = cfg.basic?.primaryColor || DEFAULT_PRIMARY_COLOR;
  // Header / StickyNav 是客户端组件，读不到服务端配置，所以在这里解析好再按 props 注入。
  // 之前两处都硬编码 'Site'，后台「门户设置」里的站点标题与 Logo 改了没有任何反应。
  const siteName = pickI18nText(cfg.basic?.systemTitle, lang, 'Site');
  const logoImage = cfg.basic?.logoImage || undefined;
  // 在服务端过滤：导航项由管理员自由填写，会直接进 <a href>，
  // 不安全的协议在这里就丢掉，客户端组件拿到的已经是可信列表。
  const navItems = resolveNavItems(cfg.nav?.items);

  return (
    <div
      className="portal-root"
      style={
        {
          '--portal-primary': primaryColor,
          '--ant-color-primary': primaryColor,
        } as CSSProperties
      }
    >
      <PortalHeader logoImage={logoImage} siteName={siteName} />
      <main>{children}</main>
      <PortalStickyNav navItems={navItems} siteName={siteName} />
      <PortalFooter />
    </div>
  );
}
