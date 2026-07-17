'use client';

import { App, Button, Card, Radio, Space, Spin, Tooltip } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ConfigEditor, { type EditMode } from '@/components/ConfigEditor';
import { frontendConfigSchema } from '@/constants/frontend-config';
import { type FrontendConfig, mergeConfig } from '@/lib/frontend-config';
import { api } from '@/lib/trpc/react';

export default function AdminSettingPage() {
  const { message, modal } = App.useApp();
  const {
    data: stored,
    isLoading,
    refetch,
  } = api.page.getFrontendConfig.useQuery();
  // 持有读取时的 updatedAt 作为乐观锁版本号，保存/重置时回传给后端
  const expectedUpdatedAt = useMemo(
    () =>
      stored?.updatedAt instanceof Date
        ? stored.updatedAt.toISOString()
        : (stored?.updatedAt ?? null),
    [stored?.updatedAt],
  );

  const handleConflict = useCallback(() => {
    void message.error('配置已被其他管理员修改，已为你拉取最新版本');
    void refetch();
  }, [message, refetch]);

  const saveMutation = api.page.saveFrontendConfig.useMutation({
    onSuccess: () => {
      message.success('配置已保存');
      void refetch();
    },
    onError: (err) => {
      if (err.data?.code === 'CONFLICT') {
        handleConflict();
      } else {
        message.error('保存失败，请重试');
      }
    },
  });
  const resetMutation = api.page.saveFrontendConfig.useMutation({
    onSuccess: () => {
      message.success('已恢复默认配置');
      void refetch();
    },
    onError: (err) => {
      if (err.data?.code === 'CONFLICT') {
        handleConflict();
      } else {
        message.error('恢复失败，请重试');
      }
    },
  });

  const savedConfig = useMemo(
    () => mergeConfig(stored?.value ?? {}),
    [stored?.value],
  );
  const [draft, setDraft] = useState<FrontendConfig>(savedConfig);
  const [editMode, setEditMode] = useState<EditMode>('visual');
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(savedConfig);
  }, [savedConfig]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedConfig),
    [draft, savedConfig],
  );

  const canSave = isDirty && !jsonError;

  const handleSave = useCallback(() => {
    if (jsonError) {
      void message.error('请先修正 JSON 格式错误');
      return;
    }
    saveMutation.mutate({ value: draft, expectedUpdatedAt });
  }, [saveMutation, draft, jsonError, message, expectedUpdatedAt]);

  const handleReset = useCallback(() => {
    modal.confirm({
      title: '恢复默认配置',
      content: '确定要恢复默认配置吗？所有自定义修改将丢失。',
      centered: true,
      onOk: () => {
        resetMutation.mutate({ value: {}, expectedUpdatedAt });
      },
    });
  }, [resetMutation, modal, expectedUpdatedAt]);

  const visualDisabledTip =
    jsonError && editMode === 'code' ? '请先修正 JSON 格式错误' : '';

  return (
    <Card
      extra={
        <Space>
          <Radio.Group
            buttonStyle="solid"
            onChange={(e) => setEditMode(e.target.value as EditMode)}
            size="middle"
            value={editMode}
          >
            <Tooltip title={visualDisabledTip}>
              <Radio.Button disabled={!!visualDisabledTip} value="visual">
                可视模式
              </Radio.Button>
            </Tooltip>
            <Radio.Button value="code">代码模式</Radio.Button>
          </Radio.Group>
          <Button
            danger
            loading={resetMutation.isPending}
            onClick={handleReset}
          >
            恢复默认
          </Button>
          <Button
            disabled={!canSave}
            loading={saveMutation.isPending}
            onClick={handleSave}
            type="primary"
          >
            保存配置
          </Button>
        </Space>
      }
      title="门户配置"
    >
      <Spin spinning={isLoading}>
        <ConfigEditor
          mode={editMode}
          onChange={(v) => setDraft(v as FrontendConfig)}
          onValidityChange={setJsonError}
          schema={frontendConfigSchema}
          value={draft}
        />
      </Spin>
    </Card>
  );
}
