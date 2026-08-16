'use client';

import { App, Button, Card, Radio, Space, Spin, Tooltip } from 'antd';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import ConfigEditor, { type EditMode } from '@/components/ConfigEditor';
import { frontendConfigSchema } from '@/constants/frontend-config';
import { type FrontendConfig, mergeConfig } from '@/lib/frontend-config';
import { api } from '@/lib/trpc/react';

type ZodFieldErrors = Record<string, string[] | undefined>;

// 把服务端 zod 校验失败翻译成「哪个配置分区 + 什么原因」。
// zod 的 flatten() 只保留 path[0]，所以粒度是 section（basic / seo / footer / social），
// 已经足够定位；不做这层展示的话，URL 协议与长度校验命中时用户只会看到笼统的
// 「保存失败，请重试」，根本不知道是哪个字段填错了。
function describeValidationError(
  fieldErrors: ZodFieldErrors | undefined | null,
): string | null {
  if (!fieldErrors) return null;
  const parts = Object.entries(fieldErrors).map(([key, messages]) => {
    const section =
      frontendConfigSchema[key as keyof typeof frontendConfigSchema];
    const label = section?.title ?? key;
    const reason = messages?.[0];
    return reason ? `${label}「${reason}」` : label;
  });
  return parts.length > 0 ? `配置校验失败：${parts.join('；')}` : null;
}

/**
 * draft 当前所基于的那一份服务端配置 —— 内容与版本号必须成对推进。
 *
 * 之所以要把它显式存下来，而不是直接用 query 的最新值：两者一旦混为一谈，
 * 后台刷新（refetchOnWindowFocus 是 react-query 的默认行为）就会同时做两件坏事 ——
 * 把管理员没保存的草稿整个覆盖掉，并把 expectedUpdatedAt 悄悄推进到最新版本，
 * 于是 routers/page.ts 里那套乐观锁在这条路径上永远不会触发：A 保存过之后，
 * B 接着保存不会收到 CONFLICT，而是直接把 A 的改动冲掉，两边都毫无察觉。
 */
interface ConfigBaseline {
  config: FrontendConfig;
  /** 乐观锁版本号；null 表示配置尚未落库过（首次保存走 insert 分支） */
  updatedAt: string | null;
}

const toIsoOrNull = (value: Date | string | null | undefined): string | null =>
  value instanceof Date ? value.toISOString() : (value ?? null);

export default function AdminSettingPage() {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const {
    data: stored,
    isLoading,
    refetch,
  } = api.page.getFrontendConfig.useQuery();

  /**
   * 保存后除了 refetch 本页数据，还要 router.refresh()。
   *
   * 侧边栏站点名与 antd 主题色现在由 admin/layout 在服务端读取后按 props 注入
   * （见那边的说明），不再是本页 query 的衍生值 —— 只 refetch 的话，配置存进去了、
   * 顶部和侧边栏却纹丝不动，看起来就像没保存成功。
   * 服务端已在 saveFrontendConfig 里 revalidateTag，refresh 拿到的是新值。
   */
  const syncSaved = useCallback(() => {
    void refetch();
    router.refresh();
  }, [refetch, router]);
  const [baseline, setBaseline] = useState<ConfigBaseline>(() => ({
    config: mergeConfig({}),
    updatedAt: null,
  }));
  const [draft, setDraft] = useState<FrontendConfig>(() => mergeConfig({}));

  // 保存/重置时回传给后端的乐观锁版本号：取基线而不是 query 的最新值，
  // 这样「本地有未保存修改期间服务端被别人改了」会如实撞上 CONFLICT。
  const expectedUpdatedAt = baseline.updatedAt;
  const savedConfig = baseline.config;

  const adopt = useCallback(
    (value: unknown, updatedAt: Date | string | null | undefined) => {
      const next = mergeConfig((value ?? {}) as Partial<FrontendConfig>);
      setBaseline({ config: next, updatedAt: toIsoOrNull(updatedAt) });
      setDraft(next);
    },
    [],
  );

  // CONFLICT 是用户主动点保存后才会收到的显式错误，此时拉取并采用最新版本 ——
  // 本地草稿会被替换，所以文案必须说清楚，不能让人以为改动还在。
  const handleConflict = useCallback(async () => {
    const { data } = await refetch();
    if (data) adopt(data.value, data.updatedAt);
    message.error(
      '配置已被其他管理员修改，已为你拉取最新版本，本次未保存的修改已被替换',
    );
  }, [refetch, adopt, message]);

  // CONFLICT → 拉最新版本；校验失败 → 指出具体分区与原因；其余 → 场景兜底文案
  const buildErrorHandler = useCallback(
    (fallback: string) =>
      (err: {
        data?: {
          code?: string;
          zodError?: { fieldErrors?: ZodFieldErrors } | null;
        } | null;
      }) => {
        if (err.data?.code === 'CONFLICT') {
          void handleConflict();
          return;
        }
        message.error(
          describeValidationError(err.data?.zodError?.fieldErrors) ?? fallback,
        );
      },
    [handleConflict, message],
  );

  // 保存成功后直接用服务端回传的值与新版本号推进基线：不能等 refetch 回来再推进，
  // 否则中间这段时间里草稿相对旧基线是「脏」的，下面的 effect 会把这次自己的保存
  // 误判成他人修改并弹警告。
  const saveMutation = api.page.saveFrontendConfig.useMutation({
    onSuccess: (res) => {
      message.success('配置已保存');
      adopt(res.value, res.updatedAt);
      syncSaved();
    },
    onError: buildErrorHandler('保存失败，请重试'),
  });
  const resetMutation = api.page.saveFrontendConfig.useMutation({
    onSuccess: (res) => {
      message.success('已恢复默认配置');
      adopt(res.value, res.updatedAt);
      syncSaved();
    },
    onError: buildErrorHandler('恢复失败，请重试'),
  });

  const [editMode, setEditMode] = useState<EditMode>('visual');
  const [jsonError, setJsonError] = useState<string | null>(null);

  /**
   * 把服务端数据同步进基线，但**绝不覆盖未保存的草稿**。
   *
   * 早退条件是版本号相同：后台刷新在绝大多数时候拿回的是同一个版本，直接什么都不做。
   * 版本确实变了（他人保存过）时分两种情况：草稿干净就静默采用；草稿脏则保留用户的
   * 修改并提示，同时**不推进基线版本号** —— 这样他点保存时服务端会如实抛 CONFLICT，
   * 走上面 handleConflict 那条显式路径，而不是悄悄把别人的改动覆盖掉。
   */
  useEffect(() => {
    if (!stored) return;
    const serverUpdatedAt = toIsoOrNull(stored.updatedAt);
    if (serverUpdatedAt === baseline.updatedAt) return;

    // 首次拿到真实版本（基线还停在初始默认值）时无条件采用
    if (baseline.updatedAt === null) {
      adopt(stored.value, stored.updatedAt);
      return;
    }

    if (JSON.stringify(draft) !== JSON.stringify(baseline.config)) {
      message.warning(
        '配置已被其他管理员修改。你的本地修改仍保留在页面上，保存时会提示冲突。',
      );
      return;
    }
    adopt(stored.value, stored.updatedAt);
  }, [stored, baseline, draft, adopt, message]);

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
