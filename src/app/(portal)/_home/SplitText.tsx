'use client';

import { motion, useReducedMotion } from 'framer-motion';
import styles from './index.module.scss';

interface SplitTextProps {
  text: string;
  /** 首字延迟（秒） */
  delay?: number;
  /** 逐字间隔（秒） */
  step?: number;
  className?: string;
  /** true 时进入视口才播放，否则挂载即播放（KV 用） */
  inView?: boolean;
}

const EASE = [0.3, 0.26, 0.38, 1] as const;

/**
 * 逐字入场：每个字符绕 X 轴从下方翻起。
 * 拆分后的字符对读屏无意义，故整体用一个 sr-only 文本承载语义，
 * 可见字符全部 aria-hidden。
 */
export function SplitText({
  text,
  delay = 0,
  step = 0.03,
  className,
  inView = false,
}: SplitTextProps) {
  const reduced = useReducedMotion();
  const chars = [...text];

  if (reduced) {
    return <span className={className}>{text}</span>;
  }

  const motionProps = (i: number) => {
    const transition = { duration: 0.7, delay: delay + i * step, ease: EASE };
    return inView
      ? ({
          initial: { opacity: 0, y: '0.75em', rotateX: -75 },
          transition,
          viewport: { once: true, amount: 0.6 },
          whileInView: { opacity: 1, y: 0, rotateX: 0 },
        } as const)
      : ({
          animate: { opacity: 1, y: 0, rotateX: 0 },
          initial: { opacity: 0, y: '0.75em', rotateX: -75 },
          transition,
        } as const);
  };

  return (
    <span className={`${styles.split} ${className ?? ''}`}>
      <span className={styles.srOnly}>{text}</span>
      <span aria-hidden="true" className={styles.splitInner}>
        {chars.map((char, i) => (
          <motion.span
            className={styles.splitChar}
            key={`${char}-${i}`}
            {...motionProps(i)}
          >
            {char === ' ' ? ' ' : char}
          </motion.span>
        ))}
      </span>
    </span>
  );
}

/**
 * 按行淡入的段落组：中文正文以「行」为单位推进，
 * 避免逐字动画在长句上显得聒噪。
 */
export function FadeLines({
  lines,
  className,
  delay = 0,
  step = 0.08,
}: {
  lines: string[];
  className?: string;
  delay?: number;
  step?: number;
}) {
  const reduced = useReducedMotion();

  return (
    <span className={className}>
      {lines.map((line, i) => (
        <motion.span
          className={styles.fadeLine}
          initial={reduced ? undefined : { opacity: 0, y: 14 }}
          key={line}
          transition={{ duration: 0.8, delay: delay + i * step, ease: EASE }}
          viewport={{ once: true, amount: 0.5 }}
          whileInView={reduced ? undefined : { opacity: 1, y: 0 }}
        >
          {line}
        </motion.span>
      ))}
    </span>
  );
}
