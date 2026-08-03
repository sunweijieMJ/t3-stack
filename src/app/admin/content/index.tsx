'use client';

import { PlusOutlined } from '@ant-design/icons';
import {
  Alert,
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
import Link from 'next/link';
import { useState } from 'react';
import { EllipsisCell } from '@/components/EllipsisCell';
import { ImageUploader } from '@/components/ImageUploader';
import { RichTextEditor } from '@/components/RichTextEditor';
import type { ContentType } from '@/lib/content-types';
import {
  CONTENT_STATUSES,
  type ContentState,
  resolveContentState,
} from '@/lib/content-visibility';
import { ROLES } from '@/lib/rbac';
import { api, type RouterOutputs } from '@/lib/trpc/react';

type ContentRow = RouterOutputs['content']['list']['rows'][number];
/** byId 返回的完整记录（含正文），编辑抽屉用它 */
type ContentDetail = RouterOutputs['content']['byId'];

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
  categoryId?: number | null;
  coverImage?: string | null;
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

/**
 * 新建表单的初值。类型不能写死 'news' —— 门户只认「门户设置」里登记过的类型，
 * 写死一个大概率没登记的值，建出来的内容在门户一律 404，而后台列表还显示
 * 「已发布」，没有任何地方提示哪里不对。默认取清单里的第一项。
 */
function emptyForm(defaultType: string): EditorForm {
  return {
    type: defaultType,
    slug: '',
    title: '',
    status: 'draft',
    visibleRoles: [],
    pinned: false,
    categoryId: null,
    coverImage: null,
  };
}

/**
 * 包一层是因为 ImageUploader 的必填 module 无法由 Form.Item 注入，
 * 而 Form.Item 只会往子组件传 value / onChange。
 */
function CoverField({
  value,
  onChange,
}: {
  value?: string | null;
  onChange?: (url: string | null) => void;
}) {
  return (
    <ImageUploader
      module="portal"
      onChange={(url) => onChange?.(url)}
      placeholder="上传封面"
      value={value}
    />
  );
}

interface AdminContentViewProps {
  /** 「门户设置 → 内容类型」里登记的清单，由 page.tsx 在服务端读取后注入 */
  contentTypes: ContentType[];
}

export default function AdminContentView({
  contentTypes,
}: AdminContentViewProps) {
  const { message, modal } = App.useApp();
  const utils = api.useUtils();
  const [form] = Form.useForm<EditorForm>();

  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [editing, setEditing] = useState<ContentDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const typeOptions = contentTypes.map((t) => ({
    value: t.slug,
    label: `${t.label}（${t.slug}）`,
  }));
  // 正在编辑的内容若带着一个已从清单里移除的类型，把它作为额外选项补进来并标注。
  // 不补的话下拉框显示不出当前值，用户一保存就会把类型换成别的，属于静默改数据。
  // 服务端同样允许「沿用原类型」，两边语义一致，见 routers/content.ts。
  const editingType = editing?.type;
  const options =
    editingType && !contentTypes.some((t) => t.slug === editingType)
      ? [
          ...typeOptions,
          { value: editingType, label: `${editingType}（未登记）` },
        ]
      : typeOptions;

  const pageSize = 20;
  const { data: categories } = api.content.listCategories.useQuery();

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
    form.setFieldsValue(emptyForm(contentTypes[0]?.slug ?? ''));
    setDrawerOpen(true);
  };

  // 必须按 id 重新取完整记录：列表接口不再返回 body（正文太大，见 router 里的
  // 说明），直接拿列表行填表单会让正文变成空字符串，一保存就把内容清空。
  const openEdit = async (row: ContentRow) => {
    const full = await utils.content.byId.fetch({ id: row.id });
    setEditing(full);
    form.setFieldsValue({
      type: full.type,
      slug: full.slug,
      title: full.title,
      summary: full.summary ?? undefined,
      body: full.body,
      status: full.status as EditorForm['status'],
      publishedAt: full.publishedAt ? dayjs(full.publishedAt) : null,
      unpublishedAt: full.unpublishedAt ? dayjs(full.unpublishedAt) : null,
      visibleRoles: full.visibleRoles,
      pinned: full.pinned,
      categoryId: full.categoryId,
      coverImage: full.coverImage,
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
          categoryId: vals.categoryId ?? null,
          coverImage: vals.coverImage ?? undefined,
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
          <Button
            onClick={() => {
              void openEdit(row);
            }}
            size="small"
            type="link"
          >
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
      {/* 清单为空是全新部署的默认状态（content.types 默认值就是 []）。不提示的话，
          用户会建出一批门户永远 404 的内容，而后台看起来一切正常。 */}
      {contentTypes.length === 0 && (
        <Alert
          action={
            <Link href="/admin/setting">
              <Button size="small" type="primary">
                去登记
              </Button>
            </Link>
          }
          description="内容必须归属于一个已登记的类型，门户才能访问。请先到「门户设置 → 内容类型」添加至少一个类型。"
          message="尚未登记任何内容类型"
          showIcon
          style={{ marginBottom: 16 }}
          type="warning"
        />
      )}

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
        <Button
          disabled={contentTypes.length === 0}
          icon={<PlusOutlined />}
          onClick={openCreate}
          title={
            contentTypes.length === 0 ? '请先登记至少一个内容类型' : undefined
          }
          type="primary"
        >
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
              rules={[{ required: true, message: '请选择类型' }]}
              style={{ flex: 1 }}
              tooltip="只能从「门户设置 → 内容类型」登记过的清单中选择；未登记的类型在门户会 404"
            >
              <Select
                options={options}
                placeholder={
                  options.length === 0 ? '尚未登记任何类型' : '请选择'
                }
              />
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

          <Space size="large" style={{ display: 'flex' }}>
            <Form.Item label="分类" name="categoryId" style={{ flex: 1 }}>
              <Select
                allowClear
                options={(categories ?? []).map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                placeholder="未分类"
              />
            </Form.Item>
            <Form.Item
              getValueFromEvent={(url: string | null) => url}
              label="封面图"
              name="coverImage"
              style={{ flex: 1 }}
            >
              <CoverField />
            </Form.Item>
          </Space>

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
