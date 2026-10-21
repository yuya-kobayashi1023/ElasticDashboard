import { columnHasTime } from "./aggregate";
import { buildFrame } from "./frame";
import { isContinuousType, isDimensionType, isFloatType } from "./columnTypes";
import { cellToString, inferColumns, prefersAverage } from "./infer";
import { converterFor } from "./parsers";
import { newId } from "./id";
import type { ColumnMeta, ColumnType, Dashboard, DataSource, Filter, Frame, Measure, RawTable, Widget, WidgetKind } from "./types";

const MONEY_RE = /売上|金額|額|収益|利益|経費|費用|コスト|予算|amount|sales|revenue|cost|price|total|合計/i;
const QUANTITY_RE = /数量|個数|件数|qty|quantity|count/i;
const measureRank = (c: ColumnMeta) => (MONEY_RE.test(c.label) ? 2 : QUANTITY_RE.test(c.label) ? 1 : 0);

function distinctCount(frame: Frame, key: string): number {
  const col = frame.columns.get(key);
  if (!col) return 0;
  const set = new Set<string | number>();
  for (const v of col.values) {
    if (v === null || (typeof v === "number" && Number.isNaN(v))) continue;
    set.add(v);
    if (set.size > 1000) break;
  }
  return set.size;
}

export interface ColumnRoles {
  measures: ColumnMeta[];
  dimensions: ColumnMeta[];
  dates: ColumnMeta[];
  booleans: ColumnMeta[];
}

/** Lengths of time are measurements: averaged by default, like ratios and prices. */
const averaged = (c: ColumnMeta) => c.type === "duration" || prefersAverage(c);

export function columnRoles(columns: ColumnMeta[], frame: Frame): ColumnRoles {
  const usable = columns.filter((c) => !c.hidden && frame.columns.has(c.key));
  // A column with a single value (an export timestamp, a fixed flag) carries no information.
  const measures = usable
    .filter((c) => (c.type === "number" || c.type === "duration") && !c.idLike && distinctCount(frame, c.key) >= 2)
    .sort((a, b) => measureRank(b) - measureRank(a));
  const dimensions = usable
    .filter((c) => c.type === "category")
    .map((c) => ({ c, d: distinctCount(frame, c.key), digits: numericLooking(frame, c.key) }))
    .filter(({ d }) => d >= 2)
    .sort(
      (a, b) =>
        // Code-like categories (store codes etc.) are still useful groupings, but rank after named ones.
        Number(a.c.idLike) - Number(b.c.idLike) ||
        // Up to 60 groups (e.g. prefectures) all read fine in a top-10 bar chart; beyond that, fewer is better.
        Math.max(0, Math.log(a.d / 60)) - Math.max(0, Math.log(b.d / 60)) ||
        // Named values (都道府県) before digit labels (月, 日) — the sort is stable, so ties keep column order.
        Number(a.digits) - Number(b.digits),
    )
    .map(({ c }) => c);
  // Yes/no columns group like categories and read well as a share (avg of 1/0).
  const booleans = usable.filter((c) => c.type === "boolean" && distinctCount(frame, c.key) >= 2);
  const dates = usable.filter((c) => c.type === "date" && distinctCount(frame, c.key) >= 2);
  return { measures, dimensions: [...dimensions, ...booleans], dates, booleans };
}

/** Category columns whose values are all numbers (split dates, codes). */
function numericLooking(frame: Frame, key: string): boolean {
  const col = frame.columns.get(key);
  if (!col || (col.type !== "category" && col.type !== "text")) return false;
  let seen = 0;
  for (let i = 0; i < col.values.length && seen < 200; i++) {
    const v = col.values[i];
    if (v === null) continue;
    seen++;
    if (!/^\d+$/.test(v)) return false;
  }
  return seen > 0;
}

function measureFor(col: ColumnMeta | undefined): Measure {
  if (!col) return { agg: "count", column: null };
  return { agg: averaged(col) ? "avg" : "sum", column: col.key };
}

export function autoWidgets(columns: ColumnMeta[], frame: Frame): Widget[] {
  const { measures, dimensions, dates, booleans } = columnRoles(columns, frame);
  const widgets: Widget[] = [];
  widgets.push({ id: newId(), kind: "kpi", title: "", span: 1, measure: { agg: "count", column: null } });
  for (const m of measures.slice(0, 3)) widgets.push({ id: newId(), kind: "kpi", title: "", span: 1, measure: measureFor(m) });
  // Fill the 4-column KPI row so it reads as one band.
  const kpiExtras: Measure[] = [];
  if (measures[0] && measureFor(measures[0]).agg === "sum") kpiExtras.push({ agg: "avg", column: measures[0].key });
  if (booleans[0]) kpiExtras.push({ agg: "avg", column: booleans[0].key });
  if (dimensions[0]) kpiExtras.push({ agg: "distinct", column: dimensions[0].key });
  while (widgets.length < 4 && kpiExtras.length) widgets.push({ id: newId(), kind: "kpi", title: "", span: 1, measure: kpiExtras.shift()! });
  if (widgets.length === 1 || widgets.length === 2) for (const w of widgets) w.span = widgets.length === 1 ? 4 : 2;

  // Charts lead with an amount or quantity, else the first column worth totalling (daily case counts…).
  // Without one, counting rows reads more naturally than averaging measurements.
  // When most numbers are measurements (temperatures, lengths), an unlabeled one likely is too.
  const mostlyMeasurements = measures.filter(averaged).length >= measures.length / 2;
  const lead = measures.find((m) => measureRank(m) > 0) ?? (mostlyMeasurements ? undefined : measures.find((m) => !averaged(m)));
  const primary = lead ? measureFor(lead) : ({ agg: "count", column: null } as Measure);
  if (dates[0]) {
    widgets.push({
      id: newId(),
      kind: "time",
      title: "",
      span: 4,
      dateColumn: dates[0].key,
      bucket: "auto",
      measure: primary,
      split: null,
      mark: "line",
    });
  }

  const halves: Widget[] = [];
  for (const d of dimensions.slice(0, 3)) {
    halves.push({ id: newId(), kind: "bar", title: "", span: 2, dimension: d.key, measure: primary, limit: 10, sort: "value-desc" });
  }
  for (const m of measures.slice(0, 2)) halves.push({ id: newId(), kind: "histogram", title: "", span: 2, column: m.key });
  const picked = halves.slice(0, 4);
  if (picked.length % 2 === 1) picked[picked.length - 1].span = 4;
  widgets.push(...picked);

  widgets.push({ id: newId(), kind: "table", title: "", span: 4, columns: null, pageSize: 20 });
  return widgets;
}

export function autoFilters(columns: ColumnMeta[], frame: Frame): Filter[] {
  const { dimensions, dates } = columnRoles(columns, frame);
  const filters: Filter[] = [];
  if (dates[0]) filters.push({ id: newId(), column: dates[0].key, kind: "range", min: null, max: null });
  for (const d of dimensions.filter((c) => distinctCount(frame, c.key) <= 100).slice(0, 2)) {
    filters.push({ id: newId(), column: d.key, kind: "values", values: [] });
  }
  return filters;
}

/** Count and sum add up across slices; anything else becomes a row count. */
function additiveMeasure(m: Measure): Measure {
  return m.agg === "sum" || m.agg === "count" ? m : { agg: "count", column: null };
}

export function defaultWidget(kind: WidgetKind, columns: ColumnMeta[], frame: Frame, id = newId()): Widget {
  const { measures, dimensions, dates } = columnRoles(columns, frame);
  const visible = columns.filter((c) => !c.hidden && frame.columns.has(c.key));
  const primary = measureFor(measures[0]);
  const anyDim = dimensions[0] ?? visible.find((c) => isDimensionType(c.type));
  switch (kind) {
    case "kpi":
      return { id, kind, title: "", span: 1, measure: primary };
    case "bar":
      return { id, kind, title: "", span: 2, dimension: anyDim?.key ?? visible[0]?.key ?? "", measure: primary, limit: 10, sort: "value-desc" };
    case "time":
      return { id, kind, title: "", span: 4, dateColumn: dates[0]?.key ?? "", bucket: "auto", measure: primary, split: null, mark: "line" };
    case "histogram":
      return { id, kind, title: "", span: 2, column: measures[0]?.key ?? visible.find((c) => isContinuousType(c.type))?.key ?? "" };
    case "scatter": {
      const nums = measures.length >= 2 ? measures : visible.filter((c) => c.type === "number");
      return { id, kind, title: "", span: 2, x: nums[0]?.key ?? "", y: nums[1]?.key ?? nums[0]?.key ?? "", colorBy: null };
    }
    case "pivot":
      return {
        id,
        kind,
        title: "",
        span: 4,
        rows: dimensions[0]?.key ?? anyDim?.key ?? "",
        cols: dimensions[1]?.key ?? dimensions[0]?.key ?? "",
        measure: primary,
      };
    case "table":
      return { id, kind, title: "", span: 4, columns: null, pageSize: 20 };
    case "donut":
      return { id, kind, title: "", span: 2, dimension: anyDim?.key ?? visible[0]?.key ?? "", measure: additiveMeasure(primary), limit: 6 };
    case "heatmap": {
      // Typical case: weekday × hour of a timestamp; otherwise a date's months against a category, or two categories.
      const stamp = dates.find((c) => columnHasTime(frame, c.key));
      if (stamp) return { id, kind, title: "", span: 4, x: { column: stamp.key, unit: "hour" }, y: { column: stamp.key, unit: "weekday" }, measure: primary };
      const dim = anyDim?.key ?? "";
      if (dates[0]) return { id, kind, title: "", span: 4, x: { column: dates[0].key, unit: "month" }, y: dim ? { column: dim } : { column: dates[0].key, unit: "weekday" }, measure: primary };
      return { id, kind, title: "", span: 4, x: { column: dimensions[0]?.key ?? dim }, y: { column: dimensions[1]?.key ?? dimensions[0]?.key ?? dim }, measure: primary };
    }
    case "note":
      return { id, kind, title: "", span: 4, text: "# 見出し\n\n- ここにメモを書きます" };
    case "gauge":
      return { id, kind, title: "", span: 1, measure: primary, target: 100 };
  }
}

/** New dashboards start without widgets unless `withWidgets` is set; filters are always prepared. */
export function createDashboard(
  raw: RawTable,
  source: Omit<DataSource, "rowCount">,
  name: string,
  { withWidgets = false, prepared }: { withWidgets?: boolean; prepared?: { columns: ColumnMeta[]; filters: Filter[] } } = {},
): Dashboard {
  const columns = prepared?.columns ?? inferColumns(raw.headers, raw.rows);
  // Building a frame is the expensive part; skip it when the worker already prepared everything.
  const frame = prepared && !withWidgets ? null : buildFrame(raw, columns);
  const now = Date.now();
  return {
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    source: { ...source, rowCount: raw.rows.length },
    columns,
    widgets: withWidgets && frame ? autoWidgets(columns, frame) : [],
    filters: prepared?.filters ?? autoFilters(columns, frame!),
  };
}

export interface ReplaceReport {
  added: string[];
  missing: string[];
  /** Columns whose type changed because the new data no longer fits the old type. */
  retyped: { label: string; from: ColumnType; to: ColumnType }[];
}

/** Whether ≥95% of the column's non-blank values convert to `type` (sampled for large data). */
function fitsType(meta: ColumnMeta, raw: RawTable, index: number): boolean {
  if (!isFloatType(meta.type)) return true;
  const fn = converterFor(meta);
  const step = Math.max(1, Math.floor(raw.rows.length / 3000));
  let seen = 0;
  let ok = 0;
  for (let i = 0; i < raw.rows.length; i += step) {
    const v = raw.rows[i][index] ?? null;
    if (cellToString(v) === null) continue;
    seen++;
    if (!Number.isNaN(fn(v))) ok++;
  }
  return seen === 0 || ok / seen >= 0.95;
}

/**
 * Keeps the dashboard layout and column settings while swapping in new data, matched by column name.
 * A column keeps its type as long as the new values still fit it, so a new month or appended rows
 * cannot silently turn a number column into a category (and break the widgets using it).
 */
export function mergeColumns(
  existing: ColumnMeta[],
  raw: RawTable,
  previousHeaders?: string[],
  /** Inference for the columns of the new file, done elsewhere (the parse worker). */
  preInferred?: ColumnMeta[],
): { columns: ColumnMeta[]; report: ReplaceReport } {
  const pre = new Map((preInferred ?? []).map((c) => [c.key, c]));
  const infer = (h: string, i: number): ColumnMeta =>
    pre.get(h) ?? inferColumns([h], raw.rows.map((r) => [r[i] ?? null]))[0];
  const byKey = new Map(existing.filter((c) => !c.derived).map((c) => [c.key, c]));
  const retyped: ReplaceReport["retyped"] = [];
  const columns = raw.headers.map((h, i) => {
    const prev = byKey.get(h);
    if (!prev) return infer(h, i);
    // A type the user chose is always kept.
    if (prev.type !== prev.inferredType) return prev;
    if (fitsType(prev, raw, i)) return prev;
    const next = infer(h, i);
    if (next.type !== prev.type) retyped.push({ label: prev.label, from: prev.type, to: next.type });
    // Conversion options belonged to the old type; take the ones inferred for the new data.
    const { parse: _parse, inferredParse: _inferredParse, ...rest } = prev;
    return {
      ...rest,
      type: next.type,
      inferredType: next.type,
      format: prev.type === "number" ? prev.format : next.format,
      dateUnit: next.dateUnit,
      ...(next.parse ? { parse: next.parse, inferredParse: next.inferredParse } : {}),
      inferredReason: next.inferredReason,
    };
  });
  const present = new Set(raw.headers);
  const derived = existing.filter((c) => c.derived);
  const missing = existing.filter((c) => !c.derived && !present.has(c.key));
  // Only report columns that disappeared since the previous data, not settings that were already orphaned.
  const prev = previousHeaders ? new Set(previousHeaders) : null;
  return {
    columns: [...columns, ...missing, ...derived],
    report: {
      added: raw.headers.filter((h) => !byKey.has(h)),
      missing: missing.filter((c) => !prev || prev.has(c.key)).map((c) => c.label),
      retyped,
    },
  };
}
