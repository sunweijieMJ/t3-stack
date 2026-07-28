'use client';

import { useEffect, useState } from 'react';
import { SCENE_RAIL } from './data';
import styles from './index.module.scss';

/**
 * 右侧场景导航条 —— 参考站的 scene-indicator：
 * 一根细竖线 + 编号刻度 + 竖排的当前章节名。
 * 用 rootMargin: -50% 0 -50% 把观察根压成视口中线，
 * 保证任一时刻只有一个 section 命中，省掉 ratio 比较。
 */
export function SceneRail() {
  const [active, setActive] = useState('');

  useEffect(() => {
    const els = SCENE_RAIL.map((item) => document.getElementById(item.id))
      // 章节尚未挂载时跳过，避免 observe(null)
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    // 记录当前跨过中线的 section：章节区之外（数字/人物/新闻/CTA）没有任何命中，
    // 此时清空 active，导航条整体淡出——否则会一直停在「05 People」上误导读者，
    // 且 difference 混合模式落到绿色 CTA 上会泛出洋红。
    const hit = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) hit.add(entry.target.id);
          else hit.delete(entry.target.id);
        }
        setActive(hit.size > 0 ? ([...hit].at(-1) ?? '') : '');
      },
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    );
    for (const el of els) io.observe(el);
    return () => io.disconnect();
  }, []);

  const current = SCENE_RAIL.find((item) => item.id === active);

  return (
    <nav
      aria-label="章节导航"
      className={`${styles.rail} ${current ? styles.railOn : ''}`}
    >
      <span className={styles.railName}>{current?.label ?? ''}</span>
      <ol className={styles.railList}>
        {SCENE_RAIL.map((item) => (
          <li key={item.id}>
            <button
              aria-current={item.id === active ? 'true' : undefined}
              className={`${styles.railDot} ${
                item.id === active ? styles.railDotOn : ''
              }`}
              onClick={() => {
                document
                  .getElementById(item.id)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              type="button"
            >
              <span className={styles.srOnly}>{item.label}</span>
              <span className={styles.railNo}>{item.no}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
