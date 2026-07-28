import { z } from 'zod';
import { isSafeInternalPath } from '@/lib/safe-path';

// 原生深合并，替代 lodash-es/merge
function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target };
  for (const key in source) {
    const sv = source[key];
    if (
      sv !== null &&
      typeof sv === 'object' &&
      !Array.isArray(sv) &&
      typeof result[key] === 'object'
    ) {
      result[key] = deepMerge(result[key], sv as any);
    } else if (sv !== undefined) {
      result[key] = sv as any;
    }
  }
  return result;
}

// ==================== Schema 类型定义 ====================

export interface IBaseSchema {
  title: string;
  description?: string;
  span?: number;
}

export interface IStringSchema extends IBaseSchema {
  type: 'string';
  inputType?:
    | 'text'
    | 'password'
    | 'textarea'
    | 'color'
    | 'url'
    | 'image'
    | 'file'
    | 'date'
    | 'time'
    | 'datetime'
    | 'daterange'
    | 'datetimerange'
    | 'radio'
    | 'i18n';
  accept?: string;
  enumType?: readonly string[];
  /** image / file 类型上传到 /api/upload 时的 module，默认 'portal' */
  uploadModule?: 'portal' | 'avatars' | 'misc';
  defaultValue?: string | Record<string, string>;
}

export interface INumberSchema extends IBaseSchema {
  type: 'number';
  inputType?: 'input' | 'slider' | 'rate';
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
}

export interface IBooleanSchema extends IBaseSchema {
  type: 'boolean';
  defaultValue?: boolean;
}

export interface IArraySchema extends IBaseSchema {
  type: 'array';
  items: JsonSchema;
  enumType?: readonly string[];
  inputType?: 'checkbox';
  defaultValue?: readonly any[];
}

export interface IObjectSchema extends IBaseSchema {
  type: 'object';
  properties: Record<string, JsonSchema>;
}

export type JsonSchema =
  | IStringSchema
  | INumberSchema
  | IBooleanSchema
  | IArraySchema
  | IObjectSchema;

/** 顶层 section 均为 object，FrontendSchema 约束整体结构 */
export type FrontendSchema = Record<string, IObjectSchema>;

// ==================== 类型推断 ====================

export type InferValue<T> = T extends { type: infer Type }
  ? Type extends 'string'
    ? T extends { inputType: 'i18n' }
      ? Record<string, string>
      : string
    : Type extends 'number'
      ? number
      : Type extends 'boolean'
        ? boolean
        : Type extends 'array'
          ? T extends { items: infer I }
            ? Array<InferValue<I>>
            : never
          : Type extends 'object'
            ? T extends { properties: infer P }
              ? { [K in keyof P]: InferValue<P[K]> }
              : never
            : never
  : never;

export function extractDefaults<T extends Record<string, JsonSchema>>(
  schema: T,
): { [K in keyof T]: InferValue<T[K]> } {
  const result: Record<string, any> = {};
  for (const [key, s] of Object.entries(schema)) {
    if (s.type === 'object') {
      result[key] = extractDefaults(s.properties);
    } else {
      result[key] = s.defaultValue;
    }
  }
  return result as { [K in keyof T]: InferValue<T[K]> };
}

// ==================== 配置实例 ====================

import { frontendConfigSchema } from '@/constants/frontend-config';

export const defaultFrontendConfig = extractDefaults(frontendConfigSchema);
export type FrontendConfig = typeof defaultFrontendConfig;

export function mergeConfig(
  customConfig: Partial<FrontendConfig> = {},
): FrontendConfig {
  return deepMerge(defaultFrontendConfig as FrontendConfig, customConfig);
}

// ==================== 运行时校验（zod） ====================

// 单个字符串字段的长度上限。配置整体存在 systemConfig 的一行 jsonb 里，
// 不设上限的话单个字段就能把这行撑到任意大小。8192 远高于任何真实文案长度。
const MAX_STRING_LEN = 8192;
// URL 类字段更短：既没有正常场景需要超长链接，也限制了被塞进 href/src 的体积。
const MAX_URL_LEN = 2048;

// 只放行 http / https。配置值会被直接渲染成 <a href> 与 <img src>
// （如 PortalFooter 的 icpLink），不做协议白名单的话管理员可写入
// javascript: / data: 等可执行伪协议。虽然只有管理员能写（自我 XSS，低危），
// 但堵住的成本极低。
function isSafeHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

// inputType='url'：外链字段，必须是完整的 http(s) 链接（空串表示未配置）。
const externalUrlSchema = z
  .string()
  .max(MAX_URL_LEN)
  .refine((v) => v === '' || isSafeHttpUrl(v), {
    message: '必须是 http:// 或 https:// 开头的完整链接',
  });

// inputType='image' / 'file'：由 /api/upload 回填。local 存储回相对路径
// /uploads/...，OSS 存储回绝对 URL，两种都要放行（空串表示未上传）。
const assetUrlSchema = z
  .string()
  .max(MAX_URL_LEN)
  .refine((v) => v === '' || isSafeInternalPath(v) || isSafeHttpUrl(v), {
    message: '必须是站内路径（/ 开头）或 http(s) 链接',
  });

// 将 JsonSchema 节点转换为对应的 zod 校验器。
function nodeToZod(node: JsonSchema): z.ZodType {
  switch (node.type) {
    case 'string': {
      if (node.inputType === 'i18n') {
        return z.record(z.string(), z.string().max(MAX_STRING_LEN));
      }
      if (node.enumType && node.enumType.length > 0) {
        return z.enum(node.enumType as readonly [string, ...string[]]);
      }
      if (node.inputType === 'url') {
        return externalUrlSchema;
      }
      if (node.inputType === 'image' || node.inputType === 'file') {
        return assetUrlSchema;
      }
      return z.string().max(MAX_STRING_LEN);
    }
    case 'number': {
      let n: z.ZodNumber = z.number();
      if (typeof node.min === 'number') n = n.min(node.min);
      if (typeof node.max === 'number') n = n.max(node.max);
      return n;
    }
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(nodeToZod(node.items));
    case 'object': {
      const shape: Record<string, z.ZodType> = {};
      for (const [k, v] of Object.entries(node.properties)) {
        shape[k] = nodeToZod(v).optional();
      }
      return z.object(shape).strict();
    }
  }
}

// 顶层校验器：每个 section 都是 strict object，未知 section / 字段会被 zod 拒绝。
export function buildFrontendConfigZod(
  schema: FrontendSchema,
): z.ZodType<Partial<FrontendConfig>> {
  const shape: Record<string, z.ZodType> = {};
  for (const [k, v] of Object.entries(schema)) {
    shape[k] = nodeToZod(v).optional();
  }
  return z.object(shape).strict() as z.ZodType<Partial<FrontendConfig>>;
}

// ==================== 资源 URL 收集 ====================

function collectFromNode(
  node: JsonSchema,
  value: unknown,
  out: Set<string>,
): void {
  switch (node.type) {
    case 'string':
      if (
        (node.inputType === 'image' || node.inputType === 'file') &&
        typeof value === 'string' &&
        value !== ''
      ) {
        out.add(value);
      }
      return;
    case 'array':
      if (Array.isArray(value)) {
        for (const item of value) collectFromNode(node.items, item, out);
      }
      return;
    case 'object':
      if (value !== null && typeof value === 'object') {
        for (const [k, child] of Object.entries(node.properties)) {
          collectFromNode(child, (value as Record<string, unknown>)[k], out);
        }
      }
      return;
    default:
      return;
  }
}

/**
 * 按 schema 递归收集配置里所有「上传得来的资源 URL」（inputType 为 image / file 的字段）。
 * 用于保存配置时对比新旧值，把被替换掉的旧文件删掉 —— 否则每换一次 logo
 * 就在存储里留一份永远不会被引用的孤儿文件。
 *
 * 只认 schema 声明为 image / file 的字段：inputType='url' 的外链字段不在此列，
 * 免得把管理员填的第三方链接当成本系统资源（deleteFile 内部还有一层
 * uploads/ 前缀校验兜底）。
 */
export function collectAssetUrls(
  schema: FrontendSchema,
  value: unknown,
): Set<string> {
  const out = new Set<string>();
  if (value === null || typeof value !== 'object') return out;
  for (const [k, node] of Object.entries(schema)) {
    collectFromNode(node, (value as Record<string, unknown>)[k], out);
  }
  return out;
}
