'use client';

import { PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Drawer,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { EllipsisCell } from '@/components/EllipsisCell';
import { RichTextEditor } from '@/components/RichTextEditor';
import {
  CONTENT_STATUSES,
  type ContentState,
  resolveContentState,
} from '@/lib/content-visibility';
import { ROLES } from '@/lib/rbac';
import { api, type RouterOutputs } from '@/lib/trpc/react';

type ContentRow = RouterOutputs['content']['list']['rows'][number];

/** 实际状态 → 展示样式。与 resolveContentState 的返回值一一对应 */
const STATE_META: Record<ContentState, { color: string; label: string }> = {
  draft: { color: 'default', label: '草稿' },
  scheduled: { color: 'blue', label: '待发布' },
  live: { color: 'green', label: '已发布' },
  expired: { color: 'orange', label: '已下架' },
  archived: { color: 'default', label: '已归档' },
};

const STATUS_LABELS: Record<(typeof CONTENT_STATUSES)[number], string> = {
  draft: '草稿',
  published: '发布',
  archived: '归档',
};

const ROLE_LABELS: Record<(typeof ROLES)[number], string> = {
  admin: '管理员',
  editor: '编辑',
  user: '普通用户',
};

interface EditorForm {
  type: string;
  slug: string;
  title: string;
  summary?: string;
  body?: string;
  status: (typeof CONTENT_STATUSES)[number];
  publishedAt?: Dayjs | null;
  unpublishedAt?: Dayjs | null;
  visibleRoles?: string[];
  pinned?: boolean;
}

const EMPTY_FORM: EditorForm = {
  type: 'news',
  slug: '',
  title: '',
  status: 'draft',
  visibleRoles: [],
  pinned: false,
};

export default function AdminContentView() {
  const { message, modal } = App.useApp();
  const utils = api.useUtils();
  const [form] = Form.useForm<EditorForm>();

  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<ContentRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const pageSize = 20;
  const { data, isLoading } = api.content.list.useQuery({
    page,
    pageSize,
    ...(keyword ? { keyword } : {}),
  });

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const onSaved = (verb: string) => () => {
    message.success(`已${verb}`);
    closeDrawer();
    void utils.content.list.invalidate();
  };
  const onFailed = (err: { message: string }) =>
    message.error(err.message || '操作失败');

  const createMutation = api.content.create.useMutation({
    onSuccess: onSaved('创建'),
    onError: onFailed,
  });
  const updateMutation = api.content.update.useMutation({
    onSuccess: onSaved('保存'),
    onError: onFailed,
  });
  const deleteMutation = api.content.delete.useMutation({
    onSuccess: () => {
      message.success('已删除');
      void utils.content.list.invalidate();
    },
    onError: onFailed,
  });

  const openCreate = () => {
    setEditing(null);
    form.setFieldsValue(EMPTY_FORM);
    setDrawerOpen(true);
  };

  const openEdit = (row: ContentRow) => {
    setEditing(row);
    form.setFieldsValue({
      type: row.type,
      slug: row.slug,
      title: row.title,
      summary: row.summary ?? undefined,
      body: row.body,
      status: row.status as EditorForm['status'],
      publishedAt: row.publishedAt ? dayjs(row.publishedAt) : null,
      unpublishedAt: row.unpublishedAt ? dayjs(row.unpublishedAt) : null,
      visibleRoles: row.visibleRoles,
      pinned: row.pinned,
    });
    setDrawerOpen(true);
  };

  const handleSubmit = () => {
    form
      .validateFields()
      .then((vals) => {
        const payload = {
          type: vals.type.trim(),
          slug: vals.slug.trim(),
          title: vals.title.trim(),
          summary: vals.summary?.trim(),
          body: vals.body ?? '',
          status: vals.status,
          publishedAt: vals.publishedAt?.toISOString() ?? null,
          unpublishedAt: vals.unpublishedAt?.toISOString() ?? null,
          visibleRoles: (vals.visibleRoles ?? []) as (typeof ROLES)[number][],
          pinned: vals.pinned ?? false,
        };
        return editing
          ? updateMutation.mutate({ ...payload, id: editing.id })
          : createMutation.mutate(payload);
      })
      .catch(() => undefined);
  };

  const handleDelete = (row: ContentRow) => {
    modal.confirm({
      title: '删除内容',
      content: `确定要删除「${row.title}」吗？此操作不可恢复。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteMutation.mutate({ id: row.id }),
    });
  };

  const columns: ColumnsType<ContentRow> = [
    {
      title: '标题',
      dataIndex: 'title',
      ellipsis: { showTitle: false },
      render: (title: string, row) => (
        <Space>
          {row.pinned && <Tag color="red">置顶</Tag>}
          <EllipsisCell value={title} />
        </Space>
      ),
    },
    { title: '类型', dataIndex: 'type', width: 110 },
    { title: 'Slug', dataIndex: 'slug', width: 160 },
    {
      title: '状态',
      width: 100,
      // 展示的是「此刻的实际状态」而非库里的 status：定时发布未到点、
      // 定时下架已过期时 status 都还是 published，只显示 status 会让
      // 运营以为内容已经在线上了。
      render: (_, row) => {
        const meta = STATE_META[resolveContentState(row, new Date())];
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '可见范围',
      width: 160,
      render: (_, row) =>
        row.visibleRoles.length === 0 ? (
          <Tag>全部</Tag>
        ) : (
          row.visibleRoles.map((r) => (
            <Tag key={r}>{ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r}</Tag>
          ))
        ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 170,
      render: (v: Date) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      width: 130,
      render: (_, row) => (
        <Space size="small">
          <Button onClick={() => openEdit(row)} size="small" type="link">
            编辑
          </Button>
          <Button
            danger
            onClick={() => handleDelete(row)}
            size="small"
            type="link"
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Input.Search
          allowClear
          onSearch={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
          placeholder="搜索标题"
          style={{ width: 240 }}
        />
        <Button icon={<PlusOutlined />} onClick={openCreate} type="primary">
          新建内容
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={data?.rows ?? []}
        loading={isLoading}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          onChange: setPage,
          showTotal: (t) => `共 ${t} 条`,
        }}
        rowKey="id"
      />

      <Drawer
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={closeDrawer}>取消</Button>
            <Button
              loading={createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
              type="primary"
            >
              保存
            </Button>
          </Space>
        }
        onClose={closeDrawer}
        open={drawerOpen}
        title={editing ? `编辑：${editing.title}` : '新建内容'}
        width={880}
      >
        <Form form={form} layout="vertical">
          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item
              label="类型"
              name="type"
              rules={[{ required: true, message: '请填写类型' }]}
              style={{ flex: 1 }}
              tooltip="用于区分公告、新闻、文章等，门户按它取数"
            >
              <Input placeholder="news" />
            </Form.Item>
            <Form.Item
              label="Slug"
              name="slug"
              rules={[
                { required: true, message: '请填写 slug' },
                {
                  pattern: /^[a-z0-9-]+$/,
                  message: '只能包含小写字母、数字和连字符',
                },
              ]}
              style={{ flex: 1 }}
              tooltip="会直接出现在 URL 中，同一类型下不可重复"
            >
              <Input placeholder="spring-notice" />
            </Form.Item>
          </Space>

          <Form.Item
            label="标题"
            name="title"
            rules={[{ required: true, message: '请填写标题' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item label="摘要" name="summary">
            <Input.TextArea
              maxLength={1000}
              placeholder="列表页展示的简介，留空则不显示"
              rows={2}
              showCount
            />
          </Form.Item>

          <Form.Item label="正文" name="body">
            <RichTextEditor />
          </Form.Item>

          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item label="状态" name="status" style={{ flex: 1 }}>
              <Select
                options={CONTENT_STATUSES.map((s) => ({
                  value: s,
                  label: STATUS_LABELS[s],
                }))}
              />
            </Form.Item>
            <Form.Item
              label="可见角色"
              name="visibleRoles"
              style={{ flex: 2 }}
              tooltip="留空表示所有人可见（含未登录访客）；选定后仅对应角色可见，管理员也不例外"
            >
              <Select
                allowClear
                mode="multiple"
                options={ROLES.map((r) => ({
                  value: r,
                  label: ROLE_LABELS[r],
                }))}
                placeholder="不限"
              />
            </Form.Item>
          </Space>

          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item
              label="定时发布"
              name="publishedAt"
              style={{ flex: 1 }}
              tooltip="留空表示状态改为发布后立即生效"
            >
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              label="定时下架"
              name="unpublishedAt"
              style={{ flex: 1 }}
              tooltip="留空表示长期有效"
            >
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="置顶" name="pinned" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Drawer>
    </div>
  );
}
