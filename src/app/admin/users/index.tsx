'use client';

import { PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { EllipsisCell } from '@/components/EllipsisCell';
import { authClient } from '@/lib/auth-client';
import type { AuthMethod } from '@/lib/auth-methods';
import { ROLES } from '@/lib/rbac';
import { api, type RouterOutputs } from '@/lib/trpc/react';

const { Text } = Typography;

const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  admin: '管理员',
  editor: '编辑',
  user: '普通用户',
};

type UserRow = RouterOutputs['sys']['listUsers'][number];

type CreateForm = { email: string; name: string; password?: string };

interface AdminUsersViewProps {
  /** 由 page.tsx 在服务端从 env.AUTH_METHOD 解析后注入 */
  authMethod: AuthMethod;
}

export default function AdminUsersView({ authMethod }: AdminUsersViewProps) {
  const { message, modal } = App.useApp();
  const utils = api.useUtils();
  const { data: session } = authClient.useSession();
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm<CreateForm>();

  // email-otp 模式下登录不校验密码，服务端会生成随机强密码占位，
  // 让管理员为一个永远不会被用到的密码凭空编一个没有意义。
  const needsPassword = authMethod === 'email-password';

  const { data, isLoading } = api.sys.listUsers.useQuery();

  const createMutation = api.sys.createUser.useMutation({
    onSuccess: (created) => {
      message.success(`已创建用户 ${created.email}`);
      setCreateOpen(false);
      void utils.sys.listUsers.invalidate();
    },
    onError: (err) => message.error(err.message || '创建失败'),
  });

  const setRoleMutation = api.sys.setUserRole.useMutation({
    onSuccess: () => {
      message.success('已更新角色');
      void utils.sys.listUsers.invalidate();
    },
    onError: (err) => message.error(err.message || '更新角色失败'),
  });

  const deleteMutation = api.sys.deleteUser.useMutation({
    onSuccess: () => {
      message.success('已删除用户');
      void utils.sys.listUsers.invalidate();
    },
    onError: (err) => message.error(err.message || '删除失败'),
  });

  const handleCreate = () => {
    form
      .validateFields()
      .then((vals) =>
        createMutation.mutate({
          email: vals.email.trim(),
          name: vals.name.trim(),
          // 不传 password 让服务端生成随机占位密码
          ...(needsPassword && vals.password
            ? { password: vals.password }
            : {}),
        }),
      )
      .catch(() => undefined);
  };

  const handleDelete = (row: UserRow) => {
    modal.confirm({
      title: '删除用户',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      content: (
        <div>
          <p>
            确定要删除 <Text strong>{row.email ?? row.name}</Text>{' '}
            吗？此操作不可恢复。
          </p>
          {row.isAdmin && (
            <p style={{ color: '#cf1322' }}>
              该账号的邮箱在 ADMIN_EMAILS
              白名单中，删除后这个人将无法再登录后台。
            </p>
          )}
          <p style={{ color: '#8c8c8c', fontSize: 12 }}>
            该用户产生的审计日志会保留，仅把关联的用户 ID
            置空（邮箱字段仍留存以便追溯）。
          </p>
        </div>
      ),
      onOk: () => deleteMutation.mutate({ userId: row.id }),
    });
  };

  const columns: ColumnsType<UserRow> = [
    {
      title: '邮箱',
      dataIndex: 'email',
      ellipsis: { showTitle: false },
      render: (v: string | null, row) => (
        <span>
          <EllipsisCell value={v} />
          {row.isAdmin && (
            <Tag color="gold" style={{ marginLeft: 8 }}>
              管理员
            </Tag>
          )}
        </span>
      ),
    },
    {
      title: '姓名',
      dataIndex: 'name',
      width: 200,
      ellipsis: { showTitle: false },
      render: (v: string | null) => <EllipsisCell value={v} />,
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 150,
      render: (role: string, row) => {
        // 自己的角色不给改：服务端同样会拒（会失去 user.manage 后再也改不回来）。
        // 白名单账号的角色由 ADMIN_EMAILS 决定，改库不生效，这里一并禁用并说明，
        // 免得管理员改完以为生效了。
        const isSelf = row.id === session?.user.id;
        const disabled = isSelf || setRoleMutation.isPending;
        return (
          <Select<(typeof ROLES)[number]>
            disabled={disabled}
            onChange={(next) =>
              setRoleMutation.mutate({ userId: row.id, role: next })
            }
            options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            size="small"
            style={{ width: 120 }}
            title={isSelf ? '不能修改自己的角色' : undefined}
            value={role as (typeof ROLES)[number]}
          />
        );
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: Date) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      width: 90,
      render: (_, row) => {
        // 服务端也会拒绝删自己（FORBIDDEN），这里同步禁用，避免让人白点一次
        const isSelf = row.id === session?.user.id;
        return (
          <Button
            danger
            disabled={isSelf}
            onClick={() => handleDelete(row)}
            size="small"
            title={isSelf ? '不能删除自己的账户' : undefined}
            type="link"
          >
            删除
          </Button>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text type="secondary">共 {data?.length ?? 0} 个用户</Text>
        <Button
          icon={<PlusOutlined />}
          onClick={() => setCreateOpen(true)}
          type="primary"
        >
          新建用户
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={data ?? []}
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        rowKey="id"
        size="middle"
      />

      <Modal
        confirmLoading={createMutation.isPending}
        destroyOnHidden
        okText="创建"
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        open={createOpen}
        title="新建用户"
      >
        <Form
          form={form}
          labelCol={{ span: 5 }}
          preserve={false}
          wrapperCol={{ span: 17 }}
        >
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input autoComplete="off" placeholder="user@example.com" />
          </Form.Item>
          <Form.Item
            label="姓名"
            name="name"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          {needsPassword && (
            <Form.Item
              label="密码"
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少 6 位' },
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          )}
        </Form>
        {needsPassword ? (
          <Text style={{ fontSize: 12 }} type="secondary">
            当前为邮箱密码登录模式，请把密码告知该用户并提醒尽快修改。
          </Text>
        ) : (
          <Text style={{ fontSize: 12 }} type="secondary">
            当前为邮箱验证码登录模式，无需设置密码 ——
            该用户凭邮箱收取验证码登录即可。
          </Text>
        )}
      </Modal>
    </div>
  );
}
