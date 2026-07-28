'use client';

import { useEffect, useRef } from 'react';
import { PortalNav } from '@/components/PortalNav';
import styles from './index.module.scss';

export function PortalStickyNav({ siteName }: { siteName: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const isVisible = useRef(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    lastScrollY.current = window.scrollY;
    // footer 可见性由 IntersectionObserver 推送，避免每次 scroll 都 getBoundingClientRect 强制 layout
    let footerInView = false;

    const apply = (nextVisible: boolean) => {
      if (nextVisible === isVisible.current) return;
      isVisible.current = nextVisible;
      if (styles.visible) {
        el.classList.toggle(styles.visible, nextVisible);
      }
    };

    const footer = document.getElementById('site-footer');

    const recompute = () => {
      const currentScrollY = window.scrollY;
      const scrollingUp = currentScrollY < lastScrollY.current;
      const nextVisible = footerInView || currentScrollY === 0 || scrollingUp;
      apply(nextVisible);
      lastScrollY.current = currentScrollY;
    };
    const io = footer
      ? new IntersectionObserver(
          (entries) => {
            const entry = entries[0];
            if (!entry) return;
            footerInView = entry.isIntersecting;
            recompute();
          },
          { rootMargin: '120px 0px', threshold: 0 },
        )
      : null;
    io?.observe(footer as Element);

    // 初始状态：footer 通常不在视口，nav 应该展开
    apply(true);

    // scroll 用 rAF 节流，每帧最多触发一次
    let rafId = 0;
    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        recompute();
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      io?.disconnect();
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <PortalNav siteName={siteName} />
    </div>
  );
}
