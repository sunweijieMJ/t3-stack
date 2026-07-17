'use client';

import Link from 'next/link';
import { usePortalLayout } from '@/context/portal-layout-context';
import styles from './index.module.scss';

const UTILITY_LINKS: { label: string; href: string }[] = [];

export function PortalHeader() {
  const { layoutVisible } = usePortalLayout();

  if (!layoutVisible.header) return null;

  return (
    <div className={styles.header}>
      <span className={styles.logo}>Site</span>
      <div className={styles.menu}>
        {UTILITY_LINKS.map((link) => (
          <Link className={styles.link} href={link.href} key={link.label}>
            {link.label}
          </Link>
        ))}
        {/* {session?.user ? (
          <button
            className={styles.authBtn}
            onClick={() =>
              authClient.signOut({
                fetchOptions: {
                  onSuccess: () => {
                    window.location.href = '/';
                  },
                },
              })
            }
            type="button"
          >
            SIGN OUT
          </button>
        ) : (
          <Link className={styles.link} href="/signin">
            LOGIN
          </Link>
        )} */}
      </div>
    </div>
  );
}
