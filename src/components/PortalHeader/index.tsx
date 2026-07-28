'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePortalLayout } from '@/context/portal-layout-context';
import styles from './index.module.scss';

const UTILITY_LINKS: { label: string; href: string }[] = [];

// 与 index.module.scss 中 .header 的 height 保持一致
const HEADER_H = 60;

interface PortalHeaderProps {
  /** 站点名，来自 basic.systemTitle（由 portal layout 在服务端解析后注入） */
  siteName: string;
  /** 站点 Logo，来自 basic.logoImage；未配置时退化为纯文字站点名 */
  logoImage?: string;
}

export function PortalHeader({ siteName, logoImage }: PortalHeaderProps) {
  const { layoutVisible } = usePortalLayout();
  // 区块用 data-portal-theme 声明自身明暗，header 据此反色（透明浮在内容上）。
  // 未声明的页面沿用 dark（白字），与深色首屏一致。
  const [tone, setTone] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const sections = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-portal-theme]'));
    if (sections().length === 0) return;

    let io: IntersectionObserver | null = null;

    // rootMargin 把观察根压成 header 下沿的 1px 横带：任一时刻只有 header
    // 正下方那个区块命中，省掉逐帧 getBoundingClientRect 造成的强制 layout。
    // 横带高度依赖视口高，故 resize 后需重建。
    const build = () => {
      io?.disconnect();
      const bottom = Math.max(0, window.innerHeight - HEADER_H - 1);
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const next = entry.target.getAttribute('data-portal-theme');
            if (next === 'light' || next === 'dark') setTone(next);
          }
        },
        { rootMargin: `-${HEADER_H}px 0px -${bottom}px 0px`, threshold: 0 },
      );
      for (const el of sections()) io.observe(el);
    };

    build();
    window.addEventListener('resize', build);
    return () => {
      window.removeEventListener('resize', build);
      io?.disconnect();
    };
  }, []);

  if (!layoutVisible.header) return null;

  return (
    <div
      className={`${styles.header} ${tone === 'light' ? styles.headerLight : ''}`}
    >
      <span className={styles.logo}>
        {logoImage ? (
          <img alt={siteName} className={styles.logoImg} src={logoImage} />
        ) : (
          siteName
        )}
      </span>
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
