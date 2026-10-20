export type RawCell = string | number | null;

export interface RawTable {
  headers: string[];
  rows: RawCell[][];
}

export type ColumnType = "number" | "date" | "category" | "text";

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
  | { kind: "lookup"; lookupId: string; /** Column header in the master table */ column: string };

/** A master table joined by key (e.g. store code → store name). Kept with the dashboard so it survives data replacement. */
export interface Lookup {
  id: string;
  fileName: string;
  table: RawTable;
  /** Key column in the master table */
  masterKey: string;
  /** Key column in the dashboard data */
  localKey: string;
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
  pageSize: number;
}

export type Widget = KpiWidget | BarWidget | TimeWidget | HistogramWidget | ScatterWidget | PivotWidget | TableWidget;
export type WidgetKind = Widget["kind"];

export type Filter =
  | { id: string; column: string; kind: "values"; values: string[] }
  | { id: string; column: string; kind: "range"; min: number | null; max: number | null };

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
}

export interface DashboardSummary {
  id: string;
  name: string;
  updatedAt: number;
  rowCount: number;
  fileName: string;
}

/** Column values after coercion. Numbers and dates use NaN for blanks; dates are UTC epoch ms. */
export type ColumnValues =
  | { type: "number"; values: Float64Array }
  | { type: "date"; values: Float64Array }
  | { type: "category" | "text"; values: (string | null)[] };

export interface Frame {
  rowCount: number;
  columns: Map<string, ColumnValues>;
  meta: Map<string, ColumnMeta>;
  /** Calculated columns that could not be computed, with the reason. */
  errors: Map<string, string>;
}
