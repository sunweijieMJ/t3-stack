export enum LocaleList {
  'zh-CN',
  'en-US',
}
export type LocaleKey = keyof typeof LocaleList;

export enum ThemeStyleList {
  light,
  dark,
}
export type ThemeStyleKey = keyof typeof ThemeStyleList;
