import type { ResolvedBucket } from "./aggregate";
import type { Agg, ColumnMeta, ColumnType, Measure, NumberStyle, Widget } from "./types";

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
  date: "日付・日時",
  time: "時刻",
  duration: "時間の長さ",
  boolean: "真偽値（はい/いいえ）",
  category: "カテゴリ",
  text: "テキスト",
};

/** Where space is tight (badges, tables). */
export const TYPE_SHORT_LABEL: Record<ColumnType, string> = {
  number: "数値",
  date: "日付",
  time: "時刻",
  duration: "時間",
  boolean: "真偽値",
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

let numberStyle: NumberStyle = "en";

/** Module-level because number formatting is called from many places; set once per dashboard theme. */
export function setNumberStyle(style: NumberStyle | undefined): void {
  numberStyle = style ?? "en";
}

export function getNumberStyle(): NumberStyle {
  return numberStyle;
}

const EN_UNITS: [number, string][] = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "k"],
];

function compactEn(v: number): string {
  const abs = Math.abs(v);
  let i = EN_UNITS.findIndex(([base]) => abs >= base);
  let [base, unit] = EN_UNITS[i];
  let n = Math.round((abs / base) * 10) / 10;
  // 999.96k rounds up to 1000k: move to the next unit.
  if (n >= 1000 && i > 0) {
    i -= 1;
    [base, unit] = EN_UNITS[i];
    n = Math.round((abs / base) * 10) / 10;
  }
  return `${v < 0 ? "-" : ""}${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}${unit}`;
}

/** Compact form of a number in the current style, or null when it stays in full digits. */
function compactBody(v: number): string | null {
  const abs = Math.abs(v);
  if (numberStyle === "en" && abs >= 1000) return compactEn(v);
  if (numberStyle === "ja" && abs >= 10000) return compact.format(v);
  return null;
}

export function formatNumber(v: number, meta?: ColumnMeta | null, style: "full" | "compact" = "full"): string {
  if (Number.isNaN(v)) return "—";
  const prefix = meta?.format.prefix ?? "";
  const suffix = meta?.format.suffix ?? "";
  let body: string;
  const short = style === "compact" ? compactBody(v) : null;
  if (short !== null) body = short;
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

/** Time of day in seconds as "09:05"; seconds only when they are not zero. */
export function formatTimeOfDay(sec: number): string {
  if (Number.isNaN(sec)) return "—";
  const t = ((Math.round(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${pad(h)}:${pad(m)}${s ? `:${pad(s)}` : ""}`;
}

const DURATION_UNITS: [number, string][] = [
  [86400, "日"],
  [3600, "時間"],
  [60, "分"],
  [1, "秒"],
];

/** Length of time in seconds: "1時間23分" in full style, "1.5時間" (one unit, ≤1 decimal) for axis ticks. */
export function formatDuration(sec: number, style: "full" | "compact" = "full"): string {
  if (Number.isNaN(sec)) return "—";
  const sign = sec < 0 ? "-" : "";
  const abs = Math.abs(sec);
  if (style === "compact") {
    let i = DURATION_UNITS.findIndex(([base]) => abs >= base);
    if (i < 0) i = DURATION_UNITS.length - 1;
    let n = Math.round((abs / DURATION_UNITS[i][0]) * 10) / 10;
    // 59.97 min rounds to 60 min: move up to hours.
    if (i > 0 && n * DURATION_UNITS[i][0] >= DURATION_UNITS[i - 1][0]) {
      i -= 1;
      n = Math.round((abs / DURATION_UNITS[i][0]) * 10) / 10;
    }
    return `${n === 0 ? "" : sign}${n}${DURATION_UNITS[i][1]}`;
  }
  const r = Math.round(abs * 100) / 100;
  if (r < 60) return `${r === 0 ? "" : sign}${r}秒`;
  let rest = Math.round(abs);
  const parts: number[] = [];
  for (const [base] of DURATION_UNITS) {
    parts.push(Math.floor(rest / base));
    rest %= base;
  }
  const first = parts.findIndex((x) => x > 0);
  let out = `${sign}${parts[first]}${DURATION_UNITS[first][1]}`;
  if (first < parts.length - 1 && parts[first + 1] > 0) out += `${parts[first + 1]}${DURATION_UNITS[first + 1][1]}`;
  return out;
}

const percent = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });

/** Cell / tick value of a column in its own type. */
export function formatValue(v: number, meta?: ColumnMeta | null, style: "full" | "compact" = "full"): string {
  if (!meta) return formatNumber(v, null, style);
  if (Number.isNaN(v)) return "—";
  switch (meta.type) {
    case "date":
      return formatDate(v, meta.dateUnit === "year" ? "year" : "datetime");
    case "time":
      return formatTimeOfDay(v);
    case "duration":
      return formatDuration(v, style);
    case "boolean":
      return v ? "はい" : "いいえ";
    default:
      return formatNumber(v, meta, style);
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
  if (col?.type === "time") return formatTimeOfDay(v);
  if (col?.type === "duration") return formatDuration(v, style);
  if (col?.type === "boolean") return m.agg === "avg" ? `${percent.format(v * 100)}%` : formatNumber(v, null, style);
  if (m.agg === "avg" && col && col.format.decimals === 0) {
    return formatNumber(v, { ...col, format: { ...col.format, decimals: null } }, style);
  }
  return formatNumber(v, col, style);
}

function unitOf(col: ColumnMeta | undefined): string {
  return (col?.format.suffix || col?.format.prefix || "").trim();
}

function withUnit(title: string, unit: string): string {
  return unit ? `${title}（${unit}）` : title;
}

/** Axis title for a measure: its label plus the column's unit, e.g. "売上金額の合計（円）". */
export function measureAxisTitle(m: Measure, meta: Map<string, ColumnMeta>): string {
  if (m.agg === "count" || m.agg === "distinct" || !m.column) return measureLabel(m, meta);
  const col = meta.get(m.column);
  if (col?.type === "boolean") return withUnit(measureLabel(m, meta), m.agg === "avg" ? "%" : "");
  return withUnit(measureLabel(m, meta), col?.type === "number" ? unitOf(col) : "");
}

/** Axis title for a plain column, with its unit when it has one. */
export function columnAxisTitle(meta: ColumnMeta | null | undefined, fallback = ""): string {
  return meta ? withUnit(meta.label, meta.type === "number" ? unitOf(meta) : "") : fallback;
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
      if (w.series?.length) {
        const names = w.series.map((k) => columnLabel(meta, k));
        return `${names.length <= 3 ? names.join("・") : `${names.slice(0, 2).join("・")} ほか${names.length - 2}列`}の推移`;
      }
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
