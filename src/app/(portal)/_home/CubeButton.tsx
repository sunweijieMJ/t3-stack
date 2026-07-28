'use client';

import styles from './index.module.scss';

interface CubeButtonProps {
  /** 正面文案（英文小标签） */
  en: string;
  /** 正面主文案 */
  label: string;
  /** 悬停翻转后露出的文案，默认复用 label */
  backLabel?: string;
  /** 尺寸变体：块状（快捷入口）或胶囊（CTA） */
  variant?: 'block' | 'pill';
  onClick?: () => void;
}

/**
 * CSS 3D 立方体按钮 —— 参考站的标志性交互：
 * 悬停时整体绕 X 轴翻转 90°，底面（绿↔白反色）转到正面。
 * 只渲染「正面 + 顶面」两个面，容器自身铺绿色作为侧壁，
 * 翻转过程中不会露出穿帮的透明缝隙。
 */
export function CubeButton({
  en,
  label,
  backLabel,
  variant = 'block',
  onClick,
}: CubeButtonProps) {
  const back = backLabel ?? label;

  return (
    <button
      className={`${styles.cube} ${variant === 'pill' ? styles.cubePill : ''}`}
      onClick={onClick}
      type="button"
    >
      <span className={styles.cubeInner}>
        <span className={`${styles.cubeFace} ${styles.cubeFaceFront}`}>
          <span className={styles.cubeEn}>{en}</span>
          <span className={styles.cubeLabel}>{label}</span>
        </span>
        <span className={`${styles.cubeFace} ${styles.cubeFaceTop}`}>
          <span className={styles.cubeEn}>{en}</span>
          <span className={styles.cubeLabel}>
            {back}
            <span className={styles.cubeArrow}>→</span>
          </span>
        </span>
      </span>
    </button>
  );
}
