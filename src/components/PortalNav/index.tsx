'use client';

import Link from 'next/link';
import type { NavItem } from '@/lib/nav-items';
import styles from './index.module.scss';

interface PortalNavProps {
  className?: string;
  /** 站点名，来自 basic.systemTitle（由 portal layout 在服务端解析后注入） */
  siteName: string;
  /** 导航项，已由 portal layout 过滤掉不安全链接（见 lib/nav-items） */
  items?: NavItem[];
}

export function PortalNav({ className, siteName, items = [] }: PortalNavProps) {
  return (
    <div className={`${styles.nav} ${className ?? ''}`}>
      <Link className={styles.logoLink} href="/">
        {siteName}
      </Link>
      {items.length > 0 && (
        <nav className={styles.navList}>
          {items.map((item) => (
            <Link className={styles.navItem} href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
