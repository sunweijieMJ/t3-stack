'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import CodeMirror from '@uiw/react-codemirror';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  ColorPicker,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Rate,
  Row,
  Segmented,
  Select,
  Slider,
  Space,
  Switch,
  TimePicker,
  theme,
} from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageUploader } from '@/components/ImageUploader';
import {
  extractDefaults,
  type IObjectSchema,
  type IStringSchema,
  type JsonSchema,
} from '@/lib/frontend-config';
import type { LocaleKey } from '@/types/system';
import { LocaleList } from '@/types/system';

// ==================== 常量 ====================

const localeKeys = Object.keys(LocaleList).filter((k) =>
  Number.isNaN(Number(k)),
) as LocaleKey[];
const localeLabels: Record<string, string> = {
  'zh-CN': '中文',
  'en-US': 'English',
};

// ==================== 子组件 ====================

function I18nField({
  value,
  onChange,
  disabled,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const [activeLang, setActiveLang] = useState<string>(
    localeKeys[0] ?? 'zh-CN',
  );
  return (
    <Space.Compact style={{ width: '100%' }}>
      <Segmented
        onChange={(v) => setActiveLang(v as string)}
        options={localeKeys.map((k) => ({
          value: k,
          label: localeLabels[k] || k,
        }))}
        size="middle"
        value={activeLang}
      />
      <Input
        disabled={disabled}
        onChange={(e) => onChange({ ...value, [activeLang]: e.target.value })}
        style={{ flex: 1 }}
        value={value[activeLang] ?? ''}
      />
    </Space.Compact>
  );
}

interface SchemaFieldsProps {
  schema: Record<string, JsonSchema>;
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  disabled?: boolean;
}

function SchemaFields({
  schema,
  value,
  onChange,
  disabled,
}: SchemaFieldsProps) {
  const handleFieldChange = (key: string, fieldValue: any) => {
    onChange({ ...value, [key]: fieldValue });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: SchemaFields is a module-level function, always stable
  const renderField = useCallback(
    (
      fieldSchema: JsonSchema,
      fieldValue: any,
      onFieldChange: (v: any) => void,
    ) => {
      switch (fieldSchema.type) {
        case 'string': {
          if (fieldSchema.enumType && fieldSchema.inputType === 'radio') {
            return (
              <Radio.Group
                buttonStyle="solid"
                disabled={disabled}
                onChange={(e) => onFieldChange(e.target.value)}
                options={fieldSchema.enumType.map((v) => ({
                  value: v,
                  label: v,
                }))}
                optionType="button"
                value={fieldValue}
              />
            );
          }
          if (fieldSchema.inputType === 'i18n') {
            const i18nValue = (
              fieldValue && typeof fieldValue === 'object' ? fieldValue : {}
            ) as Record<string, string>;
            return (
              <I18nField
                disabled={disabled}
                onChange={onFieldChange}
                value={i18nValue}
              />
            );
          }
          if (fieldSchema.enumType) {
            return (
              <Select
                disabled={disabled}
                onChange={onFieldChange}
                options={fieldSchema.enumType.map((v) => ({
                  value: v,
                  label: v,
                }))}
                style={{ width: '100%' }}
                value={fieldValue}
              />
            );
          }
          if (fieldSchema.inputType === 'textarea') {
            return (
              <Input.TextArea
                disabled={disabled}
                onChange={(e) => onFieldChange(e.target.value)}
                rows={3}
                value={fieldValue}
              />
            );
          }
          if (fieldSchema.inputType === 'password') {
            return (
              <Input.Password
                disabled={disabled}
                onChange={(e) => onFieldChange(e.target.value)}
                value={fieldValue}
              />
            );
          }
          if (fieldSchema.inputType === 'color') {
            return (
              <ColorPicker
                disabled={disabled}
                onChange={(_, hex) => onFieldChange(hex)}
                showText
                value={fieldValue || undefined}
              />
            );
          }
          if (fieldSchema.inputType === 'image') {
            const moduleName =
              (fieldSchema as IStringSchema).uploadModule ?? 'portal';
            return (
              <ImageUploader
                accept="image"
                module={moduleName}
                onChange={(url) => onFieldChange(url ?? '')}
                value={fieldValue}
              />
            );
          }
          if (fieldSchema.inputType === 'file') {
            const moduleName =
              (fieldSchema as IStringSchema).uploadModule ?? 'portal';
            return (
              <ImageUploader
                accept="pdf"
                module={moduleName}
                onChange={(url) => onFieldChange(url ?? '')}
                value={fieldValue}
              />
            );
          }
          if (fieldSchema.inputType === 'url') {
            return (
              <Input
                disabled={disabled}
                onChange={(e) => onFieldChange(e.target.value)}
                placeholder="https://"
                type="url"
                value={fieldValue}
              />
            );
          }
          if (fieldSchema.inputType === 'date') {
            return (
              <DatePicker
                disabled={disabled}
                onChange={(_, d) => onFieldChange(d)}
                style={{ width: '100%' }}
                value={fieldValue ? dayjs(fieldValue) : null}
              />
            );
          }
          if (fieldSchema.inputType === 'time') {
            return (
              <TimePicker
                disabled={disabled}
                onChange={(_, t) => onFieldChange(t)}
                style={{ width: '100%' }}
                value={fieldValue ? dayjs(fieldValue, 'HH:mm:ss') : null}
              />
            );
          }
          if (fieldSchema.inputType === 'datetime') {
            return (
              <DatePicker
                disabled={disabled}
                onChange={(_, d) => onFieldChange(d)}
                showTime
                style={{ width: '100%' }}
                value={fieldValue ? dayjs(fieldValue) : null}
              />
            );
          }
          if (fieldSchema.inputType === 'daterange') {
            const dates = fieldValue ? String(fieldValue).split(',') : [];
            return (
              <DatePicker.RangePicker
                disabled={disabled}
                onChange={(_, ds) =>
                  onFieldChange(ds.filter(Boolean).join(','))
                }
                style={{ width: '100%' }}
                value={
                  dates.length === 2 && dates[0]
                    ? [dayjs(dates[0]), dayjs(dates[1] ?? '')]
                    : null
                }
              />
            );
          }
          if (fieldSchema.inputType === 'datetimerange') {
            const dates = fieldValue ? String(fieldValue).split(',') : [];
            return (
              <DatePicker.RangePicker
                disabled={disabled}
                onChange={(_, ds) =>
                  onFieldChange(ds.filter(Boolean).join(','))
                }
                showTime
                style={{ width: '100%' }}
                value={
                  dates.length === 2 && dates[0]
                    ? [dayjs(dates[0]), dayjs(dates[1] ?? '')]
                    : null
                }
              />
            );
          }
          return (
            <Input
              disabled={disabled}
              onChange={(e) => onFieldChange(e.target.value)}
              value={fieldValue}
            />
          );
        }

        case 'number': {
          if (fieldSchema.inputType === 'rate') {
            return (
              <Rate
                count={fieldSchema.max ?? 5}
                disabled={disabled}
                onChange={onFieldChange}
                value={fieldValue}
              />
            );
          }
          if (fieldSchema.inputType === 'slider') {
            return (
              <Slider
                disabled={disabled}
                max={fieldSchema.max ?? 100}
                min={fieldSchema.min ?? 0}
                onChange={onFieldChange}
                step={fieldSchema.step ?? 1}
                value={fieldValue}
              />
            );
          }
          return (
            <InputNumber
              disabled={disabled}
              max={fieldSchema.max}
              min={fieldSchema.min}
              onChange={(v) => onFieldChange(v ?? fieldSchema.defaultValue)}
              step={fieldSchema.step}
              style={{ width: '100%' }}
              value={fieldValue}
            />
          );
        }

        case 'boolean':
          return (
            <Switch
              checked={fieldValue}
              disabled={disabled}
              onChange={onFieldChange}
            />
          );

        case 'array': {
          const { items } = fieldSchema;
          const list = (fieldValue || []) as any[];

          if (
            items.type === 'string' &&
            fieldSchema.enumType &&
            fieldSchema.inputType === 'checkbox'
          ) {
            return (
              <Checkbox.Group
                disabled={disabled}
                onChange={onFieldChange as any}
                options={fieldSchema.enumType.map((v) => ({
                  value: v,
                  label: v,
                }))}
                value={list}
              />
            );
          }
          if (items.type === 'string' && fieldSchema.enumType) {
            return (
              <Select
                disabled={disabled}
                mode="multiple"
                onChange={onFieldChange}
                options={fieldSchema.enumType.map((v) => ({
                  value: v,
                  label: v,
                }))}
                style={{ width: '100%' }}
                value={list}
              />
            );
          }
          if (items.type === 'string') {
            return (
              <Select
                disabled={disabled}
                mode="tags"
                onChange={onFieldChange}
                placeholder="输入后回车添加"
                style={{ width: '100%' }}
                tokenSeparators={[',']}
                value={list}
              />
            );
          }

          const handleAdd = () => {
            const newItem =
              items.type === 'object'
                ? extractDefaults(items.properties)
                : items.type === 'number'
                  ? (items.defaultValue ?? 0)
                  : '';
            onFieldChange([...list, newItem]);
          };
          const handleRemove = (idx: number) =>
            onFieldChange(list.filter((_, i) => i !== idx));
          const handleItemChange = (idx: number, v: any) => {
            const next = [...list];
            next[idx] = v;
            onFieldChange(next);
          };

          if (items.type === 'number') {
            return (
              <div>
                {list.map((item, idx) => (
                  <Space key={idx} style={{ display: 'flex', marginBottom: 8 }}>
                    <InputNumber
                      disabled={disabled}
                      max={items.max}
                      min={items.min}
                      onChange={(v) => handleItemChange(idx, v ?? 0)}
                      step={items.step}
                      value={item}
                    />
                    <Button
                      danger
                      disabled={disabled}
                      icon={<DeleteOutlined />}
                      onClick={() => handleRemove(idx)}
                      size="small"
                    />
                  </Space>
                ))}
                <Button
                  block
                  disabled={disabled}
                  icon={<PlusOutlined />}
                  onClick={handleAdd}
                  type="dashed"
                >
                  添加
                </Button>
              </div>
            );
          }

          if (items.type === 'object') {
            return (
              <div>
                {list.map((item, idx) => (
                  <Card
                    extra={
                      <Button
                        danger
                        disabled={disabled}
                        icon={<DeleteOutlined />}
                        onClick={() => handleRemove(idx)}
                        size="small"
                        type="text"
                      />
                    }
                    key={idx}
                    size="small"
                    style={{ marginBottom: 8 }}
                    title={`${items.title} ${idx + 1}`}
                  >
                    <SchemaFields
                      disabled={disabled}
                      onChange={(v) => handleItemChange(idx, v)}
                      schema={items.properties}
                      value={item || {}}
                    />
                  </Card>
                ))}
                <Button
                  block
                  disabled={disabled}
                  icon={<PlusOutlined />}
                  onClick={handleAdd}
                  type="dashed"
                >
                  添加{items.title}
                </Button>
              </div>
            );
          }

          return null;
        }

        case 'object':
          return (
            <SchemaFields
              disabled={disabled}
              onChange={onFieldChange}
              schema={(fieldSchema as IObjectSchema).properties}
              value={fieldValue || {}}
            />
          );

        default:
          return <Input disabled value={String(fieldValue ?? '')} />;
      }
    },
    [disabled],
  );

  return (
    <Row gutter={[16, 0]}>
      {Object.entries(schema).map(([key, fieldSchema]) => {
        const fieldValue =
          value[key] ??
          (fieldSchema.type !== 'object'
            ? fieldSchema.defaultValue
            : undefined);
        const isBlock =
          fieldSchema.type === 'object' ||
          (fieldSchema.type === 'array' && fieldSchema.items.type !== 'string');
        const span = fieldSchema.span ?? (isBlock ? 24 : 12);

        if (isBlock) {
          return (
            <Col key={key} span={span}>
              <Card
                size="small"
                style={{ marginBottom: 16 }}
                title={fieldSchema.title}
              >
                {fieldSchema.description && (
                  <p
                    style={{
                      color: 'var(--ant-color-text-tertiary)',
                      marginBottom: 12,
                    }}
                  >
                    {fieldSchema.description}
                  </p>
                )}
                {renderField(fieldSchema, fieldValue, (v) =>
                  handleFieldChange(key, v),
                )}
              </Card>
            </Col>
          );
        }

        return (
          <Col key={key} span={span}>
            <Form.Item
              label={fieldSchema.title}
              style={{ marginBottom: 16 }}
              tooltip={fieldSchema.description}
            >
              {renderField(fieldSchema, fieldValue, (v) =>
                handleFieldChange(key, v),
              )}
            </Form.Item>
          </Col>
        );
      })}
    </Row>
  );
}

function SchemaForm({
  schema,
  value,
  onChange,
  disabled,
}: {
  schema: Record<string, JsonSchema>;
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  disabled?: boolean;
}) {
  return (
    <Form layout="vertical" size="middle">
      <SchemaFields
        disabled={disabled}
        onChange={onChange}
        schema={schema}
        value={value}
      />
    </Form>
  );
}

// ==================== 主组件 ====================

export type EditMode = 'visual' | 'code';

interface ConfigEditorProps {
  schema: Record<string, JsonSchema>;
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  /** 受控编辑模式 */
  mode: EditMode;
  /** JSON 错误提示通知父组件，用于禁用保存按钮 */
  onValidityChange?: (error: string | null) => void;
}

export default function ConfigEditor({
  schema,
  value,
  onChange,
  mode,
  onValidityChange,
}: ConfigEditorProps) {
  const { token } = theme.useToken();
  const isDark =
    token.colorBgBase === '#141414' || token.colorBgBase === '#000';
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify(value, null, 2),
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const skipSyncRef = useRef(false);

  // value 来自父组件 → 同步到 jsonText（跳过自身编辑触发的回流）
  useEffect(() => {
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    setJsonText(JSON.stringify(value, null, 2));
    setJsonError(null);
    onValidityChange?.(null);
  }, [value, onValidityChange]);

  // 切到 code 时用最新 value 重置文本，清掉残留错误
  // biome-ignore lint/correctness/useExhaustiveDependencies: 仅响应 mode 切换；value 变化由上方 effect 单独处理
  useEffect(() => {
    if (mode === 'code') {
      setJsonText(JSON.stringify(value, null, 2));
      setJsonError(null);
      onValidityChange?.(null);
    }
  }, [mode]);

  const handleCodeChange = useCallback(
    (text: string) => {
      setJsonText(text);
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null) {
          const msg = '配置必须是 JSON 对象';
          setJsonError(msg);
          onValidityChange?.(msg);
          return;
        }
        setJsonError(null);
        onValidityChange?.(null);
        skipSyncRef.current = true;
        onChange(parsed);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'JSON 格式错误';
        setJsonError(msg);
        onValidityChange?.(msg);
      }
    },
    [onChange, onValidityChange],
  );

  const codeExtensions = useMemo(() => [json()], []);

  return (
    <div>
      {mode === 'visual' ? (
        <SchemaForm onChange={onChange} schema={schema} value={value} />
      ) : (
        <>
          {jsonError && (
            <Alert
              description={jsonError}
              message="JSON 格式错误"
              showIcon
              style={{ marginBottom: 12 }}
              type="error"
            />
          )}
          <CodeMirror
            extensions={codeExtensions}
            height="calc(100vh - 320px)"
            onChange={handleCodeChange}
            style={{ borderRadius: 4, overflow: 'hidden' }}
            theme={isDark ? oneDark : undefined}
            value={jsonText}
          />
        </>
      )}
    </div>
  );
}
