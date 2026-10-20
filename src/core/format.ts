import type { ResolvedBucket } from "./aggregate";
import type { Agg, ColumnMeta, ColumnType, Measure, Widget } from "./types";

export const AGG_LABEL: Record<Agg, string> = {
  count: "件数",
  sum: "合計",
  avg: "平均",
  min: "最小",
  max: "最大",
  distinct: "ユニーク数",
};

export const TYPE_LABEL: Record<ColumnType, string> = {
  number: "数値",
  date: "日付",
  category: "カテゴリ",
  text: "テキスト",
};

export const BUCKET_LABEL: Record<ResolvedBucket | "auto", string> = {
  auto: "自動",
  day: "日",
  week: "週",
  month: "月",
  quarter: "四半期",
  year: "年",
};

const full = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("ja-JP", { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(v: number, meta?: ColumnMeta | null, style: "full" | "compact" = "full"): string {
  if (Number.isNaN(v)) return "—";
  const prefix = meta?.format.prefix ?? "";
  const suffix = meta?.format.suffix ?? "";
  let body: string;
  if (style === "compact" && Math.abs(v) >= 10000) body = compact.format(v);
  else if (meta && meta.format.decimals !== null) {
    body = v.toLocaleString("ja-JP", { minimumFractionDigits: meta.format.decimals, maximumFractionDigits: meta.format.decimals });
  } else body = full.format(v);
  return `${prefix}${body}${suffix}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDate(t: number, bucket: ResolvedBucket | "datetime" = "day"): string {
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  switch (bucket) {
    case "year":
      return `${y}年`;
    case "quarter":
      return `${y}年 Q${Math.floor((m - 1) / 3) + 1}`;
    case "month":
      return `${y}年${m}月`;
    case "week":
      return `${y}/${pad(m)}/${pad(d.getUTCDate())}週`;
    case "day":
      return `${y}/${pad(m)}/${pad(d.getUTCDate())}`;
    case "datetime": {
      const date = `${y}/${pad(m)}/${pad(d.getUTCDate())}`;
      const hasTime = d.getUTCHours() || d.getUTCMinutes() || d.getUTCSeconds();
      return hasTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
    }
  }
}

/** Short axis tick label for a bucket start. */
export function formatTick(t: number, bucket: ResolvedBucket): string {
  const d = new Date(t);
  const m = d.getUTCMonth() + 1;
  switch (bucket) {
    case "year":
      return `${d.getUTCFullYear()}`;
    case "quarter":
      return `${d.getUTCFullYear()} Q${Math.floor((m - 1) / 3) + 1}`;
    case "month":
      return m === 1 ? `${d.getUTCFullYear()}/1` : `${m}月`;
    default:
      return `${m}/${d.getUTCDate()}`;
  }
}

export function columnLabel(meta: Map<string, ColumnMeta> | ColumnMeta[], key: string | null): string {
  if (!key) return "";
  const m = Array.isArray(meta) ? meta.find((c) => c.key === key) : meta.get(key);
  return m?.label ?? key;
}

/** "件数" means the row count, unless the data has its own column called 件数. */
function countLabel(meta: Map<string, ColumnMeta> | ColumnMeta[]): string {
  const cols = Array.isArray(meta) ? meta : [...meta.values()];
  return cols.some((c) => c.label === "件数") ? "行数" : "件数";
}

export function measureLabel(m: Measure, meta: Map<string, ColumnMeta> | ColumnMeta[]): string {
  if (m.agg === "count" || !m.column) return countLabel(meta);
  return `${columnLabel(meta, m.column)}の${AGG_LABEL[m.agg]}`;
}

/** Value formatting for a measure result (counts never inherit the column's unit). */
export function formatMeasure(v: number, m: Measure, meta: Map<string, ColumnMeta>, style: "full" | "compact" = "full"): string {
  if (m.agg === "count" || m.agg === "distinct" || !m.column) return formatNumber(v, null, style);
  const col = meta.get(m.column);
  if (col?.type === "date") return formatDate(v, col.dateUnit === "year" ? "year" : "day");
  if (m.agg === "avg" && col && col.format.decimals === 0) {
    return formatNumber(v, { ...col, format: { ...col.format, decimals: null } }, style);
  }
  return formatNumber(v, col, style);
}

/** "地域別の" — but "種別ごとの" so 別 is not doubled. */
function byLabel(label: string): string {
  return label.endsWith("別") ? `${label}ごとの` : `${label}別の`;
}

export function widgetTitle(w: Widget, meta: Map<string, ColumnMeta> | ColumnMeta[]): string {
  if (w.title.trim()) return w.title;
  switch (w.kind) {
    case "kpi":
      return measureLabel(w.measure, meta);
    case "bar":
      return `${byLabel(columnLabel(meta, w.dimension))}${measureLabel(w.measure, meta)}`;
    case "time": {
      const base = `${measureLabel(w.measure, meta)}の推移`;
      return w.split ? `${byLabel(columnLabel(meta, w.split))}${base}` : base;
    }
    case "histogram":
      return `${columnLabel(meta, w.column)}の分布`;
    case "scatter":
      return `${columnLabel(meta, w.x)}と${columnLabel(meta, w.y)}の関係`;
    case "pivot":
      return `${columnLabel(meta, w.rows)} × ${columnLabel(meta, w.cols)}の${measureLabel(w.measure, meta)}`;
    case "table":
      return "データ一覧";
  }
}
