import { z } from 'zod';

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

// 将 JsonSchema 节点转换为对应的 zod 校验器。
function nodeToZod(node: JsonSchema): z.ZodType {
  switch (node.type) {
    case 'string': {
      if (node.inputType === 'i18n') {
        return z.record(z.string(), z.string());
      }
      if (node.enumType && node.enumType.length > 0) {
        return z.enum(node.enumType as readonly [string, ...string[]]);
      }
      return z.string();
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
