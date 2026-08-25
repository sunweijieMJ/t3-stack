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
  InputNumber,
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
    // module="content" 而非 "portal"：封面图属于内容而非站点级资源，
    // 走 content.manage 权限，否则只有内容编辑权的 editor 传封面会 403。
    // 见 app/api/upload/route.ts 的 MODULE_PERMISSIONS。
    <ImageUploader
      module="content"
      onChange={(url) => onChange?.(url)}
      placeholder="上传封面"
      value={value}
    />
  );
}

type CategoryRow = RouterOutputs['content']['listCategories'][number];

/** 分类下拉里显示的层级缩进。分类树最多 8 层，见 router 的 MAX_CATEGORY_DEPTH */
function categoryDepth(
  row: CategoryRow,
  byId: Map<number, CategoryRow>,
): number {
  let depth = 0;
  let parentId = row.parentId;
  // 上界防御：库里若已存在环（历史脏数据早于环路校验落地），
  // 这里必须能停下来，否则整个后台分类页会直接卡死浏览器标签页。
  while (parentId != null && depth < 8) {
    parentId = byId.get(parentId)?.parentId ?? null;
    depth++;
  }
  return depth;
}

interface CategoryFormValues {
  name: string;
  slug: string;
  parentId?: number | null;
  sortOrder?: number;
}

/**
 * 分类管理。
 *
 * 此前分类只有后端三个 procedure 和内容表单里一个下拉框，却没有任何创建入口 ——
 * 下拉框永远是空的，categoryId 存进去也没有任何地方读。这个抽屉把这条链路补完。
 */
function CategoryManager({
  open,
  onClose,
  categories,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryRow[];
  loading: boolean;
}) {
  const { message, modal } = App.useApp();
  const utils = api.useUtils();
  const [form] = Form.useForm<CategoryFormValues>();
  const [editingId, setEditingId] = useState<number | null>(null);

  const byId = new Map(categories.map((c) => [c.id, c]));

  const refresh = () => {
    void utils.content.listCategories.invalidate();
    // 内容列表带着 categoryName（服务端 leftJoin 取的），改了分类名之后
    // 不失效的话表格里还是旧名字。
    void utils.content.list.invalidate();
  };

  const resetForm = () => {
    setEditingId(null);
    form.resetFields();
  };

  const onError = (err: { message: string }) =>
    message.error(err.message || '操作失败');

  const createMutation = api.content.createCategory.useMutation({
    onSuccess: () => {
      message.success('已创建分类');
      resetForm();
      refresh();
    },
    onError,
  });
  const updateMutation = api.content.updateCategory.useMutation({
    onSuccess: () => {
      message.success('已保存分类');
      resetForm();
      refresh();
    },
    onError,
  });
  const deleteMutation = api.content.deleteCategory.useMutation({
    onSuccess: () => {
      message.success('已删除分类');
      resetForm();
      refresh();
    },
    onError,
  });

  const startEdit = (row: CategoryRow) => {
    setEditingId(row.id);
    form.setFieldsValue({
      name: row.name,
      slug: row.slug,
      parentId: row.parentId,
      sortOrder: row.sortOrder,
    });
  };

  const submit = () => {
    form
      .validateFields()
      .then((vals) => {
        const payload = {
          name: vals.name.trim(),
          slug: vals.slug.trim(),
          parentId: vals.parentId ?? null,
          sortOrder: vals.sortOrder ?? 0,
        };
        return editingId === null
          ? createMutation.mutate(payload)
          : updateMutation.mutate({ ...payload, id: editingId });
      })
      .catch(() => undefined);
  };

  const confirmDelete = (row: CategoryRow) => {
    modal.confirm({
      title: '删除分类',
      content: (
        <div>
          <p>确定要删除「{row.name}」吗？</p>
          {/* 说清楚不会级联删内容，否则没人敢点这个按钮 —— 外键是 SET NULL，
              见 db/content-schema.ts */}
          <p style={{ color: '#8c8c8c', fontSize: 12 }}>
            该分类下的内容不会被删除，会变成「未分类」；子分类会挂回顶层。
          </p>
        </div>
      ),
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteMutation.mutate({ id: row.id }),
    });
  };

  // 父级候选里必须排掉自己：选中自己会被服务端拒（assertNoCategoryCycle），
  // 让它出现在下拉里只是让人白点一次。更深的环由服务端负责，前端不重复实现。
  const parentOptions = categories
    .filter((c) => c.id !== editingId)
    .map((c) => ({
      value: c.id,
      label: `${'　'.repeat(categoryDepth(c, byId))}${c.name}`,
    }));

  const columns: ColumnsType<CategoryRow> = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (name: string, row) => (
        <span style={{ paddingLeft: categoryDepth(row, byId) * 16 }}>
          {name}
        </span>
      ),
    },
    { title: 'Slug', dataIndex: 'slug', width: 150 },
    { title: '排序', dataIndex: 'sortOrder', width: 70 },
    {
      title: '操作',
      width: 110,
      render: (_, row) => (
        <Space size="small">
          <Button onClick={() => startEdit(row)} size="small" type="link">
            编辑
          </Button>
          <Button
            danger
            onClick={() => confirmDelete(row)}
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
    <Drawer
      destroyOnHidden
      onClose={() => {
        resetForm();
        onClose();
      }}
      open={open}
      title="分类管理"
      width={640}
    >
      <Form form={form} layout="vertical">
        <Space size="middle" style={{ display: 'flex' }}>
          <Form.Item
            label="名称"
            name="name"
            rules={[{ required: true, message: '请填写名称' }]}
            style={{ flex: 1 }}
          >
            <Input placeholder="行业动态" />
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
            tooltip="会出现在门户的 ?category= 参数里，全站唯一"
          >
            <Input placeholder="industry-news" />
          </Form.Item>
        </Space>
        <Space size="middle" style={{ display: 'flex' }}>
          <Form.Item label="父级分类" name="parentId" style={{ flex: 1 }}>
            <Select allowClear options={parentOptions} placeholder="顶层分类" />
          </Form.Item>
          <Form.Item
            label="排序"
            name="sortOrder"
            style={{ flex: 1 }}
            tooltip="数字越小越靠前，相同则按创建顺序"
          >
            <InputNumber placeholder="0" style={{ width: '100%' }} />
          </Form.Item>
        </Space>
        <Space>
          <Button
            loading={createMutation.isPending || updateMutation.isPending}
            onClick={submit}
            type="primary"
          >
            {editingId === null ? '新建分类' : '保存修改'}
          </Button>
          {editingId !== null && <Button onClick={resetForm}>取消编辑</Button>}
        </Space>
      </Form>

      <Table
        columns={columns}
        dataSource={categories}
        loading={loading}
        pagination={false}
        rowKey="id"
        size="small"
        style={{ marginTop: 24 }}
      />
    </Drawer>
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
  const [categoryOpen, setCategoryOpen] = useState(false);
  // undefined=不筛选，0=未分类（与 router 的哨兵值对齐），正数=具体分类
  const [categoryFilter, setCategoryFilter] = useState<number | undefined>();
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<
    (typeof CONTENT_STATUSES)[number] | undefined
  >();

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
  const { data: categories, isLoading: categoriesLoading } =
    api.content.listCategories.useQuery();
  const categoryList = categories ?? [];

  const { data, isLoading } = api.content.list.useQuery({
    page,
    pageSize,
    ...(keyword ? { keyword } : {}),
    // 不能写成 `categoryId: categoryFilter`：undefined 会被 superjson 保留，
    // 而 zod 的 .optional() 认得 undefined，行为是对的 —— 但展开写更明确，
    // 也和上面 keyword 的处理保持一致。
    ...(categoryFilter === undefined ? {} : { categoryId: categoryFilter }),
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
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
    // byId 也必须失效：openEdit 走的是 utils.content.byId.fetch()，而 query-client
    // 设了 staleTime=30s —— 缓存未过期时 fetch 直接返回旧值，不发请求。不失效的话，
    // 保存后 30 秒内再点「编辑」，抽屉里是保存**前**的内容，用户再点保存就把刚才的
    // 修改覆盖回去了，全程没有任何报错。
    void utils.content.byId.invalidate();
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
    // 必须自己兜错：调用方是 `void openEdit(row)`，抛出去就是一条无人处理的
    // unhandled rejection —— 内容已被他人删除或网络抖动时，抽屉不打开、没有任何
    // 提示，用户只会觉得「编辑按钮点了没反应」。
    let full: ContentDetail;
    try {
      full = await utils.content.byId.fetch({ id: row.id });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '打开失败，请重试');
      return;
    }
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
          // 必须传 null 而不是 undefined：undefined 会被 drizzle 从 UPDATE 的 SET
          // 子句里整列剔除，用户点掉封面后保存，库里的旧封面纹丝不动。
          coverImage: vals.coverImage ?? null,
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
      title: '分类',
      dataIndex: 'categoryName',
      width: 120,
      // categoryName 由服务端 leftJoin 取回，「没设分类」与「分类已被删除」
      // 都是 null，展示成同一个「未分类」是正确的 —— 两者对内容本身没有区别。
      render: (name: string | null) =>
        name ? <Tag>{name}</Tag> : <span style={{ color: '#bfbfbf' }}>—</span>,
    },
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

      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          allowClear
          onSearch={(v) => {
            setKeyword(v.trim());
            setPage(1);
          }}
          placeholder="搜索标题"
          style={{ width: 240 }}
        />
        {/* 换任何筛选条件都要回第 1 页：停在第 3 页切到一个只有 1 页的结果集会
            得到空列表，而分页器还显示「共 N 条」，看起来像数据丢了。 */}
        <Select<string | undefined>
          allowClear
          onChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
          options={typeOptions}
          placeholder="全部类型"
          style={{ width: 170 }}
          value={typeFilter}
        />
        <Select<(typeof CONTENT_STATUSES)[number] | undefined>
          allowClear
          onChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
          options={CONTENT_STATUSES.map((s) => ({
            value: s,
            label: STATUS_LABELS[s],
          }))}
          placeholder="全部状态"
          style={{ width: 130 }}
          // 这里筛的是**库里存的 status**，不是表格「状态」列显示的实际状态。
          // 两者会不一致：定时未到点 / 已过期的内容 status 仍然是 published，
          // 选「发布」会把它们一并带出来。不说清楚的话，用户会以为筛选坏了。
          title="按存储状态筛选。定时未生效、已下架的内容其存储状态仍是「发布」"
          value={statusFilter}
        />
        <Select<number | undefined>
          allowClear
          onChange={(v) => {
            setCategoryFilter(v);
            setPage(1);
          }}
          options={[
            { value: 0, label: '未分类' },
            ...categoryList.map((c) => ({ value: c.id, label: c.name })),
          ]}
          placeholder="全部分类"
          style={{ width: 160 }}
          value={categoryFilter}
        />
        <Button onClick={() => setCategoryOpen(true)}>分类管理</Button>
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

      <CategoryManager
        categories={categoryList}
        loading={categoriesLoading}
        onClose={() => setCategoryOpen(false)}
        open={categoryOpen}
      />

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
                options={categoryList.map((c) => ({
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
