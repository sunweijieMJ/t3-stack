// 门户首页内容（骨架数据，后续可接后台配置）。
// 文案分行存放：章节标题/正文按行淡入，与 KV 的逐字入场共用同一套节奏。

/** 侧边场景导航锚点（对应各 section 的 id） */
export const SCENE_RAIL = [
  { id: 'introduction', no: '00', label: 'Introduction' },
  { id: 'chapter-01', no: '01', label: 'Ideal' },
  { id: 'chapter-02', no: '02', label: 'Inquiry' },
  { id: 'chapter-03', no: '03', label: 'Disciplines' },
  { id: 'chapter-04', no: '04', label: 'Campus' },
  { id: 'chapter-05', no: '05', label: 'People' },
] as const;

export interface Chapter {
  id: string;
  no: string;
  /** 括号内的英文小标签，如 ( About / Ideal ) */
  label: string;
  /** 大标题，按行拆分 */
  title: string[];
  /** 绿色高亮关键词（可选），跟在标题之后 */
  keyword?: string;
  /** 正文，按行拆分 */
  body: string[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'chapter-01',
    no: '01',
    label: 'About / Ideal',
    title: ['教育的意义，', '是把人点亮。'],
    body: [
      '我们相信，大学不是知识的仓库，',
      '而是一间让好奇心持续燃烧的房间。',
      '通识与专精并重，让每个学生',
      '既走得进一门学问的深处，',
      '也看得见学问之外的辽阔。',
    ],
  },
  {
    id: 'chapter-02',
    no: '02',
    label: 'About / Inquiry',
    title: ['研究的起点，', '是一个好问题。'],
    keyword: '「以问题为轴」',
    body: [
      '从基础理论到产业前沿，',
      '我们把资源交给敢于提问的人。',
      '146 个实验室、38 个交叉研究平台，',
      '常年为一个尚未有答案的问题保持运转。',
    ],
  },
  {
    id: 'chapter-03',
    no: '03',
    label: 'Schools & Disciplines',
    title: ['学科交叉处，', '长出新的学问。'],
    keyword: '「交叉融合」',
    body: [
      '理、工、医、文、经、管十二大门类同处一园，',
      '边界因此变得可以穿越。',
      '计算与生命、材料与医学、哲学与人工智能——',
      '最有意思的课程，往往写在两个学院之间。',
    ],
  },
  {
    id: 'chapter-04',
    no: '04',
    label: 'Campus',
    title: ['校园是一座', '会呼吸的城。'],
    body: [
      '晨读的银杏道、深夜仍亮着的自习室、',
      '球场上未结束的加时赛、剧场里的第三次排练。',
      '四季在此轮转，而青春以自己的节奏生长。',
    ],
  },
  {
    id: 'chapter-05',
    no: '05',
    label: 'People',
    title: ['师者与学子，', '彼此成就。'],
    body: [
      '2,400 名教师，48,000 名学生，',
      '在同一张课表上相遇。',
      '他们讲述的不是标准答案，',
      '而是自己如何与一个难题相处。',
    ],
  },
];

export interface Stat {
  value: number;
  suffix: string;
  label: string;
  en: string;
}

export const STATS: Stat[] = [
  { value: 1921, suffix: '', label: '建校年份', en: 'Founded' },
  { value: 32, suffix: '', label: '学院与学部', en: 'Schools' },
  { value: 48000, suffix: '+', label: '在校师生', en: 'Members' },
  { value: 156, suffix: '', label: '重点学科', en: 'Disciplines' },
];

export interface SwitchItem {
  en: string;
  title: string;
  desc: string;
}

/** ON / OFF 切换：课业之内与课业之外的两种校园 */
export const SWITCH_SCENES: {
  key: 'learn' | 'live';
  state: string;
  en: string;
  label: string;
  items: SwitchItem[];
}[] = [
  {
    key: 'learn',
    state: 'ON',
    en: 'Learn',
    label: '课业之内',
    items: [
      { en: 'For Lecture', title: '课堂', desc: '与写下教科书的人同处一室。' },
      {
        en: 'For Research',
        title: '实验室',
        desc: '在无人给出答案的地方追问。',
      },
      { en: 'For Library', title: '图书馆', desc: '千万藏卷，静夜长明。' },
      {
        en: 'For Seminar',
        title: '研讨会',
        desc: '跨学科对谈，思想正面交锋。',
      },
    ],
  },
  {
    key: 'live',
    state: 'OFF',
    en: 'Live',
    label: '课业之外',
    items: [
      { en: 'For Club', title: '社团', desc: '百团千社，热爱自由生长。' },
      { en: 'For Field', title: '运动场', desc: '汗水里也有另一种卓越。' },
      { en: 'For Stage', title: '剧场', desc: '夜晚属于音乐厅与聚光灯。' },
      { en: 'For Journey', title: '游学', desc: '把整个世界当作教室。' },
    ],
  },
];

export interface Voice {
  no: string;
  nameEn: string;
  name: string;
  role: string;
  quote: string;
}

// 示例人物均为虚构，姓名拼音就地忽略拼写检查——
// 这些词只属于这份占位数据，不该进全局词典；接入真实内容时连同本行一起删除。
// cspell:ignore Yuwei Haozhe Wanqing Zhiyuan Zhao Muyang Ayaka
export const VOICES: Voice[] = [
  {
    no: '01',
    nameEn: 'Chen Yuwei',
    name: '陈予薇',
    role: '物理学院 · 教授',
    quote: '实验做了七年才有第一个结果，但那一刻值得所有等待。',
  },
  {
    no: '02',
    nameEn: 'Lin Haozhe',
    name: '林昊哲',
    role: '计算机科学 · 博士四年级',
    quote: '我在这里学会的不是写代码，是判断哪个问题值得写代码。',
  },
  {
    no: '03',
    nameEn: 'Su Wanqing',
    name: '苏婉清',
    role: '中文系 · 本科三年级',
    quote: '一门课能改变你读一本书的方式，这就是我留下来的理由。',
  },
  {
    no: '04',
    nameEn: 'He Zhiyuan',
    name: '何志远',
    role: '医学院 · 附属医院主任医师',
    quote: '课堂在病房里，学生跟着我出门诊，答案由病人给出。',
  },
  {
    no: '05',
    nameEn: 'Ayaka Morita',
    name: '森田彩香',
    role: '交换生 · 环境科学',
    quote: '来之前我只想学中文，走的时候带走了一整个研究方向。',
  },
  {
    no: '06',
    nameEn: 'Zhao Muyang',
    name: '赵牧阳',
    role: '2013 届校友 · 创业者',
    quote: '毕业十年，最常想起的还是那间凌晨两点亮着灯的自习室。',
  },
];

export interface NewsItem {
  category: string;
  date: string;
  title: string;
}

export const NEWS: NewsItem[] = [
  {
    category: 'Research',
    date: '2026.07.18',
    title: '我校科研团队在量子计算纠错方向取得突破，成果登上《Nature》',
  },
  {
    category: 'Admission',
    date: '2026.07.15',
    title: '2026 年本科招生录取工作全面启动，新增三个交叉学科专业',
  },
  {
    category: 'Partnership',
    date: '2026.07.10',
    title: '学校与十二家龙头企业共建产学研创新联合体，推动成果转化',
  },
  {
    category: 'Campus',
    date: '2026.07.05',
    title: '2026 届毕业典礼隆重举行，逾万名学子踏上人生新征程',
  },
  {
    category: 'Global',
    date: '2026.06.28',
    title: '与八所世界一流大学签署联合培养协议，双学位项目秋季开放申请',
  },
];

export interface QuickLink {
  en: string;
  label: string;
}

export const QUICK_LINKS: QuickLink[] = [
  { en: 'Admission', label: '本科招生' },
  { en: 'Graduate', label: '研究生院' },
  { en: 'Research', label: '科学研究' },
  { en: 'Global', label: '国际交流' },
  { en: 'Library', label: '图书馆' },
  { en: 'Career', label: '就业服务' },
];
