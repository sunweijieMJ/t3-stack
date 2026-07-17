import { Tooltip, Typography } from 'antd';

const { Text } = Typography;

// 配合 column.ellipsis = { showTitle: false } 使用：
// 由 td 自身做截断，本组件只负责 hover 出 Antd Tooltip 显示完整内容
export function EllipsisCell({
  value,
  placeholder = '—',
}: {
  value: string | null | undefined;
  placeholder?: string;
}) {
  if (value == null || value === '') {
    return <Text type="secondary">{placeholder}</Text>;
  }
  return (
    <Tooltip placement="topLeft" title={value}>
      <span>{value}</span>
    </Tooltip>
  );
}
