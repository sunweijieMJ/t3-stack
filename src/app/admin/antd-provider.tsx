'use client';

import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useMemo } from 'react';
import { useFrontendConfig } from '@/hooks/useFrontendConfig';

export function AdminAntdProvider({ children }: { children: React.ReactNode }) {
  const cfg = useFrontendConfig();
  const theme = useMemo(
    () => ({
      token: {
        borderRadius: 8,
        colorPrimary: cfg.basic?.primaryColor || '#ff6b3d',
      },
    }),
    [cfg.basic?.primaryColor],
  );

  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <App>{children}</App>
    </ConfigProvider>
  );
}
