'use client';

import Link from 'next/link';
import styles from './index.module.scss';

const NAV_LINKS: { label: string; href: string }[] = [];

interface PortalNavProps {
  className?: string;
  /** 站点名，来自 basic.systemTitle（由 portal layout 在服务端解析后注入） */
  siteName: string;
}

export function PortalNav({ className, siteName }: PortalNavProps) {
  return (
    <div className={`${styles.nav} ${className ?? ''}`}>
      <Link className={styles.logoLink} href="/">
        {siteName}
      </Link>
      <nav className={styles.navList}>
        {NAV_LINKS.map((link) => (
          <Link className={styles.navItem} href={link.href} key={link.label}>
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
