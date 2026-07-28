'use client';

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChapterFigure } from './ChapterFigure';
import { CubeButton } from './CubeButton';
import {
  CHAPTERS,
  type Chapter,
  NEWS,
  QUICK_LINKS,
  STATS,
  type Stat,
  SWITCH_SCENES,
  VOICES,
} from './data';
import styles from './index.module.scss';
import { SceneRail } from './SceneRail';
import { FadeLines, SplitText } from './SplitText';

// 3D 场景仅在客户端加载（Three.js 依赖 WebGL，禁用 SSR），
// 加载前由 KV 自身的深色底兜底，避免首屏空白。
const Scene = dynamic(() => import('./Scene'), {
  ssr: false,
  loading: () => null,
});

const EASE = [0.3, 0.26, 0.38, 1] as const;

// ==================== 通用区块标题 ====================

/** ( Section / Name ) 形式的括号小标签 */
function Label({ children, tone }: { children: string; tone?: 'light' }) {
  return (
    <motion.span
      className={`${styles.label} ${tone === 'light' ? styles.labelLight : ''}`}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      viewport={{ once: true, amount: 0.8 }}
      whileInView={{ opacity: 1 }}
    >
      <span className={styles.labelBracket}>(</span>
      {children}
      <span className={styles.labelBracket}>)</span>
    </motion.span>
  );
}

// ==================== KV ====================

function KeyVisual() {
  return (
    <section className={styles.kv} data-portal-theme="dark">
      <div className={styles.kvCanvas}>
        <Scene />
      </div>
      <div className={styles.kvVeil} />

      <div className={styles.kvInner}>
        <div className={styles.kvKeywords}>
          <motion.span
            animate={{ opacity: 1 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 1, delay: 1.4 }}
          >
            National Research University
          </motion.span>
          <motion.span
            animate={{ opacity: 1 }}
            initial={{ opacity: 0 }}
            transition={{ duration: 1, delay: 1.5 }}
          >
            Founded 1921
          </motion.span>
        </div>

        <h1 className={styles.kvCopy}>
          <span className={styles.kvLine}>
            <SplitText delay={0.35} text="Cultivate Minds," />
          </span>
          <motion.span
            animate={{ opacity: 1, scaleX: 1 }}
            className={styles.kvBracket}
            initial={{ opacity: 0, scaleX: 0.6 }}
            transition={{ duration: 1.1, delay: 0.9, ease: EASE }}
          >
            <span>(</span>
            <span>)</span>
          </motion.span>
          <span className={styles.kvLine}>
            <SplitText delay={0.75} text="Shape Tomorrow" />
          </span>
          <motion.span
            animate={{ opacity: 1, y: 0 }}
            className={styles.kvJa}
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 1, delay: 1.35, ease: EASE }}
          >
            成为你自己，从这里开始。
          </motion.span>
        </h1>

        <motion.div
          animate={{ opacity: 1 }}
          className={styles.kvFoot}
          initial={{ opacity: 0 }}
          transition={{ duration: 1, delay: 1.7 }}
        >
          <span className={styles.kvScrollWord}>Scroll</span>
          <span className={styles.kvScrollLine} />
        </motion.div>
      </div>
    </section>
  );
}

// ==================== 引子 ====================

function Introduction() {
  return (
    <section
      className={styles.intro}
      data-portal-theme="light"
      id="introduction"
    >
      <div className={styles.introInner}>
        <Label>Introduction</Label>
        <p className={styles.introLead}>
          <FadeLines
            lines={['一所大学真正的边界，', '不在围墙，而在提问的深度。']}
          />
        </p>
        <p className={styles.introBody}>
          <FadeLines
            delay={0.15}
            lines={[
              '自 1921 年建校起，我们始终相信教育是一件慢事——',
              '它需要一代人把答案交给下一代人，再由下一代人推翻重来。',
              '一百余年过去，校园里换了几轮银杏，',
              '唯有对未知的好奇，从未改变。',
            ]}
          />
        </p>
      </div>
    </section>
  );
}

// ==================== 章节（滚动固定） ====================

function ChapterSection({
  chapter,
  index,
}: {
  chapter: Chapter;
  index: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  // 进入视口下半段淡入、离开上半段淡出，形成参考站「一章一屏」的推进感
  const opacity = useTransform(
    scrollYProgress,
    [0, 0.22, 0.72, 0.94],
    [0, 1, 1, 0],
  );
  const y = useTransform(scrollYProgress, [0, 1], [56, -56]);
  const scale = useTransform(scrollYProgress, [0, 1], [1.06, 0.96]);

  return (
    <section
      className={styles.chapter}
      data-portal-theme="light"
      id={chapter.id}
      ref={ref}
    >
      <motion.div
        className={styles.chapterSticky}
        style={reduced ? undefined : { opacity, y }}
      >
        <motion.div
          className={styles.chapterFigureWrap}
          style={reduced ? undefined : { scale }}
        >
          <ChapterFigure index={index} />
        </motion.div>

        <div className={styles.chapterText}>
          <span className={styles.chapterNo}>Chapter {chapter.no}</span>
          <h2 className={styles.chapterTitle}>
            <FadeLines lines={chapter.title} step={0.12} />
            {chapter.keyword ? (
              <motion.span
                className={styles.chapterKeyword}
                initial={{ opacity: 0, y: 14 }}
                transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
                viewport={{ once: true, amount: 0.5 }}
                whileInView={{ opacity: 1, y: 0 }}
              >
                {chapter.keyword}
              </motion.span>
            ) : null}
          </h2>
          <Label>{chapter.label}</Label>
          <p className={styles.chapterBody}>
            <FadeLines delay={0.2} lines={chapter.body} />
          </p>
        </div>
      </motion.div>
    </section>
  );
}

// ==================== 数字 ====================

// 元素进入视口后，从 0 缓动到目标值（easeOutExpo），只跑一次。
function useCountUp(target: number, run: boolean, duration = 1800) {
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!run) return;
    if (reduced) {
      setValue(target);
      return;
    }
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
  }, [target, run, duration, reduced]);

  return value;
}

function StatItem({ stat, run }: { stat: Stat; run: boolean }) {
  const display = useCountUp(stat.value, run);

  return (
    <div className={styles.statItem}>
      <span className={styles.statEn}>{stat.en}</span>
      <span className={styles.statValue}>
        {display.toLocaleString('en-US')}
        <span className={styles.statSuffix}>{stat.suffix}</span>
      </span>
      <span className={styles.statLabel}>{stat.label}</span>
    </div>
  );
}

function Numbers() {
  const [run, setRun] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setRun(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className={styles.numbers} data-portal-theme="dark">
      <div className={styles.numbersInner} ref={ref}>
        <Label tone="light">By the Numbers</Label>
        <div className={styles.statGrid}>
          {STATS.map((stat) => (
            <StatItem key={stat.label} run={run} stat={stat} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ==================== 人物 ====================

function Voices() {
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  // 单卡步进 = 卡片宽度 + 列间距，避免把 gap 写死在两处
  const step = useCallback(() => {
    const el = scroller.current;
    const first = el?.firstElementChild;
    if (!el || !(first instanceof HTMLElement)) return 0;
    const gap = Number.parseFloat(getComputedStyle(el).columnGap) || 0;
    return first.offsetWidth + gap;
  }, []);

  const go = (dir: -1 | 1) => {
    const el = scroller.current;
    const size = step();
    if (!el || size === 0) return;
    el.scrollBy({ left: dir * size, behavior: 'smooth' });
  };

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const size = step();
        if (size === 0) return;
        setIndex(
          Math.min(
            VOICES.length - 1,
            Math.max(0, Math.round(el.scrollLeft / size)),
          ),
        );
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [step]);

  return (
    <section className={styles.voices} data-portal-theme="light">
      <div className={styles.voicesHead}>
        <div>
          <Label>Voices</Label>
          <h2 className={styles.sectionTitle}>在这里的人，这样讲述这里。</h2>
        </div>
        <div className={styles.voicesNav}>
          <span className={styles.voicesCount}>
            {String(index + 1).padStart(2, '0')}
            <span className={styles.voicesCountTotal}>
              {' / '}
              {String(VOICES.length).padStart(2, '0')}
            </span>
          </span>
          <button
            aria-label="上一位"
            className={styles.voicesArrow}
            disabled={index === 0}
            onClick={() => go(-1)}
            type="button"
          >
            ←
          </button>
          <button
            aria-label="下一位"
            className={styles.voicesArrow}
            disabled={index === VOICES.length - 1}
            onClick={() => go(1)}
            type="button"
          >
            →
          </button>
        </div>
      </div>

      <div className={styles.voicesRail} ref={scroller}>
        {VOICES.map((voice) => (
          <article className={styles.voiceCard} key={voice.no}>
            <span className={styles.voiceVol}>
              Vol.<span className={styles.voiceVolNo}>{voice.no}</span>
            </span>
            <p className={styles.voiceQuote}>{voice.quote}</p>
            <div className={styles.voiceMeta}>
              <span className={styles.voiceNameEn}>{voice.nameEn}</span>
              <span className={styles.voiceName}>{voice.name}</span>
              <span className={styles.voiceRole}>{voice.role}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

// ==================== ON / OFF 切换 ====================

function OnOff() {
  const [key, setKey] = useState<'learn' | 'live'>('learn');
  const scene = SWITCH_SCENES.find((s) => s.key === key) ?? SWITCH_SCENES[0];
  if (!scene) return null;

  return (
    <section className={styles.onoff} data-portal-theme="light">
      <div className={styles.onoffInner}>
        <Label>Campus / On &amp; Off</Label>
        <h2 className={styles.sectionTitle}>
          课业之内与之外，都是大学的一部分。
        </h2>

        <div className={styles.switchTrack} role="tablist">
          {SWITCH_SCENES.map((item) => (
            <button
              aria-selected={item.key === key}
              className={`${styles.switchBtn} ${
                item.key === key ? styles.switchBtnOn : ''
              }`}
              key={item.key}
              onClick={() => setKey(item.key)}
              role="tab"
              type="button"
            >
              {item.key === key ? (
                <motion.span
                  className={styles.switchPill}
                  layoutId="switch-pill"
                  transition={{ duration: 0.45, ease: EASE }}
                />
              ) : null}
              <span className={styles.switchState}>{item.state}</span>
              <span className={styles.switchLabel}>{item.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.ul
            animate={{ opacity: 1, y: 0 }}
            className={styles.onoffList}
            exit={{ opacity: 0, y: -16 }}
            initial={{ opacity: 0, y: 16 }}
            key={scene.key}
            transition={{ duration: 0.4, ease: EASE }}
          >
            {scene.items.map((item) => (
              <li className={styles.onoffItem} key={item.en}>
                <span className={styles.onoffEn}>{item.en}</span>
                <span className={styles.onoffTitle}>{item.title}</span>
                <span className={styles.onoffDesc}>{item.desc}</span>
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>
      </div>
    </section>
  );
}

// ==================== 新闻 ====================

function News() {
  return (
    <section className={styles.news} data-portal-theme="light">
      <div className={styles.newsHead}>
        <Label>News &amp; Topics</Label>
        <h2 className={styles.sectionTitle}>最近发生的事。</h2>
      </div>
      <ul className={styles.newsList}>
        {NEWS.map((item, i) => (
          <motion.li
            initial={{ opacity: 0, y: 20 }}
            key={item.title}
            transition={{ duration: 0.6, delay: (i % 5) * 0.06, ease: EASE }}
            viewport={{ once: true, amount: 0.6 }}
            whileInView={{ opacity: 1, y: 0 }}
          >
            <button className={styles.newsItem} type="button">
              <span className={styles.newsDate}>{item.date}</span>
              <span className={styles.newsCategory}>{item.category}</span>
              <span className={styles.newsTitle}>{item.title}</span>
              <span className={styles.newsArrow}>→</span>
            </button>
          </motion.li>
        ))}
      </ul>
      <div className={styles.newsMore}>
        <CubeButton en="Archive" label="查看全部" variant="pill" />
      </div>
    </section>
  );
}

// ==================== 首页 ====================

export default function HomeView() {
  return (
    <div className={styles.page}>
      <div className={styles.noise} />
      <SceneRail />

      <KeyVisual />
      <Introduction />

      {CHAPTERS.map((chapter, i) => (
        <ChapterSection chapter={chapter} index={i} key={chapter.id} />
      ))}

      <Numbers />
      <Voices />
      <OnOff />
      <News />

      {/* ============ 快速入口 ============ */}
      <section className={styles.access} data-portal-theme="dark">
        <div className={styles.accessInner}>
          <Label tone="light">Quick Access</Label>
          <h2 className={`${styles.sectionTitle} ${styles.sectionTitleLight}`}>
            常用服务，一步直达。
          </h2>
          <div className={styles.accessGrid}>
            {QUICK_LINKS.map((link) => (
              <CubeButton en={link.en} key={link.en} label={link.label} />
            ))}
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      {/* CTA 是绿底：墨色文字对比度 6.1:1，优于白色的 3.1:1，故按 light 处理 */}
      <section className={styles.cta} data-portal-theme="light">
        <div className={styles.ctaInner}>
          <span className={styles.ctaEn}>
            <SplitText inView step={0.035} text="Begin Here" />
          </span>
          <p className={styles.ctaCopy}>
            <FadeLines
              delay={0.2}
              lines={[
                '无论你是求学者、研究者',
                '还是同行者，',
                '我们都在这里等你。',
              ]}
            />
          </p>
          <CubeButton
            backLabel="现在就去"
            en="Admission"
            label="立即申请"
            variant="pill"
          />
        </div>
      </section>
    </div>
  );
}
