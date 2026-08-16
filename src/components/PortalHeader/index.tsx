'use client';

import { useEffect, useState } from 'react';
import styles from './index.module.scss';

// 与 index.module.scss 中 .header 的 height 保持一致
const HEADER_H = 60;

interface PortalHeaderProps {
  /** 站点名，来自 basic.systemTitle（由 portal layout 在服务端解析后注入） */
  siteName: string;
  /** 站点 Logo，来自 basic.logoImage；未配置时退化为纯文字站点名 */
  logoImage?: string;
}

export function PortalHeader({ siteName, logoImage }: PortalHeaderProps) {
  // 区块用 data-portal-theme 声明自身明暗，header 据此反色（透明浮在内容上）。
  // 未声明的页面沿用 dark（白字），与深色首屏一致。
  const [tone, setTone] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const sections = () =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-portal-theme]'));

    // 没有任何标记区块时必须回落到 light，不能直接 return。
    // 直接 return 会让 tone 停在初始的 'dark'（.header 是 color:#fff），而
    // data-portal-theme 目前只有首页在用 —— /content/*、/no-access 都是浅色底，
    // 结果是顶栏站点名白字压白底，肉眼完全看不见（配了 logoImage 才勉强可见，
    // 因为那时渲染的是图片，文字只在 alt 里）。
    // 兜底放在这里而不是去各个页面补 data-portal-theme：后者等于要求每个新增的
    // 门户页都记得加一个属性，漏了就又是一次「无人报错的不可见」。深色首屏是首页的特例。
    if (sections().length === 0) {
      setTone('light');
      return;
    }

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
      {/* 右侧功能区：目前门户没有任何对外入口，保留容器与下面的登录/登出实现，
          将来要放导航或登录按钮时直接往里填。 */}
      <div className={styles.menu}>
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
