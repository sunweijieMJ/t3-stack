'use client';

import { motion, useReducedMotion } from 'framer-motion';
import styles from './signin.module.scss';

// 与门户首页同一条缓动曲线（_home/index.module.scss 的 $ease），保持系列感
const EASE = [0.3, 0.26, 0.38, 1] as const;

/**
 * 逐字入场标题。
 *
 * 与 (portal)/_home/SplitText 是同一个视觉效果，但没有复用那份实现：
 * _home 是下划线开头的页面私有目录，且它的 SplitText 依赖 _home/index.module.scss
 * 里的类名。跨页面 import 会把登录页焊死在首页的样式表上，改首页排版就可能崩登录页。
 * 这里保留一份很短的自持实现，边界更干净。
 *
 * 拆开的单字对读屏没有意义，故整体语义由 .srOnly 承载，可见字符全部 aria-hidden。
 */
export function SplitText({
  text,
  delay = 0,
  step = 0.035,
  className,
}: {
  text: string;
  delay?: number;
  step?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();

  if (reduced) return <span className={className}>{text}</span>;

  return (
    <span className={`${styles.split} ${className ?? ''}`}>
      <span className={styles.srOnly}>{text}</span>
      <span aria-hidden="true">
        {[...text].map((char, i) => (
          <motion.span
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            className={styles.splitChar}
            initial={{ opacity: 0, y: '0.7em', rotateX: -70 }}
            key={`${char}-${i}`}
            transition={{ duration: 0.7, delay: delay + i * step, ease: EASE }}
          >
            {char === ' ' ? ' ' : char}
          </motion.span>
        ))}
      </span>
    </span>
  );
}

/** 三团缓慢漂移的极光光斑。位移幅度刻意压得很小，是背景而不是主角。 */
function Blobs() {
  const reduced = useReducedMotion();

  // 减少动态效果时保留静态光斑（它承担了整页的色彩层次），只是不再漂移
  const drift = (x: number[], y: number[], duration: number) =>
    reduced
      ? undefined
      : {
          animate: { x, y },
          transition: {
            duration,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: 'mirror' as const,
            ease: 'easeInOut' as const,
          },
        };

  return (
    <div className={styles.aurora}>
      <motion.div
        className={`${styles.blob} ${styles.blobA}`}
        {...drift([0, 60, -30], [0, -40, 30], 18)}
      />
      <motion.div
        className={`${styles.blob} ${styles.blobB}`}
        {...drift([0, -70, 20], [0, 30, -40], 24)}
      />
      <motion.div
        className={`${styles.blob} ${styles.blobC}`}
        {...drift([0, 50, -60], [0, 60, 20], 21)}
      />
    </div>
  );
}

interface AtmosphereProps {
  /** 站点名，来自 basic.systemTitle（服务端解析后注入） */
  siteName: string;
}

/**
 * 登录页左侧氛围区：极光 + 细网格 + 胶片颗粒 + 逐字标题。
 * 纯装饰，不含任何交互，窄屏下退化为顶部横幅（见 scss 的媒体查询）。
 */
export function Atmosphere({ siteName }: AtmosphereProps) {
  const reduced = useReducedMotion();
  const fade = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.8, delay, ease: EASE },
        };

  return (
    <section className={styles.stage}>
      <Blobs />
      <div className={styles.grid} />
      <div className={styles.noise} />

      <motion.a className={styles.brand} href="/" {...fade(0.1)}>
        <span className={styles.brandMark} />
        <span className={styles.brandName}>{siteName}</span>
      </motion.a>

      <div className={styles.stageBody}>
        <h2 className={styles.headline}>
          <SplitText delay={0.25} text="Welcome" />
          <span className={styles.headlineAccent}>
            <SplitText delay={0.45} text="back." />
          </span>
        </h2>
        <motion.p className={styles.tagline} {...fade(0.95)}>
          验证身份后即可进入控制台，管理站点配置、用户与审计日志。
        </motion.p>
      </div>

      <motion.div className={styles.stageFoot} {...fade(1.15)}>
        {/* 不要在这里放 new Date()：服务端与浏览器时区不同会在跨年那一刻
            渲染出不同的年份，触发 hydration mismatch。 */}
        <span>Secure Access</span>
        <span>·</span>
        <span>Console</span>
      </motion.div>
    </section>
  );
}
