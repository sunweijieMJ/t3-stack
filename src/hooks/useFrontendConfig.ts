'use client';

import { useMemo } from 'react';
import { type FrontendConfig, mergeConfig } from '@/lib/frontend-config';
import { api } from '@/lib/trpc/react';

/**
 * 响应式前端配置 Hook（仅限 admin 上下文）
 * 从服务端拉取已保存配置，与默认值深合并后返回完整配置
 */
export function useFrontendConfig(): FrontendConfig {
  const { data } = api.page.getFrontendConfig.useQuery();
  return useMemo(() => mergeConfig(data?.value ?? {}), [data?.value]);
}
