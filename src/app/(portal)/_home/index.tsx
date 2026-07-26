'use client';

import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import styles from './index.module.scss';

// 3D 场景仅在客户端加载（Three.js 依赖 WebGL，禁用 SSR），
// 加载前用 CSS 渐变兜底，避免首屏空白。
const Scene = dynamic(() => import('./Scene'), {
  ssr: false,
  loading: () => null,
});

// ==================== 门户数据（骨架示例，后续可接后台配置） ====================

const STATS = [
  { value: 1921, suffix: '', label: '建校年份' },
  { value: 32, suffix: '个', label: '学院与学部' },
  { value: 48000, suffix: '+', label: '在校师生' },
  { value: 156, suffix: '个', label: '重点学科' },
];

const SCHOOLS = [
  {
    name: '信息科学与技术学院',
    en: 'Information Science & Technology',
    icon: '◈',
  },
  { name: '经济与管理学院', en: 'Economics & Management', icon: '◇' },
  { name: '人文社会科学学院', en: 'Humanities & Social Sciences', icon: '❖' },
  { name: '生命科学学院', en: 'Life Sciences', icon: '✦' },
  { name: '材料与化学工程学院', en: 'Materials & Chemical Eng.', icon: '⬡' },
  { name: '医学院', en: 'School of Medicine', icon: '✚' },
];

const NEWS = [
  {
    tag: '科研',
    date: '2026-07-18',
    title: '我校科研团队在量子计算领域取得突破性进展，成果登上顶级期刊',
  },
  {
    tag: '招生',
    date: '2026-07-15',
    title: '2026 年本科招生录取工作全面启动，新增三个交叉学科专业',
  },
  {
    tag: '合作',
    date: '2026-07-10',
    title: '学校与多家龙头企业共建产学研创新联合体，推动成果转化',
  },
  {
    tag: '校园',
    date: '2026-07-05',
    title: '2026 年毕业典礼隆重举行，逾万名学子踏上人生新征程',
  },
];

const QUICK_LINKS = [
  { label: '本科招生', icon: '🎓' },
  { label: '研究生院', icon: '📚' },
  { label: '科学研究', icon: '🔬' },
  { label: '国际交流', icon: '🌐' },
  { label: '图书馆', icon: '📖' },
  { label: '就业服务', icon: '💼' },
];

// ==================== 数字滚动动画 Hook ====================

// 元素进入视口后，从 0 缓动到目标值（easeOutExpo），只跑一次。
function useCountUp(target: number, run: boolean, duration = 1800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // easeOutExpo：t===1 需特判返回 1，否则 2^(-10) 余项会让数字停在目标值差一点
      // （如 1921 停在 1919），达不到精确目标。
      const eased = t === 1 ? 1 : 1 - 2 ** (-10 * t);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, duration]);
  return value;
}

function StatItem({
  value,
  suffix,
  label,
  run,
}: {
  value: number;
  suffix: string;
  label: string;
  run: boolean;
}) {
  const display = useCountUp(value, run);
  return (
    <div className={styles.statItem}>
      <div className={styles.statValue}>
        {display.toLocaleString('en-US')}
        <span className={styles.statSuffix}>{suffix}</span>
      </div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

// ==================== 首页 ====================

export default function HomeView() {
  const [statsRun, setStatsRun] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  // 统计区进入视口时触发数字滚动
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStatsRun(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className={styles.page}>
      {/* ============ HERO ============ */}
      <section className={styles.hero}>
        <div className={styles.canvasWrap}>
          <Scene />
        </div>
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={styles.badge}
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
          >
            双一流 · 综合性研究型大学
          </motion.div>
          <motion.h1
            animate={{ opacity: 1, y: 0 }}
            className={styles.heroTitle}
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            探索知识边界
            <br />
            <span className={styles.heroTitleAccent}>塑造未来世界</span>
          </motion.h1>
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className={styles.heroSubtitle}
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.7, delay: 0.25 }}
          >
            百年学府，以卓越之教育与前沿之科研，
            <br />
            汇聚天下英才，共赴星辰大海。
          </motion.p>
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={styles.heroActions}
            initial={{ opacity: 0, y: 30 }}
            transition={{ duration: 0.7, delay: 0.4 }}
          >
            <button className={styles.btnPrimary} type="button">
              了解招生 <span>→</span>
            </button>
            <button className={styles.btnGhost} type="button">
              虚拟校园漫游
            </button>
          </motion.div>
        </div>
        <div className={styles.scrollHint}>
          <span className={styles.scrollDot} />
          向下滚动探索
        </div>
      </section>

      {/* ============ 数据统计 ============ */}
      <section className={styles.stats} ref={statsRef}>
        <div className={styles.statsInner}>
          {STATS.map((s) => (
            <StatItem
              key={s.label}
              label={s.label}
              run={statsRun}
              suffix={s.suffix}
              value={s.value}
            />
          ))}
        </div>
      </section>

      {/* ============ 学院与学科 ============ */}
      <section className={styles.section}>
        <SectionHeader
          desc="覆盖理、工、医、文、经、管等多学科门类，构建交叉融合的育人体系。"
          en="Schools & Disciplines"
          title="学院与学科"
        />
        <div className={styles.schoolGrid}>
          {SCHOOLS.map((s, i) => (
            <motion.div
              className={styles.schoolCard}
              initial={{ opacity: 0, y: 40 }}
              key={s.name}
              transition={{ duration: 0.5, delay: (i % 3) * 0.1 }}
              viewport={{ once: true, amount: 0.3 }}
              whileInView={{ opacity: 1, y: 0 }}
            >
              <span className={styles.schoolIcon}>{s.icon}</span>
              <h3 className={styles.schoolName}>{s.name}</h3>
              <p className={styles.schoolEn}>{s.en}</p>
              <span className={styles.schoolArrow}>→</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ============ 新闻资讯 ============ */}
      <section className={`${styles.section} ${styles.sectionDark}`}>
        <SectionHeader
          desc="聚焦校园动态，传递学术前沿与人文温度。"
          en="News & Events"
          title="新闻资讯"
        />
        <div className={styles.newsList}>
          {NEWS.map((n, i) => (
            <motion.button
              className={styles.newsItem}
              initial={{ opacity: 0, x: -30 }}
              key={n.title}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              type="button"
              viewport={{ once: true, amount: 0.4 }}
              whileInView={{ opacity: 1, x: 0 }}
            >
              <span className={styles.newsTag}>{n.tag}</span>
              <span className={styles.newsTitle}>{n.title}</span>
              <span className={styles.newsDate}>{n.date}</span>
            </motion.button>
          ))}
        </div>
      </section>

      {/* ============ 快速入口 ============ */}
      <section className={styles.section}>
        <SectionHeader
          desc="常用服务一键直达。"
          en="Quick Access"
          title="快速入口"
        />
        <div className={styles.linkGrid}>
          {QUICK_LINKS.map((l, i) => (
            <motion.button
              className={styles.linkCard}
              initial={{ opacity: 0, scale: 0.9 }}
              key={l.label}
              transition={{ duration: 0.4, delay: (i % 6) * 0.06 }}
              type="button"
              viewport={{ once: true, amount: 0.3 }}
              whileInView={{ opacity: 1, scale: 1 }}
            >
              <span className={styles.linkIcon}>{l.icon}</span>
              <span className={styles.linkLabel}>{l.label}</span>
            </motion.button>
          ))}
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className={styles.cta}>
        <motion.div
          className={styles.ctaInner}
          initial={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.7 }}
          viewport={{ once: true, amount: 0.4 }}
          whileInView={{ opacity: 1, y: 0 }}
        >
          <h2 className={styles.ctaTitle}>与卓越同行，从这里启程</h2>
          <p className={styles.ctaDesc}>
            无论你是求学者、研究者还是合作伙伴，我们都期待与你相遇。
          </p>
          <button className={styles.btnPrimary} type="button">
            立即申请 <span>→</span>
          </button>
        </motion.div>
      </section>
    </div>
  );
}

// ==================== 通用区块标题 ====================

function SectionHeader({
  title,
  en,
  desc,
}: {
  title: string;
  en: string;
  desc: string;
}) {
  return (
    <motion.div
      className={styles.sectionHeader}
      initial={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.6 }}
      viewport={{ once: true, amount: 0.6 }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      <span className={styles.sectionEn}>{en}</span>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p className={styles.sectionDesc}>{desc}</p>
    </motion.div>
  );
}
