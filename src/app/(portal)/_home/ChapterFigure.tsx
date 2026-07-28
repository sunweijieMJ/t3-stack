import styles from './index.module.scss';

/**
 * 章节配图 —— 参考站此处放视频/产品实拍，本项目暂无素材，
 * 改用纯几何线稿：每章一个母题，缓慢自转，只用绿与墨两色。
 */

const GRID = [0, 1, 2, 3, 4, 5, 6];

function Rings() {
  return (
    <g className={styles.figSpin}>
      {[26, 46, 66, 86].map((r) => (
        <circle cx="100" cy="100" key={r} r={r} />
      ))}
      <circle className={styles.figFill} cx="100" cy="100" r="8" />
      <circle className={styles.figAccent} cx="100" cy="14" r="4" />
    </g>
  );
}

function Dots() {
  return (
    <g>
      {GRID.map((row) =>
        GRID.map((col) => {
          const accent = (row + col) % 5 === 0;
          return (
            <circle
              className={accent ? styles.figFillAccent : styles.figFill}
              cx={28 + col * 24}
              cy={28 + row * 24}
              key={`${row}-${col}`}
              r={accent ? 5 : 2.5}
            />
          );
        }),
      )}
    </g>
  );
}

function Lattice() {
  return (
    <g className={styles.figSpinSlow}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <line key={`a-${i}`} x1={20 + i * 23} x2="100" y1="20" y2="180" />
      ))}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <line key={`b-${i}`} x1={20 + i * 23} x2="100" y1="180" y2="20" />
      ))}
      <circle className={styles.figFillAccent} cx="100" cy="100" r="6" />
    </g>
  );
}

function Arcs() {
  return (
    <g className={styles.figSpin}>
      {[30, 52, 74, 96].map((r, i) => (
        <path
          className={i === 1 ? styles.figAccent : undefined}
          d={`M ${100 - r} 100 A ${r} ${r} 0 0 1 100 ${100 - r}`}
          key={r}
        />
      ))}
      {[30, 52, 74, 96].map((r) => (
        <path
          d={`M ${100 + r} 100 A ${r} ${r} 0 0 1 100 ${100 + r}`}
          key={`m-${r}`}
        />
      ))}
    </g>
  );
}

function Orbit() {
  return (
    <g className={styles.figSpinSlow}>
      {[0, 60, 120].map((deg) => (
        <ellipse
          cx="100"
          cy="100"
          key={deg}
          rx="88"
          ry="34"
          transform={`rotate(${deg} 100 100)`}
        />
      ))}
      <circle className={styles.figFillAccent} cx="100" cy="100" r="10" />
      <circle className={styles.figFill} cx="182" cy="112" r="4" />
    </g>
  );
}

const FIGURES = [Rings, Dots, Lattice, Arcs, Orbit];

export function ChapterFigure({ index }: { index: number }) {
  const Figure = FIGURES[index % FIGURES.length] ?? Rings;

  return (
    <svg
      aria-hidden="true"
      className={styles.figure}
      focusable="false"
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
    >
      <Figure />
    </svg>
  );
}
