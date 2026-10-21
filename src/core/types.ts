export type RawCell = string | number | null;

export interface RawTable {
  headers: string[];
  rows: RawCell[][];
}

export type ColumnType = "number" | "date" | "time" | "duration" | "boolean" | "category" | "text";

/** Per-column conversion options. Undefined fields (or an undefined `parse`) mean automatic. */
export interface ColumnParse {
  /** number: "1.234,5" style (comma = decimal separator, dot/space = grouping). */
  decimalComma?: boolean;
  /** number/duration: multiply converted values (e.g. 1000 for values written in 千円). */
  scale?: number;
  /** date */
  dateFormat?: "auto" | "ymd" | "mdy" | "dmy" | "unix-s" | "unix-ms" | "excel" | "pattern";
  /** date/time with format "pattern". Tokens: YYYY YY MM M DD D hh h mm m ss s; any other char is a literal. */
  pattern?: string;
  /** time: "hm" = "9:30" / "0930" / "9時30分" → 09:30:00; "hms" requires seconds; auto accepts both. */
  timeFormat?: "auto" | "hm" | "hms" | "pattern";
  /** duration: unit of bare numbers ("90"), default seconds. */
  durationUnit?: "ms" | "s" | "min" | "h" | "d";
  /** duration: whether "12:34" means hours:minutes (default) or minutes:seconds. "1:02:03" is always h:m:s. */
  durationColon?: "hm" | "ms";
  /** boolean: extra spellings (compared case-insensitively after NFKC + trim). */
  trueValues?: string[];
  falseValues?: string[];
  /** category/text */
  trim?: boolean;
  /** NFKC (全角英数→半角) */
  widthNormalize?: boolean;
  letterCase?: "none" | "upper" | "lower";
}

export interface NumberFormat {
  prefix: string;
  suffix: string;
  /** null = automatic */
  decimals: number | null;
}

export type DatePart = "year" | "quarter" | "month" | "yearmonth" | "weekday" | "day" | "hour";

export type Derivation =
  | { kind: "formula"; /** Column references are stored as [key] */ expr: string }
  | { kind: "datepart"; source: string; part: DatePart }
  | { kind: "lookup"; lookupId: string; /** Column header in the master table */ column: string }
  | { kind: "datecompose"; parts: DateParts };

/** Columns holding the pieces of a timestamp that is split across columns (null = not used). */
export interface DateParts {
  year: string;
  month: string | null;
  day: string | null;
  hour: string | null;
  minute: string | null;
}

/** A master table joined by key (e.g. store code → store name). Kept with the dashboard so it survives data replacement. */
export interface Lookup {
  id: string;
  fileName: string;
  table: RawTable;
  /** Key columns in the master table; several columns form a composite key (e.g. 店舗コード + 月). */
  masterKeys: string[];
  /** Matching key columns in the dashboard data, same order as masterKeys. */
  localKeys: string[];
  /** Saved before composite keys existed. */
  masterKey?: string;
  localKey?: string;
}

export interface ColumnMeta {
  /** Stable identifier: the original header text. Used to match columns when data is replaced. */
  key: string;
  label: string;
  type: ColumnType;
  inferredType: ColumnType;
  hidden: boolean;
  /** Identifier-like column (order IDs, codes). Excluded from automatic measures. */
  idLike: boolean;
  format: NumberFormat;
  /** Calculated column: values are computed from other columns, never read from the file. */
  derived?: Derivation;
  /** Explicit value order for categories (weekdays, months). */
  order?: string[];
  /** Date columns holding only a year (e.g. "1750") display and convert as years. */
  dateUnit?: "year";
  /** How raw cells are converted; undefined = automatic. */
  parse?: ColumnParse;
  /** What inference chose for `parse`; "自動判定に戻す" restores it together with the type. */
  inferredParse?: ColumnParse;
  /** Short Japanese reason for the inferred type. */
  inferredReason?: string;
}

export type Agg = "count" | "sum" | "avg" | "min" | "max" | "distinct";

export interface Measure {
  agg: Agg;
  /** null only when agg is "count" */
  column: string | null;
}

export type Span = 1 | 2 | 3 | 4;

interface WidgetBase {
  id: string;
  /** Empty string = generated from the widget settings */
  title: string;
  span: Span;
  /** Palette slot (0-7) for single-series charts; undefined = slot 0 */
  color?: number;
  /** Show value-axis titles with units on charts; undefined = shown */
  axisTitles?: boolean;
}

export type CompareBucket = "day" | "week" | "month" | "quarter" | "year";

export interface KpiCompare {
  dateColumn: string;
  bucket: CompareBucket;
  /** Whether an increase is a good thing (colors the change). */
  upIsGood: boolean;
}

export interface KpiWidget extends WidgetBase {
  kind: "kpi";
  measure: Measure;
  /** Show the latest period against the previous one. */
  compare?: KpiCompare | null;
}

export type BarSort = "value-desc" | "value-asc" | "label";

export interface BarWidget extends WidgetBase {
  kind: "bar";
  dimension: string;
  measure: Measure;
  limit: number;
  sort: BarSort;
}

export type TimeBucket = "auto" | "day" | "week" | "month" | "quarter" | "year";

export interface TimeWidget extends WidgetBase {
  kind: "time";
  dateColumn: string;
  bucket: TimeBucket;
  measure: Measure;
  split: string | null;
  /** Several numeric columns side by side (wide data such as one column per prefecture). Overrides split. */
  series?: string[] | null;
  mark: "line" | "column";
}

export interface HistogramWidget extends WidgetBase {
  kind: "histogram";
  column: string;
}

export interface ScatterWidget extends WidgetBase {
  kind: "scatter";
  x: string;
  y: string;
  colorBy: string | null;
}

export interface PivotWidget extends WidgetBase {
  kind: "pivot";
  rows: string;
  cols: string;
  measure: Measure;
}

export interface TableWidget extends WidgetBase {
  kind: "table";
  /** null = every visible column */
  columns: string[] | null;
  /** Full column order including unchecked columns. Without it, `columns` (then column-settings order) decides. */
  order?: string[];
  pageSize: number;
  /** Initial sort; header clicks in the viewer stay local. */
  sort?: { key: string; dir: 1 | -1 } | null;
  /** Per-column filter row (default on). */
  filterRow?: boolean;
  rowNumbers?: boolean;
  /** Wrap long cell text instead of truncating. */
  wrap?: boolean;
}

export type Widget = KpiWidget | BarWidget | TimeWidget | HistogramWidget | ScatterWidget | PivotWidget | TableWidget;
export type WidgetKind = Widget["kind"];

export type Filter =
  | { id: string; column: string; kind: "values"; values: string[] }
  | {
      id: string;
      column: string;
      kind: "range";
      min: number | null;
      max: number | null;
      /** Relative date range, recomputed from the data's latest date every time (min/max are ignored). */
      preset?: DatePreset | null;
    };

export type DatePreset = "last-month" | "last-30" | "last-90" | "latest-year";

export interface DataSource {
  fileName: string;
  /** Files appended after the first one. */
  appended?: string[];
  sheetName: string | null;
  importedAt: number;
  rowCount: number;
}

export interface Dashboard {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  source: DataSource;
  columns: ColumnMeta[];
  widgets: Widget[];
  filters: Filter[];
  /** Missing in dashboards created before themes existed. */
  theme?: Theme;
  lookups?: Lookup[];
}

export type SurfaceTheme = "warm" | "white" | "dark";
export type NumberStyle = "en" | "ja" | "full";
export type PaletteName = "calm" | "vivid" | "custom";

export interface Theme {
  surface: SurfaceTheme;
  /** null = the surface's default accent */
  accent: string | null;
  palette: PaletteName;
  customColors: string[];
  density: "comfortable" | "compact";
  radius: "standard" | "small" | "none";
  fontSize: "standard" | "large";
  /** Add line patterns / dash styles to multi-series charts. Always on when printing. */
  texture?: boolean;
  /** How large numbers are abbreviated on charts. Missing = "en". */
  numberStyle?: NumberStyle;
}

export interface DashboardSummary {
  id: string;
  name: string;
  updatedAt: number;
  rowCount: number;
  fileName: string;
}

/**
 * Column values after coercion. Float types use NaN for blanks; dates are UTC epoch ms,
 * time is seconds since 00:00, duration is seconds, boolean is 1 / 0.
 */
export type ColumnValues =
  | { type: "number" | "date" | "time" | "duration" | "boolean"; values: Float64Array }
  | { type: "category" | "text"; values: (string | null)[] };

export interface Frame {
  rowCount: number;
  columns: Map<string, ColumnValues>;
  meta: Map<string, ColumnMeta>;
  /** Calculated columns that could not be computed, with the reason. */
  errors: Map<string, string>;
}
