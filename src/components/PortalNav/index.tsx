'use client';

import Link from 'next/link';
import styles from './index.module.scss';

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
      {/* 导航项列表暂时为空（门户只有首页一个页面），故不渲染 <nav>。
          加页面时在这里放 .navList / .navItem，样式已在 scss 里备好。 */}
    </div>
  );
}
