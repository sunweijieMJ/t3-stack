'use client';

import { SettingOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { EllipsisCell } from '@/components/EllipsisCell';
import { exportToXlsx, type XlsxColumn } from '@/lib/export-xlsx';
import { api, type RouterOutputs } from '@/lib/trpc/react';

const { Text } = Typography;
const { RangePicker } = DatePicker;

type AuditLog = RouterOutputs['sys']['listAuditLogs']['logs'][number];
type Range = [Dayjs | null, Dayjs | null] | null;

function buildAuditExportColumns(
  actionLabelMap: Map<string, string>,
): XlsxColumn<AuditLog>[] {
  return [
    {
      header: '时间',
      accessor: (r) => dayjs(r.createdAt).format('YYYY-MM-DD HH:mm:ss'),
    },
    { header: '用户邮箱', dataIndex: 'userEmail' },
    {
      header: '操作',
      accessor: (r) => actionLabelMap.get(r.action) ?? r.action,
    },
    {
      header: '结果',
      accessor: (r) => (r.result === 'success' ? '成功' : '失败'),
    },
    { header: 'IP', dataIndex: 'ipAddress' },
    { header: 'UA', dataIndex: 'userAgent' },
    { header: '错误信息', dataIndex: 'errorMessage' },
    {
      header: '入参',
      accessor: (r) => (r.input ? JSON.stringify(r.input) : ''),
      width: 60,
    },
  ];
}

export default function AdminAuditLogsView() {
  const { message, modal } = App.useApp();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [range, setRange] = useState<Range>(null);
  const [action, setAction] = useState<string | undefined>();
  const [userEmail, setUserEmail] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [exporting, setExporting] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  const queryInput = {
    page,
    pageSize,
    startDate: range?.[0]?.startOf('day').toISOString(),
    endDate: range?.[1]?.endOf('day').toISOString(),
    action,
    userEmail: userEmail || undefined,
  };

  const utils = api.useUtils();

  const { data, isLoading } = api.sys.listAuditLogs.useQuery(queryInput);

  const { data: actionOptions } = api.sys.listDistinctActions.useQuery();
  const { data: stats } = api.sys.getAuditLogStats.useQuery();

  const exportMutation = api.sys.exportAuditLogs.useMutation();

  const purgeMutation = api.sys.purgeAuditLogs.useMutation({
    onSuccess: (res) => {
      message.success(`已清理 ${res.deleted} 条日志`);
      // 清理会同时影响三处，都要失效：日志列表、统计（tooltip 里的「最早记录」时间）、
      // 操作类型下拉（被清掉的 action 可能已不存在于表中）。
      void utils.sys.listAuditLogs.invalidate();
      void utils.sys.getAuditLogStats.invalidate();
      void utils.sys.listDistinctActions.invalidate();
    },
    onError: (err) => message.error(err.message ?? '清理失败'),
  });

  // 始终加载：handlePurgeNow 也需要 retentionDays 的真实值来展示和计算 beforeDate，
  // 不能等到「自动清理设置」弹窗被打开后才请求
  const purgeConfigQuery = api.sys.getAuditPurgeConfig.useQuery();
  const setPurgeConfig = api.sys.setAuditPurgeConfig.useMutation({
    onSuccess: () => {
      message.success('已保存自动清理设置');
      setConfigOpen(false);
      void purgeConfigQuery.refetch();
    },
    onError: (err) => message.error(err.message ?? '保存失败'),
  });
  const [configForm] = Form.useForm<{
    enabled: boolean;
    retentionDays: number;
  }>();

  const actionLabelMap = new Map(
    (actionOptions ?? []).map((o) => [o.value, o.label]),
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportMutation.mutateAsync({
        startDate: queryInput.startDate,
        endDate: queryInput.endDate,
        action,
        userEmail: userEmail || undefined,
      });
      await exportToXlsx({
        filename: 'audit_logs',
        sheetName: '审计日志',
        columns: buildAuditExportColumns(actionLabelMap),
        rows: res.rows,
      });
      // 命中导出上限时必须明确告知，否则用户会以为导出的是全量数据
      if (res.truncated) {
        message.warning(
          `符合条件的日志超过 ${res.limit} 条，本次仅导出最近 ${res.limit} 条，请缩小时间范围后分批导出`,
          8,
        );
      }
    } catch {
      message.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const handlePurgeNow = async () => {
    // 在弹确认框之前确保配置已加载，避免读到硬编码兜底值导致清理范围与展示不符
    let days = purgeConfigQuery.data?.retentionDays;
    if (typeof days !== 'number') {
      const { data } = await purgeConfigQuery.refetch();
      days = data?.retentionDays;
    }
    if (typeof days !== 'number') {
      message.error('无法获取清理保留天数配置，请稍后重试');
      return;
    }
    const purgeDays = days;
    modal.confirm({
      title: '立即清理',
      content: `将删除 ${purgeDays} 天前的所有审计日志，此操作不可恢复。是否继续？`,
      okText: '确认清理',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => {
        const before = dayjs().subtract(purgeDays, 'day').toISOString();
        purgeMutation.mutate({ beforeDate: before });
      },
    });
  };

  const openConfig = () => {
    setConfigOpen(true);
    // 表单初始值由 Modal 内部的 Form 通过 key={dataUpdatedAt} 在 query 数据到达后重挂时填充，
    // 配合 Modal 的 destroyOnHidden 保证下次打开时是全新的 Form 实例
  };

  const handleConfigSubmit = () => {
    configForm
      .validateFields()
      .then((vals) => setPurgeConfig.mutate(vals))
      .catch(() => undefined);
  };

  const columns: ColumnsType<AuditLog> = [
    {
      title: '#',
      width: 56,
      align: 'center',
      render: (_, __, idx) => (page - 1) * pageSize + idx + 1,
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: Date) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '用户',
      dataIndex: 'userEmail',
      width: 200,
      ellipsis: { showTitle: false },
      render: (v: string | null) => <EllipsisCell value={v} />,
    },
    {
      title: '操作',
      dataIndex: 'action',
      width: 200,
      render: (v: string) => actionLabelMap.get(v) ?? v,
    },
    {
      title: '结果',
      dataIndex: 'result',
      width: 80,
      render: (v: string) =>
        v === 'success' ? (
          <Tag color="green">成功</Tag>
        ) : (
          <Tag color="red">失败</Tag>
        ),
    },
    {
      title: 'IP',
      dataIndex: 'ipAddress',
      width: 130,
      render: (v: string | null) => v ?? <Text type="secondary">—</Text>,
    },
    {
      title: '详情',
      width: 70,
      render: (_, r) => (
        <Button
          onClick={() => {
            setSelected(r);
            setDrawerOpen(true);
          }}
          size="small"
          type="link"
        >
          查看
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <Space wrap>
          <RangePicker
            onChange={(v) => {
              setRange(v as Range);
              setPage(1);
            }}
            value={range ?? undefined}
          />
          <Select
            allowClear
            onChange={(v) => {
              setAction(v);
              setPage(1);
            }}
            options={actionOptions}
            placeholder="操作类型"
            showSearch
            style={{ width: 180 }}
            value={action}
          />
          <Input.Search
            allowClear
            onSearch={(v) => {
              setUserEmail(v);
              setPage(1);
            }}
            placeholder="用户邮箱"
            style={{ width: 220 }}
          />
        </Space>
        <Space>
          <Tooltip
            title={
              stats?.earliestDate
                ? `最早记录：${dayjs(stats.earliestDate).format('YYYY-MM-DD')}`
                : '无历史记录'
            }
          >
            <Text type="secondary">共 {data?.total ?? 0} 条</Text>
          </Tooltip>
          <Button loading={exporting} onClick={handleExport}>
            导出 Excel
          </Button>
          <Button icon={<SettingOutlined />} onClick={openConfig}>
            自动清理设置
          </Button>
          <Button
            danger
            loading={purgeMutation.isPending}
            onClick={() => {
              void handlePurgeNow();
            }}
          >
            立即清理
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={data?.logs ?? []}
        loading={isLoading}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          onChange: setPage,
          showSizeChanger: false,
        }}
        rowKey="id"
        size="middle"
      />

      <Drawer
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        styles={{ wrapper: { width: 640 } }}
        title="审计日志详情"
      >
        {selected && (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="时间">
              {dayjs(selected.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="用户邮箱">
              {selected.userEmail ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="用户 ID">
              <Text code copyable>
                {selected.userId}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="操作">
              {actionLabelMap.get(selected.action) ?? selected.action}
            </Descriptions.Item>
            <Descriptions.Item label="结果">
              {selected.result === 'success' ? (
                <Tag color="green">成功</Tag>
              ) : (
                <Tag color="red">失败</Tag>
              )}
            </Descriptions.Item>
            {selected.errorMessage && (
              <Descriptions.Item label="错误信息">
                <span style={{ whiteSpace: 'pre-wrap' }}>
                  {selected.errorMessage}
                </span>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="IP">
              {selected.ipAddress ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label="UA">
              <span style={{ wordBreak: 'break-all' }}>
                {selected.userAgent ?? '—'}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="入参">
              <pre
                style={{
                  margin: 0,
                  fontSize: 12,
                  maxHeight: 400,
                  overflow: 'auto',
                  background: '#fafafa',
                  padding: 8,
                  borderRadius: 4,
                }}
              >
                {JSON.stringify(selected.input, null, 2)}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>

      <Modal
        confirmLoading={setPurgeConfig.isPending || purgeConfigQuery.isLoading}
        destroyOnHidden
        okButtonProps={{ disabled: purgeConfigQuery.isLoading }}
        onCancel={() => setConfigOpen(false)}
        onOk={handleConfigSubmit}
        open={configOpen}
        title="审计日志自动清理"
      >
        <Form
          form={configForm}
          initialValues={{
            enabled: purgeConfigQuery.data?.enabled ?? true,
            retentionDays: purgeConfigQuery.data?.retentionDays ?? 90,
          }}
          key={purgeConfigQuery.dataUpdatedAt}
          labelCol={{ span: 7 }}
          wrapperCol={{ span: 14 }}
        >
          <Form.Item
            extra="开启后每次进入本页时检查并清理过期日志（每 24 小时最多执行一次）"
            label="启用自动清理"
            name="enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            label="保留天数"
            name="retentionDays"
            rules={[{ required: true, type: 'number', min: 1, max: 3650 }]}
          >
            <InputNumber addonAfter="天" max={3650} min={1} />
          </Form.Item>
          <Form.Item label="上次清理">
            <Text type="secondary">
              {purgeConfigQuery.data?.lastPurgeAt
                ? dayjs(purgeConfigQuery.data.lastPurgeAt).format(
                    'YYYY-MM-DD HH:mm:ss',
                  )
                : '从未清理'}
            </Text>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
