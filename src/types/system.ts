// 多语言字段（inputType='i18n'）支持的语言列表，ConfigEditor 的语言切换器按此渲染。
export enum LocaleList {
  'zh-CN',
  'en-US',
}
export type LocaleKey = keyof typeof LocaleList;
