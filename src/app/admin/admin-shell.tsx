'use client';

import {
  GlobalOutlined,
  HistoryOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import { App, Button, Dropdown, Layout, Menu, Tooltip, theme } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFrontendConfig } from '@/hooks/useFrontendConfig';
import { authClient } from '@/lib/auth-client';
import { pickI18nText } from '@/lib/i18n-text';

const SITE_NAME_FALLBACK = 'Site';

const { Sider, Content, Header } = Layout;

const MENU_ITEMS: MenuProps['items'] = [
  {
    key: '/admin/users',
    icon: <TeamOutlined />,
    label: '用户管理',
  },
  {
    key: '/admin/audit-logs',
    icon: <HistoryOutlined />,
    label: '审计日志',
  },
  {
    key: '/admin/setting',
    icon: <SettingOutlined />,
    label: '门户设置',
  },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { modal } = App.useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = authClient.useSession();
  const frontendConfig = useFrontendConfig();
  const siteName = pickI18nText(
    frontendConfig.basic?.systemTitle,
    'zh-CN',
    SITE_NAME_FALLBACK,
  );
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsed={collapsed}
        style={{
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
          borderRight: '1px solid #f0f0f0',
        }}
        theme="light"
        trigger={null}
        width={220}
      >
        <div
          style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
        >
          {/* Logo */}
          <div
            style={{
              height: 64,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'space-between',
              padding: collapsed ? '0' : '0 16px',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            {!collapsed && (
              <span style={{ fontWeight: 600, fontSize: 16 }}>{siteName}</span>
            )}
            <Button
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              type="text"
            />
          </div>

          {/* 菜单 */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <Menu
              items={MENU_ITEMS}
              mode="inline"
              onClick={({ key }) => router.push(key)}
              selectedKeys={[pathname]}
              style={{ borderRight: 0 }}
            />
          </div>

          {/* 底部：返回前台 */}
          <div
            style={{
              flexShrink: 0,
              padding: collapsed ? '12px 0' : '12px 16px',
              borderTop: '1px solid #f0f0f0',
              display: 'flex',
              justifyContent: collapsed ? 'center' : 'flex-start',
            }}
          >
            {collapsed ? (
              <Tooltip placement="right" title="返回前台">
                <Link
                  aria-label="返回前台"
                  href="/"
                  style={{ color: '#8c8c8c', fontSize: 16 }}
                  target="_blank"
                >
                  <GlobalOutlined />
                </Link>
              </Tooltip>
            ) : (
              <Link
                className="flex items-center gap-2 text-gray-500 text-sm hover:text-gray-900"
                href="/"
                target="_blank"
              >
                <GlobalOutlined />
                返回前台
              </Link>
            )}
          </div>
        </div>
      </Sider>

      <Layout
        style={{
          marginLeft: collapsed ? 80 : 220,
          transition: 'margin-left 0.2s',
        }}
      >
        <Header
          style={{
            background: colorBgContainer,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            borderBottom: '1px solid #f0f0f0',
            height: 64,
          }}
        >
          {session?.user && (
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: '退出登录',
                    onClick: () => {
                      modal.confirm({
                        title: '确认退出',
                        content: '确定要退出登录吗？',
                        okText: '确定退出',
                        cancelText: '取消',
                        onOk: () =>
                          authClient.signOut().then(() => {
                            router.push('/signin');
                          }),
                      });
                    },
                  },
                ],
              }}
              trigger={['hover']}
            >
              <span style={{ color: '#666', fontSize: 14, cursor: 'pointer' }}>
                {session.user.email ?? session.user.name}
              </span>
            </Dropdown>
          )}
        </Header>
        <Content>{children}</Content>
      </Layout>
    </Layout>
  );
}
