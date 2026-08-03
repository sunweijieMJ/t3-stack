import dayjs from 'dayjs';

export type XlsxCellValue = string | number | boolean | Date | null | undefined;

export type XlsxColumn<T> = {
  /** 表头显示文本 */
  header: string;
  /** 列宽（字符数）；省略则按内容自动估算 */
  width?: number;
  /** 取值器：优先级高于 dataIndex */
  accessor?: (row: T) => XlsxCellValue;
  /** 字段名，accessor 缺省时按此从 row 取值 */
  dataIndex?: keyof T;
};

export type ExportXlsxOptions<T> = {
  /** 文件名（不需带 .xlsx 后缀，自动追加时间戳） */
  filename: string;
  sheetName?: string;
  columns: XlsxColumn<T>[];
  rows: T[];
};

const HEADER_FILL_COLOR = 'FF7C3AED';
const HEADER_FONT_COLOR = 'FFFFFFFF';
const BORDER_COLOR = 'FFE5E7EB';

function getCellValue<T>(row: T, col: XlsxColumn<T>): XlsxCellValue {
  if (col.accessor) return col.accessor(row);
  if (col.dataIndex) return row[col.dataIndex] as XlsxCellValue;
  return undefined;
}

// 中文字符按 2 个英文字符宽度计算
function estimateWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    w += ch.charCodeAt(0) > 255 ? 2 : 1;
  }
  return w;
}

function computeColumnWidth<T>(col: XlsxColumn<T>, rows: T[]): number {
  if (col.width) return col.width;
  let max = estimateWidth(col.header);
  for (const row of rows) {
    const v = getCellValue(row, col);
    if (v == null) continue;
    const text =
      v instanceof Date ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : String(v);
    const w = estimateWidth(text);
    if (w > max) max = w;
  }
  // 上下限：8 ~ 60
  return Math.min(60, Math.max(8, max + 2));
}

export async function exportToXlsx<T>({
  filename,
  sheetName = 'Sheet1',
  columns,
  rows,
}: ExportXlsxOptions<T>): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);

  // key 用列索引而非表头文本：避免两列表头相同时 key 冲突导致丢列
  ws.columns = columns.map((col, i) => ({
    header: col.header,
    key: `col_${i}`,
    width: computeColumnWidth(col, rows),
  }));

  // 数据行
  for (const row of rows) {
    const values: Record<string, XlsxCellValue> = {};
    columns.forEach((col, i) => {
      values[`col_${i}`] = getCellValue(row, col);
    });
    ws.addRow(values);
  }

  // 表头样式
  const headerRow = ws.getRow(1);
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR }, size: 12 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: HEADER_FILL_COLOR },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: BORDER_COLOR } },
      bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
      left: { style: 'thin', color: { argb: BORDER_COLOR } },
      right: { style: 'thin', color: { argb: BORDER_COLOR } },
    };
  });

  // 数据行边框 + 上下居中（横向左对齐）
  for (let i = 2; i <= rows.length + 1; i++) {
    const row = ws.getRow(i);
    row.eachCell((cell) => {
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: false,
      };
      cell.border = {
        top: { style: 'hair', color: { argb: BORDER_COLOR } },
        bottom: { style: 'hair', color: { argb: BORDER_COLOR } },
        left: { style: 'hair', color: { argb: BORDER_COLOR } },
        right: { style: 'hair', color: { argb: BORDER_COLOR } },
      };
    });
  }

  // 冻结首行
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`;
  a.click();
  // 不能紧跟着 click() 同步 revoke：部分浏览器（Firefox / Safari）在 click 返回时
  // 还没真正开始读这个 blob，URL 一撤销就下载到一个空文件或直接失败。
  // 挪到下一个宏任务，等下载线程接手之后再释放。
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
