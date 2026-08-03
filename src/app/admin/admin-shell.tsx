'use client';

import {
  FileTextOutlined,
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
import { visibleAdminMenu } from '@/lib/admin-menu';
import { authClient } from '@/lib/auth-client';
import type { Role } from '@/lib/rbac';

const { Sider, Content, Header } = Layout;

// 图标与菜单定义分离：定义在 lib/admin-menu（纯逻辑、可测试、与鉴权共用同一份
// 权限点），这里只补图标。新增菜单请改那边，否则会漏掉权限绑定。
const MENU_ICONS: Record<string, React.ReactNode> = {
  '/admin/users': <TeamOutlined />,
  '/admin/content': <FileTextOutlined />,
  '/admin/audit-logs': <HistoryOutlined />,
  '/admin/setting': <SettingOutlined />,
};

export function AdminShell({
  children,
  role,
  siteName,
}: {
  children: React.ReactNode;
  /** 由 layout 在服务端解析后注入，见那边的说明 */
  role: Role;
  /**
   * 由 layout 在服务端按 basic.defaultLanguage 取好的站点名。
   *
   * 不在这里自己查配置：那条路要 config.manage，而本组件包着所有后台页面，
   * editor 会因此每次都撞 403 并静默退回默认站点名。服务端取值还顺带保证了
   * 侧边栏与浏览器标题（同样走 getSiteName）用的是同一种语言。
   */
  siteName: string;
}) {
  const { modal } = App.useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const { data: session } = authClient.useSession();
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  // 只渲染当前角色有权限的菜单。不过滤的话，editor 会看到四个菜单却只有
  // 「内容管理」能用，另外三个点进去全是 403。
  const menuItems: MenuProps['items'] = visibleAdminMenu(role).map((item) => ({
    key: item.key,
    icon: MENU_ICONS[item.key],
    label: item.label,
  }));

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
              items={menuItems}
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
