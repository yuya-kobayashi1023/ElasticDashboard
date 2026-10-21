import { composeDates, datePart, evaluateFormula, FormulaError, lookupKeys, masterIndex, rowKeys } from "./derive";
import { isFloatColumn } from "./columnTypes";
import { cellToString } from "./infer";
import { converterFor, textNormalizerFor } from "./parsers";
import type { ColumnMeta, ColumnValues, Frame, Lookup, RawTable } from "./types";

/** Rows processed between yields when building a frame without blocking the page. */
const CHUNK = 20000;

type Steps<T> = Generator<void, T, void>;

function runSync<T>(it: Steps<T>): T {
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

type CoerceMeta = Pick<ColumnMeta, "type" | "parse" | "dateUnit">;

function* coerceSteps(raw: RawTable, index: number, meta: CoerceMeta): Steps<ColumnValues> {
  const n = raw.rows.length;
  const type = meta.type;
  if (type !== "category" && type !== "text") {
    const values = new Float64Array(n);
    const fn = converterFor(meta);
    for (let i = 0; i < n; i++) {
      if (i && i % CHUNK === 0) yield;
      values[i] = fn(raw.rows[i][index] ?? null);
    }
    return { type, values };
  }
  const values: (string | null)[] = new Array(n);
  const fn = textNormalizerFor(meta);
  for (let i = 0; i < n; i++) {
    if (i && i % CHUNK === 0) yield;
    values[i] = fn(raw.rows[i][index] ?? null);
  }
  return { type, values };
}

export function coerceColumn(raw: RawTable, index: number, meta: CoerceMeta): ColumnValues {
  return runSync(coerceSteps(raw, index, meta));
}

function* frameSteps(raw: RawTable, columns: ColumnMeta[], lookups: Lookup[]): Steps<Frame> {
  const indexByKey = new Map(raw.headers.map((h, i) => [h, i]));
  const values = new Map<string, ColumnValues>();
  const meta = new Map<string, ColumnMeta>();
  const errors = new Map<string, string>();
  const n = raw.rows.length;
  for (const col of columns) {
    if (col.derived) continue;
    const idx = indexByKey.get(col.key);
    if (idx === undefined) continue;
    values.set(col.key, yield* coerceSteps(raw, idx, col));
    meta.set(col.key, col);
  }
  // Calculated columns run in list order, so later ones may use earlier ones.
  for (const col of columns) {
    const d = col.derived;
    if (!d) continue;
    yield;
    try {
      if (d.kind === "formula") {
        values.set(col.key, { type: "number", values: evaluateFormula(d.expr, values, n) });
      } else if (d.kind === "datecompose") {
        values.set(col.key, { type: "date", values: composeDates(d.parts, values, n) });
      } else if (d.kind === "lookup") {
        const l = lookups.find((x) => x.id === d.lookupId);
        if (!l) throw new FormulaError("結合したマスタが見つかりません");
        const srcs = lookupKeys(l).local.map((k) => values.get(k));
        if (srcs.length === 0 || srcs.some((x) => !x)) throw new FormulaError("結合に使う列がデータにありません");
        const ci = l.table.headers.indexOf(d.column);
        if (ci < 0) throw new FormulaError(`マスタに「${d.column}」列がありません`);
        const index = masterIndex(l, (srcs as ColumnValues[]).map((x) => x.type === "date"));
        const keys = rowKeys(srcs as ColumnValues[], n);
        // Build a one-column table of looked-up raw cells, then coerce it like a file column.
        const cells = { headers: [col.key], rows: keys.map((k) => [k === null ? null : (l.table.rows[index.get(k) ?? -1]?.[ci] ?? null)]) };
        values.set(col.key, yield* coerceSteps(cells, 0, col));
      } else {
        const src = values.get(d.source);
        if (!src) throw new FormulaError("元の日付列がデータにありません");
        const timeOfDay = src.type === "time";
        if (src.type !== "date" && !timeOfDay) throw new FormulaError("元の列が日付ではありません");
        if (timeOfDay && d.part !== "hour" && d.part !== "minute") throw new FormulaError("時刻の列からは「時」と「分」だけ取り出せます");
        const out: (string | null)[] = new Array(n);
        // Time-of-day columns hold seconds since midnight; read them as ms on 1970-01-01.
        for (let i = 0; i < n; i++) out[i] = datePart(timeOfDay ? src.values[i] * 1000 : src.values[i], d.part);
        values.set(col.key, { type: "category", values: out });
      }
      meta.set(col.key, col);
    } catch (e) {
      errors.set(col.key, `計算列「${col.label}」を計算できません（${e instanceof Error ? e.message : "原因不明"}）`);
    }
  }
  return { rowCount: n, columns: values, meta, errors };
}

export function buildFrame(raw: RawTable, columns: ColumnMeta[], lookups: Lookup[] = []): Frame {
  return runSync(frameSteps(raw, columns, lookups));
}

/**
 * Same result as buildFrame, but gives the page back every ~30 ms so large data never freezes the UI.
 * Resolves to null when `signal.cancelled` is set (a newer build replaced this one).
 */
export async function buildFrameAsync(raw: RawTable, columns: ColumnMeta[], lookups: Lookup[], signal: { cancelled: boolean }): Promise<Frame | null> {
  const it = frameSteps(raw, columns, lookups);
  let start = performance.now();
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
    if (performance.now() - start > 30) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (signal.cancelled) return null;
      start = performance.now();
    }
  }
}

export interface ColumnStats {
  blank: number;
  distinct: number;
  /** Non-blank raw values that could not be converted to the column type. */
  invalid: number;
  samples: string[];
}

export function columnStats(raw: RawTable, col: ColumnMeta): ColumnStats {
  const idx = raw.headers.indexOf(col.key);
  if (idx < 0) return { blank: 0, distinct: 0, invalid: 0, samples: [] };
  const coerced = coerceColumn(raw, idx, col);
  let blank = 0;
  let invalid = 0;
  const distinct = new Set<string>();
  const samples: string[] = [];
  for (let i = 0; i < raw.rows.length; i++) {
    const s = cellToString(raw.rows[i][idx] ?? null);
    if (s === null) {
      blank++;
      continue;
    }
    if (distinct.size < 100000) distinct.add(s);
    if (samples.length < 3 && !samples.includes(s)) samples.push(s);
    if (isFloatColumn(coerced) && Number.isNaN(coerced.values[i])) invalid++;
  }
  return { blank, distinct: distinct.size, invalid, samples };
}

/**
 * Statistics for the column settings screen, computed from an already built frame (no re-conversion)
 * and in time slices so wide, large tables do not freeze the page. Resolves to null when cancelled.
 */
export async function columnStatsAsync(
  raw: RawTable,
  columns: ColumnMeta[],
  frame: Frame,
  format: (v: number, c: ColumnMeta) => string,
  signal: { cancelled: boolean },
): Promise<Map<string, ColumnStats> | null> {
  const out = new Map<string, ColumnStats>();
  const indexByKey = new Map(raw.headers.map((h, i) => [h, i]));
  let start = performance.now();
  const pause = async () => {
    if (performance.now() - start < 30) return false;
    await new Promise((r) => setTimeout(r, 0));
    start = performance.now();
    return signal.cancelled;
  };
  for (const c of columns) {
    const col = frame.columns.get(c.key);
    const idx = indexByKey.get(c.key);
    let blank = 0;
    let invalid = 0;
    const distinct = new Set<string>();
    const samples: string[] = [];
    for (let i = 0; i < frame.rowCount; i++) {
      if (i % 5000 === 0 && (await pause())) return null;
      let text: string | null;
      if (c.derived || idx === undefined) {
        if (!col) break;
        const v = col.values[i];
        text = typeof v === "number" ? (Number.isNaN(v) ? null : format(v, c)) : v;
      } else {
        text = cellToString(raw.rows[i][idx] ?? null);
        if (text !== null && col && isFloatColumn(col) && Number.isNaN(col.values[i])) invalid++;
      }
      if (text === null) {
        blank++;
        continue;
      }
      if (distinct.size < 100000) distinct.add(text);
      if (samples.length < 3 && !samples.includes(text)) samples.push(text);
    }
    out.set(c.key, { blank, distinct: distinct.size, invalid, samples });
  }
  return out;
}
