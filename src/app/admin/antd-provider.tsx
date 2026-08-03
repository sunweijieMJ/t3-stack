'use client';

import { App, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useMemo } from 'react';

export function AdminAntdProvider({
  children,
  primaryColor,
}: {
  children: React.ReactNode;
  /**
   * 由 admin/layout 在服务端读好后注入。不在这里自己查配置：那条路要
   * config.manage，而本组件包着所有后台页面，editor 会因此每次都撞 403。
   */
  primaryColor: string;
}) {
  const theme = useMemo(
    () => ({
      token: {
        borderRadius: 8,
        colorPrimary: primaryColor,
      },
    }),
    [primaryColor],
  );

  return (
    <ConfigProvider locale={zhCN} theme={theme}>
      <App>{children}</App>
    </ConfigProvider>
  );
}
