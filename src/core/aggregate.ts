import { aggsFor, isContinuousType, isFloatColumn } from "./columnTypes";
import { datePart, datePartOrder } from "./derive";
import { isFilterActive, presetRange } from "./filters";
import type { Agg, BarSort, Filter, Frame, HeatAxis, Measure, TimeBucket } from "./types";

export const BLANK_LABEL = "(空欄)";
export const OTHER_LABEL = "その他";
export const TRUE_LABEL = "はい";
export const FALSE_LABEL = "いいえ";

export function filterRows(frame: Frame, filters: Filter[], skipFilterId?: string): Uint32Array {
  const active = filters.filter((f) => {
    if (f.id === skipFilterId || !frame.columns.has(f.column)) return false;
    return isFilterActive(f);
  });
  const out = new Uint32Array(frame.rowCount);
  let n = 0;
  const tests = active.map((f) => {
    const col = frame.columns.get(f.column)!;
    if (f.kind === "values") {
      const set = new Set(f.values);
      if (col.type === "boolean") {
        const label = labelGetter(frame, f.column);
        return (i: number) => set.has(label(i));
      }
      if (isFloatColumn(col)) return (i: number) => set.has(String(col.values[i]));
      return (i: number) => set.has(col.values[i] ?? BLANK_LABEL);
    }
    if (!isFloatColumn(col)) return () => true;
    let lo = f.min ?? -Infinity;
    let hi = f.max ?? Infinity;
    if (f.preset && col.type === "date") {
      let latest = -Infinity;
      for (const v of col.values) if (v > latest) latest = v;
      if (latest === -Infinity) return () => false;
      [lo, hi] = presetRange(f.preset, latest);
    }
    return (i: number) => {
      const v = col.values[i];
      return v >= lo && v <= hi;
    };
  });
  outer: for (let i = 0; i < frame.rowCount; i++) {
    for (const t of tests) if (!t(i)) continue outer;
    out[n++] = i;
  }
  return out.subarray(0, n);
}

interface Acc {
  count: number;
  n: number;
  sum: number;
  min: number;
  max: number;
  set: Set<string> | null;
}

const newAcc = (agg: Agg): Acc => ({ count: 0, n: 0, sum: 0, min: Infinity, max: -Infinity, set: agg === "distinct" ? new Set() : null });

function mergeAcc(a: Acc, b: Acc): Acc {
  return {
    count: a.count + b.count,
    n: a.n + b.n,
    sum: a.sum + b.sum,
    min: Math.min(a.min, b.min),
    max: Math.max(a.max, b.max),
    set: a.set && b.set ? new Set([...a.set, ...b.set]) : null,
  };
}

function finish(acc: Acc, agg: Agg): number {
  switch (agg) {
    case "count":
      return acc.count;
    case "sum":
      return acc.n ? acc.sum : 0;
    case "avg":
      return acc.n ? acc.sum / acc.n : NaN;
    case "min":
      return acc.n ? acc.min : NaN;
    case "max":
      return acc.n ? acc.max : NaN;
    case "distinct":
      return acc.set ? acc.set.size : 0;
  }
}

/** Returns a function that feeds row i into an accumulator. */
function feeder(frame: Frame, measure: Measure): (acc: Acc, i: number) => void {
  const col = measure.column ? frame.columns.get(measure.column) : undefined;
  if (measure.agg === "count" || !col) return (acc) => void acc.count++;
  if (measure.agg === "distinct") {
    return (acc, i) => {
      acc.count++;
      const v = col.values[i];
      if (v !== null && !(typeof v === "number" && Number.isNaN(v))) acc.set!.add(String(v));
    };
  }
  if (!isFloatColumn(col)) return (acc) => void acc.count++;
  const values = col.values;
  return (acc, i) => {
    acc.count++;
    const v = values[i];
    if (Number.isNaN(v)) return;
    acc.n++;
    acc.sum += v;
    if (v < acc.min) acc.min = v;
    if (v > acc.max) acc.max = v;
  };
}

export function measureIsValid(frame: Frame, m: Measure): boolean {
  if (m.agg === "count") return true;
  if (!m.column || !frame.columns.has(m.column)) return false;
  if (m.agg === "distinct") return true;
  return aggsFor(frame.columns.get(m.column)!.type).includes(m.agg);
}

export function aggregate(frame: Frame, rows: Uint32Array, measure: Measure): number {
  const acc = newAcc(measure.agg);
  const feed = feeder(frame, measure);
  for (const i of rows) feed(acc, i);
  return finish(acc, measure.agg);
}

function labelGetter(frame: Frame, key: string): (i: number) => string {
  const col = frame.columns.get(key)!;
  if (col.type === "boolean") {
    return (i) => (Number.isNaN(col.values[i]) ? BLANK_LABEL : col.values[i] ? TRUE_LABEL : FALSE_LABEL);
  }
  if (isFloatColumn(col)) {
    return (i) => (Number.isNaN(col.values[i]) ? BLANK_LABEL : String(col.values[i]));
  }
  return (i) => col.values[i] ?? BLANK_LABEL;
}

function groupAccs(frame: Frame, rows: Uint32Array, key: string, measure: Measure): Map<string, Acc> {
  const label = labelGetter(frame, key);
  const feed = feeder(frame, measure);
  const groups = new Map<string, Acc>();
  for (const i of rows) {
    const k = label(i);
    let acc = groups.get(k);
    if (!acc) groups.set(k, (acc = newAcc(measure.agg)));
    feed(acc, i);
  }
  return groups;
}

export interface Bar {
  label: string;
  value: number;
  /** "その他" bucket: cannot be used as a filter value */
  isOther: boolean;
}

const collator = new Intl.Collator("ja", { numeric: true });

export function groupBy(
  frame: Frame,
  rows: Uint32Array,
  key: string,
  measure: Measure,
  limit: number,
  sort: BarSort,
  /** Explicit category order used by the "label" sort (weekdays, months). */
  order?: string[],
  /** false drops the groups beyond `limit` instead of folding them into "その他". */
  otherBucket = true,
): { bars: Bar[]; total: number; sum: number } {
  const groups = groupAccs(frame, rows, key, measure);
  const entries = [...groups].map(([label, acc]) => ({ label, acc, value: finish(acc, measure.agg) }));
  const byValue = (a: { value: number }, b: { value: number }) => (Number.isNaN(a.value) ? 1 : Number.isNaN(b.value) ? -1 : b.value - a.value);
  entries.sort(byValue);
  let kept = entries;
  let other: Bar | null = null;
  if (entries.length > limit) {
    kept = entries.slice(0, limit);
    const rest = entries.slice(limit).reduce((a, e) => mergeAcc(a, e.acc), newAcc(measure.agg));
    if (otherBucket) other = { label: `${OTHER_LABEL} (${entries.length - limit})`, value: finish(rest, measure.agg), isOther: true };
  }
  const bars: Bar[] = kept.map((e) => ({ label: e.label, value: e.value, isOther: false }));
  if (sort === "value-asc") bars.reverse();
  if (sort === "label") {
    const rank = order ? new Map(order.map((v, i) => [v, i])) : null;
    bars.sort((a, b) => (rank ? (rank.get(a.label) ?? 1e9) - (rank.get(b.label) ?? 1e9) : 0) || collator.compare(a.label, b.label));
  }
  if (other) bars.push(other);
  // Over every group, so shares stay correct when the rest is not shown.
  const sum = entries.reduce((a, e) => (Number.isNaN(e.value) ? a : a + e.value), 0);
  return { bars, total: entries.length, sum };
}

const DAY = 86400000;
const HOUR = 3600000;
const MINUTE = 60000;
const SECOND = 1000;

export type ResolvedBucket = Exclude<TimeBucket, "auto">;

/** True when any value of a date column is not at midnight (UTC, as dates are stored). */
export function columnHasTime(frame: Frame, key: string): boolean {
  const col = frame.columns.get(key);
  if (!col || col.type !== "date") return col?.type === "time";
  for (const v of col.values) if (!Number.isNaN(v) && v % DAY !== 0) return true;
  return false;
}

export function floorDate(t: number, bucket: ResolvedBucket): number {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  switch (bucket) {
    case "second":
      return Math.floor(t / SECOND) * SECOND;
    case "minute":
      return Math.floor(t / MINUTE) * MINUTE;
    case "hour":
      return Math.floor(t / HOUR) * HOUR;
    case "day":
      return Date.UTC(y, m, d.getUTCDate());
    case "week": {
      const day = Date.UTC(y, m, d.getUTCDate());
      const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
      return day - dow * DAY;
    }
    case "month":
      return Date.UTC(y, m, 1);
    case "quarter":
      return Date.UTC(y, m - (m % 3), 1);
    case "year":
      return Date.UTC(y, 0, 1);
  }
}

export function nextBucket(t: number, bucket: ResolvedBucket): number {
  const d = new Date(t);
  switch (bucket) {
    case "second":
      return t + SECOND;
    case "minute":
      return t + MINUTE;
    case "hour":
      return t + HOUR;
    case "day":
      return t + DAY;
    case "week":
      return t + 7 * DAY;
    case "month":
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    case "quarter":
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1);
    case "year":
      return Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  }
}

const ORDER: ResolvedBucket[] = ["second", "minute", "hour", "day", "week", "month", "quarter", "year"];
const SUB_DAY: ResolvedBucket[] = ["second", "minute", "hour"];

/** Most points an auto unit may produce; an explicit unit is allowed more. */
export const AUTO_MAX_POINTS = 1000;
export const EXPLICIT_MAX_POINTS = 5000;

const APPROX_DAYS: Record<ResolvedBucket, number> = { second: 1 / 86400, minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30, quarter: 91, year: 365 };

/** `hasTime` false (every value at midnight) never yields a sub-day bucket. */
export function resolveBucket(bucket: TimeBucket, min: number, max: number, hasTime = true): ResolvedBucket {
  return resolveBucketDetailed(bucket, min, max, hasTime).bucket;
}

/** `requested` is set only when the unit had to be coarsened to keep the point count renderable. */
export function resolveBucketDetailed(bucket: TimeBucket, min: number, max: number, hasTime = true): { bucket: ResolvedBucket; requested?: ResolvedBucket } {
  const span = max - min;
  const spanDays = span / DAY;
  let b: ResolvedBucket;
  if (bucket !== "auto") b = bucket;
  else if (span <= 2 * MINUTE) b = "second";
  else if (span <= 2 * HOUR) b = "minute";
  else if (span <= 3 * DAY) b = "hour";
  else if (spanDays <= 62) b = "day";
  else if (spanDays <= 270) b = "week";
  else if (spanDays <= 365 * 5) b = "month";
  else if (spanDays <= 365 * 12) b = "quarter";
  else b = "year";
  if (!hasTime && SUB_DAY.includes(b)) b = "day";
  const wanted = b;
  const limit = bucket === "auto" ? AUTO_MAX_POINTS : EXPLICIT_MAX_POINTS;
  while (b !== "year" && spanDays / APPROX_DAYS[b] > limit) b = ORDER[ORDER.indexOf(b) + 1];
  return b === wanted ? { bucket: b } : { bucket: b, requested: wanted };
}

export interface Series {
  label: string;
  values: number[];
}

export interface TimeSeriesResult {
  bucket: ResolvedBucket;
  /** The unit that was asked for when it produced too many points and `bucket` is coarser. */
  requestedBucket?: ResolvedBucket;
  /** The x axis is a time-of-day column (buckets are ms from 1970-01-01 00:00), so labels show no date. */
  timeOfDay?: boolean;
  buckets: number[];
  series: Series[];
}

export const MAX_SERIES = 7;

export function timeSeries(
  frame: Frame,
  rows: Uint32Array,
  dateKey: string,
  bucket: TimeBucket,
  measure: Measure,
  splitKey: string | null,
): TimeSeriesResult {
  const dateCol = frame.columns.get(dateKey);
  if (!dateCol || (dateCol.type !== "date" && dateCol.type !== "time")) return { bucket: "day", buckets: [], series: [] };
  const timeOfDay = dateCol.type === "time";
  // Seconds since midnight are read as ms on 1970-01-01 so the date bucketing applies unchanged.
  const dates = timeOfDay ? Float64Array.from(dateCol.values, (v) => v * 1000) : dateCol.values;
  let min = Infinity;
  let max = -Infinity;
  for (const i of rows) {
    const t = dates[i];
    if (Number.isNaN(t)) continue;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (min === Infinity) return { bucket: "day", buckets: [], series: [] };
  // Time-of-day columns have no day or larger units; a day-level choice falls back to hours.
  const requested: TimeBucket = timeOfDay && bucket !== "second" && bucket !== "minute" ? "hour" : bucket;
  const { bucket: b, requested: coarsenedFrom } = resolveBucketDetailed(requested, min, max, timeOfDay || columnHasTime(frame, dateKey));
  const buckets: number[] = [];
  for (let t = floorDate(min, b); t <= max; t = nextBucket(t, b)) buckets.push(t);
  const bucketIndex = new Map(buckets.map((t, i) => [t, i]));

  const split = splitKey && frame.columns.has(splitKey) ? labelGetter(frame, splitKey) : () => "";
  const feed = feeder(frame, measure);
  const perSeries = new Map<string, Acc[]>();
  const totals = new Map<string, Acc>();
  for (const i of rows) {
    const t = dates[i];
    if (Number.isNaN(t)) continue;
    const s = split(i);
    let accs = perSeries.get(s);
    if (!accs) {
      accs = buckets.map(() => newAcc(measure.agg));
      perSeries.set(s, accs);
      totals.set(s, newAcc(measure.agg));
    }
    feed(accs[bucketIndex.get(floorDate(t, b))!], i);
    feed(totals.get(s)!, i);
  }

  const keys = [...perSeries.keys()].sort((a, c) => {
    const va = finish(totals.get(a)!, measure.agg);
    const vc = finish(totals.get(c)!, measure.agg);
    return (Number.isNaN(vc) ? -Infinity : vc) - (Number.isNaN(va) ? -Infinity : va);
  });
  const emptyValue = (acc: Acc) => (acc.count === 0 && measure.agg !== "count" && measure.agg !== "sum" && measure.agg !== "distinct" ? NaN : finish(acc, measure.agg));
  const series: Series[] = keys.slice(0, MAX_SERIES).map((k) => ({ label: k, values: perSeries.get(k)!.map(emptyValue) }));
  if (keys.length > MAX_SERIES) {
    const merged = buckets.map((_, bi) => keys.slice(MAX_SERIES).reduce((a, k) => mergeAcc(a, perSeries.get(k)![bi]), newAcc(measure.agg)));
    series.push({ label: `${OTHER_LABEL} (${keys.length - MAX_SERIES})`, values: merged.map(emptyValue) });
  }
  return { bucket: b, buckets, series, ...(coarsenedFrom ? { requestedBucket: coarsenedFrom } : {}), ...(timeOfDay ? { timeOfDay } : {}) };
}

export interface Bin {
  x0: number;
  x1: number;
  count: number;
}

export function niceStep(range: number, target: number): number {
  if (range <= 0 || !Number.isFinite(range)) return 1;
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1;
  return step * mag;
}

const DURATION_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];

/** Round step (seconds) for a duration axis: 1/2/5/10/15/30 s or min, 1/2/3/6/12 h, then 1/2/5×10^n days. 0 when the range is under a second. */
export function durationStep(range: number, target: number): number {
  if (range <= 0 || !Number.isFinite(range)) return 0;
  const raw = range / target;
  if (raw < 0.5) return 0;
  const step = DURATION_STEPS.find((s) => s >= raw);
  if (step) return step;
  const days = raw / 86400;
  const mag = 10 ** Math.floor(Math.log10(days));
  return ([1, 2, 5, 10].find((m) => m * mag >= days - 1e-9) ?? 10) * mag * 86400;
}

/** `bins`: exact number of equal-width bins from min to max; null = round-number edges, count chosen from the row count. */
export function histogram(frame: Frame, rows: Uint32Array, key: string, bins?: number | null): Bin[] {
  const col = frame.columns.get(key);
  if (!col || !isFloatColumn(col) || !isContinuousType(col.type)) return [];
  const vals: number[] = [];
  for (const i of rows) if (!Number.isNaN(col.values[i])) vals.push(col.values[i]);
  if (vals.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of vals) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (min === max) return [{ x0: min, x1: max, count: vals.length }];
  const fixed = bins && bins > 0 ? Math.floor(bins) : 0;
  const target = Math.min(30, Math.max(5, Math.ceil(Math.log2(vals.length) + 1)));
  const step = fixed ? (max - min) / fixed : (col.type === "duration" && durationStep(max - min, target)) || niceStep(max - min, target);
  const start = fixed ? min : Math.floor(min / step) * step;
  const n = fixed || Math.max(1, Math.ceil((max - start) / step + 1e-9));
  const out: Bin[] = Array.from({ length: n }, (_, i) => ({ x0: start + i * step, x1: start + (i + 1) * step, count: 0 }));
  for (const v of vals) out[Math.min(n - 1, Math.floor((v - start) / step))].count++;
  return out;
}

/** Distinct values with their row counts, for filter pickers. */
export function valueCounts(frame: Frame, rows: Uint32Array, key: string): { value: string; count: number }[] {
  if (!frame.columns.has(key)) return [];
  const label = labelGetter(frame, key);
  const counts = new Map<string, number>();
  for (const i of rows) {
    const k = label(i);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || collator.compare(a.value, b.value));
}

export function extent(frame: Frame, key: string): [number, number] | null {
  const col = frame.columns.get(key);
  if (!col || !isFloatColumn(col)) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const v of col.values) {
    if (Number.isNaN(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? null : [min, max];
}

// ---------- Scatter ----------

export interface ScatterPoint {
  x: number;
  y: number;
  group: number;
}

/** Scatter colors are capped at three groups (the all-pairs-safe palette size); the rest fold into "その他". */
export const SCATTER_GROUPS = 3;

export function scatterPoints(
  frame: Frame,
  rows: Uint32Array,
  xKey: string,
  yKey: string,
  colorKey: string | null,
  max = 3000,
): { points: ScatterPoint[]; groups: string[]; valid: number } {
  const xc = frame.columns.get(xKey);
  const yc = frame.columns.get(yKey);
  if (!xc || !yc || !isFloatColumn(xc) || !isFloatColumn(yc) || !isContinuousType(xc.type) || !isContinuousType(yc.type)) return { points: [], groups: [], valid: 0 };
  const validRows: number[] = [];
  for (const i of rows) if (!Number.isNaN(xc.values[i]) && !Number.isNaN(yc.values[i])) validRows.push(i);
  let groups: string[] = [];
  let groupOf: (i: number) => number = () => 0;
  if (colorKey && frame.columns.has(colorKey)) {
    const label = labelGetter(frame, colorKey);
    const counts = new Map<string, number>();
    for (const i of validRows) counts.set(label(i), (counts.get(label(i)) ?? 0) + 1);
    const ranked = [...counts].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    groups = ranked.slice(0, SCATTER_GROUPS);
    if (ranked.length > SCATTER_GROUPS) groups.push(`${OTHER_LABEL} (${ranked.length - SCATTER_GROUPS})`);
    const index = new Map(groups.slice(0, SCATTER_GROUPS).map((g, i) => [g, i]));
    groupOf = (i) => index.get(label(i)) ?? SCATTER_GROUPS;
  }
  const step = Math.max(1, validRows.length / max);
  const points: ScatterPoint[] = [];
  for (let k = 0; k < validRows.length; k += step) {
    const i = validRows[Math.floor(k)];
    points.push({ x: xc.values[i], y: yc.values[i], group: groupOf(i) });
  }
  return { points, groups, valid: validRows.length };
}

// ---------- Pivot ----------

export interface PivotResult {
  rowLabels: string[];
  colLabels: string[];
  cells: number[][];
  rowTotals: number[];
  colTotals: number[];
  grand: number;
}

function rankedKeys(accs: Map<string, Acc>, agg: Agg, limit: number, order?: string[]): { keep: string[]; rest: string[] } {
  const keys = [...accs.keys()];
  if (order) {
    const rank = new Map(order.map((v, i) => [v, i]));
    keys.sort((a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9) || collator.compare(a, b));
  } else {
    keys.sort((a, b) => {
      const va = finish(accs.get(a)!, agg);
      const vb = finish(accs.get(b)!, agg);
      return (Number.isNaN(vb) ? -Infinity : vb) - (Number.isNaN(va) ? -Infinity : va);
    });
  }
  return { keep: keys.slice(0, limit), rest: keys.slice(limit) };
}

export function pivot(frame: Frame, rows: Uint32Array, rowKey: string, colKey: string, measure: Measure, rowLimit = 20, colLimit = 10): PivotResult {
  const rl = labelGetter(frame, rowKey);
  const cl = labelGetter(frame, colKey);
  const feed = feeder(frame, measure);
  const rowAcc = new Map<string, Acc>();
  const colAcc = new Map<string, Acc>();
  const cellAcc = new Map<string, Acc>();
  const grandAcc = newAcc(measure.agg);
  const get = (m: Map<string, Acc>, k: string) => {
    let a = m.get(k);
    if (!a) m.set(k, (a = newAcc(measure.agg)));
    return a;
  };
  for (const i of rows) {
    const r = rl(i);
    const c = cl(i);
    feed(get(rowAcc, r), i);
    feed(get(colAcc, c), i);
    feed(get(cellAcc, `${r}\u0000${c}`), i);
    feed(grandAcc, i);
  }
  const R = rankedKeys(rowAcc, measure.agg, rowLimit, frame.meta.get(rowKey)?.order);
  const C = rankedKeys(colAcc, measure.agg, colLimit, frame.meta.get(colKey)?.order);
  const otherR = R.rest.length ? `${OTHER_LABEL} (${R.rest.length})` : null;
  const otherC = C.rest.length ? `${OTHER_LABEL} (${C.rest.length})` : null;
  const rowGroups = [...R.keep.map((k) => [k]), ...(otherR ? [R.rest] : [])];
  const colGroups = [...C.keep.map((k) => [k]), ...(otherC ? [C.rest] : [])];
  const merged = (rs: string[], cs: string[]) => {
    let a = newAcc(measure.agg);
    for (const r of rs) for (const c of cs) {
      const x = cellAcc.get(`${r}\u0000${c}`);
      if (x) a = mergeAcc(a, x);
    }
    return finish(a, measure.agg);
  };
  const mergedOne = (m: Map<string, Acc>, ks: string[]) => finish(ks.reduce((a, k) => mergeAcc(a, m.get(k)!), newAcc(measure.agg)), measure.agg);
  return {
    rowLabels: [...R.keep, ...(otherR ? [otherR] : [])],
    colLabels: [...C.keep, ...(otherC ? [otherC] : [])],
    cells: rowGroups.map((rs) => colGroups.map((cs) => merged(rs, cs))),
    rowTotals: rowGroups.map((rs) => mergedOne(rowAcc, rs)),
    colTotals: colGroups.map((cs) => mergedOne(colAcc, cs)),
    grand: finish(grandAcc, measure.agg),
  };
}

// ---------- Period comparison ----------

export interface PeriodComparison {
  bucket: ResolvedBucket;
  currentStart: number;
  current: number;
  previous: number;
  /** Latest values for a sparkline, oldest first. */
  spark: number[];
  /** The latest period is not complete in the data. */
  partial: boolean;
}

export function comparePeriods(frame: Frame, rows: Uint32Array, measure: Measure, dateKey: string, bucket: ResolvedBucket): PeriodComparison | null {
  const ts = timeSeries(frame, rows, dateKey, bucket, measure, null);
  if (ts.buckets.length === 0) return null;
  const values = ts.series[0].values;
  const n = values.length;
  const dates = frame.columns.get(dateKey)!.values as Float64Array;
  let maxDate = -Infinity;
  for (const i of rows) if (dates[i] > maxDate) maxDate = dates[i];
  const lastStart = ts.buckets[n - 1];
  const lastDayOfBucket = nextBucket(lastStart, ts.bucket) - DAY;
  return {
    bucket: ts.bucket,
    currentStart: lastStart,
    current: values[n - 1],
    previous: n > 1 ? values[n - 2] : NaN,
    spark: values.slice(-12),
    // Sub-day buckets always contain the latest value, so there is no way to tell whether they are complete.
    partial: SUB_DAY.includes(ts.bucket) ? false : floorDate(maxDate, "day") < lastDayOfBucket,
  };
}

/** One series per numeric column, all on the same buckets (wide tables). */
export function timeSeriesColumns(
  frame: Frame,
  rows: Uint32Array,
  dateKey: string,
  bucket: TimeBucket,
  agg: Agg,
  columns: string[],
  label: (key: string) => string,
): TimeSeriesResult {
  let result: TimeSeriesResult = { bucket: "day", buckets: [], series: [] };
  for (const key of columns.slice(0, MAX_SERIES + 1)) {
    const r = timeSeries(frame, rows, dateKey, bucket, { agg: agg === "count" ? "sum" : agg, column: key }, null);
    if (r.series.length === 0) continue;
    if (result.buckets.length === 0) result = { bucket: r.bucket, buckets: r.buckets, series: [], ...(r.requestedBucket ? { requestedBucket: r.requestedBucket } : {}), ...(r.timeOfDay ? { timeOfDay: true } : {}) };
    result.series.push({ label: label(key), values: r.series[0].values });
  }
  return result;
}

// ---------- Donut ----------

export interface DonutSlice {
  label: string;
  value: number;
  isOther: boolean;
}

/** Largest groups first; the rest is folded into one "その他" slice. Zero, negative and blank values cannot be drawn and are skipped. */
export function donutSlices(frame: Frame, rows: Uint32Array, key: string, measure: Measure, limit: number): { slices: DonutSlice[]; total: number } {
  const { bars } = groupBy(frame, rows, key, measure, limit, "value-desc");
  const slices = bars.filter((b) => b.value > 0).map((b) => ({ label: b.label, value: b.value, isOther: b.isOther }));
  return { slices, total: slices.reduce((a, s) => a + s.value, 0) };
}

// ---------- Heatmap ----------

export interface HeatmapResult {
  xLabels: string[];
  yLabels: string[];
  /** cells[y][x]; null = no rows (or no value) there. */
  cells: (number | null)[][];
  min: number;
  max: number;
}

const MAX_HEAT_LABELS = 30;

/** Label of each row on a heatmap axis, plus the natural order when there is one. */
function axisLabels(frame: Frame, axis: HeatAxis): { get: (i: number) => string | null; order?: string[] } | null {
  const col = frame.columns.get(axis.column);
  if (!col) return null;
  if (axis.unit) {
    if (!isFloatColumn(col)) return null;
    const v = col.values;
    if (col.type === "time") {
      if (axis.unit !== "hour") return null;
      return { get: (i) => datePart(v[i] * 1000, "hour"), order: datePartOrder("hour") };
    }
    if (col.type !== "date") return null;
    return { get: (i) => datePart(v[i], axis.unit!), order: datePartOrder(axis.unit) };
  }
  const get = labelGetter(frame, axis.column);
  return { get, order: frame.meta.get(axis.column)?.order };
}

/** Two-way grid of a measure. Axes keep only values that occur; unit axes follow calendar order, categories their column order or name. */
export function heatmapGrid(frame: Frame, rows: Uint32Array, x: HeatAxis, y: HeatAxis, measure: Measure): HeatmapResult {
  const empty: HeatmapResult = { xLabels: [], yLabels: [], cells: [], min: 0, max: 0 };
  const xl = axisLabels(frame, x);
  const yl = axisLabels(frame, y);
  if (!xl || !yl) return empty;
  const feed = feeder(frame, measure);
  const cellAcc = new Map<string, Acc>();
  const xCount = new Map<string, number>();
  const yCount = new Map<string, number>();
  for (const i of rows) {
    const a = xl.get(i);
    const b = yl.get(i);
    if (a === null || b === null) continue;
    xCount.set(a, (xCount.get(a) ?? 0) + 1);
    yCount.set(b, (yCount.get(b) ?? 0) + 1);
    const k = `${a}\u0000${b}`;
    let acc = cellAcc.get(k);
    if (!acc) cellAcc.set(k, (acc = newAcc(measure.agg)));
    feed(acc, i);
  }
  const arrange = (counts: Map<string, number>, order?: string[]) => {
    let keys = [...counts.keys()];
    // Many distinct values: keep the most frequent ones.
    if (keys.length > MAX_HEAT_LABELS) keys = keys.sort((p, q) => counts.get(q)! - counts.get(p)!).slice(0, MAX_HEAT_LABELS);
    const rank = order ? new Map(order.map((v, i) => [v, i])) : null;
    return keys.sort((p, q) => (rank ? (rank.get(p) ?? 1e9) - (rank.get(q) ?? 1e9) : 0) || collator.compare(p, q));
  };
  const xLabels = arrange(xCount, xl.order);
  const yLabels = arrange(yCount, yl.order);
  let min = Infinity;
  let max = -Infinity;
  const cells = yLabels.map((b) =>
    xLabels.map((a) => {
      const acc = cellAcc.get(`${a}\u0000${b}`);
      if (!acc) return null;
      const v = finish(acc, measure.agg);
      if (Number.isNaN(v)) return null;
      if (v < min) min = v;
      if (v > max) max = v;
      return v;
    }),
  );
  if (min === Infinity) return { ...empty, xLabels, yLabels, cells };
  return { xLabels, yLabels, cells, min, max };
}
