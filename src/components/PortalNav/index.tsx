'use client';

import Link from 'next/link';
import styles from './index.module.scss';

const NAV_LINKS: { label: string; href: string }[] = [];

interface PortalNavProps {
  className?: string;
}

export function PortalNav({ className }: PortalNavProps) {
  return (
    <div className={`${styles.nav} ${className ?? ''}`}>
      <Link className={styles.logoLink} href="/">
        Site
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
