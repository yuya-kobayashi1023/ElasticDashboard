import { datePart, evaluateFormula, FormulaError, localKeys, masterIndex } from "./derive";
import { cellToString, parseDate, parseNumber } from "./infer";
import type { ColumnMeta, ColumnType, ColumnValues, Frame, Lookup, RawTable } from "./types";

export function coerceColumn(raw: RawTable, index: number, type: ColumnType): ColumnValues {
  const n = raw.rows.length;
  if (type === "number" || type === "date") {
    const values = new Float64Array(n);
    const fn = type === "number" ? parseNumber : parseDate;
    for (let i = 0; i < n; i++) values[i] = fn(raw.rows[i][index] ?? null);
    return { type, values };
  }
  const values: (string | null)[] = new Array(n);
  for (let i = 0; i < n; i++) values[i] = cellToString(raw.rows[i][index] ?? null);
  return { type, values };
}

export function buildFrame(raw: RawTable, columns: ColumnMeta[], lookups: Lookup[] = []): Frame {
  const indexByKey = new Map(raw.headers.map((h, i) => [h, i]));
  const values = new Map<string, ColumnValues>();
  const meta = new Map<string, ColumnMeta>();
  const errors = new Map<string, string>();
  const n = raw.rows.length;
  for (const col of columns) {
    if (col.derived) continue;
    const idx = indexByKey.get(col.key);
    if (idx === undefined) continue;
    values.set(col.key, coerceColumn(raw, idx, col.type));
    meta.set(col.key, col);
  }
  // Calculated columns run in list order, so later ones may use earlier ones.
  for (const col of columns) {
    const d = col.derived;
    if (!d) continue;
    try {
      if (d.kind === "formula") {
        values.set(col.key, { type: "number", values: evaluateFormula(d.expr, values, n) });
      } else if (d.kind === "lookup") {
        const l = lookups.find((x) => x.id === d.lookupId);
        if (!l) throw new FormulaError("結合したマスタが見つかりません");
        const src = values.get(l.localKey);
        if (!src) throw new FormulaError("結合に使う列がデータにありません");
        const ci = l.table.headers.indexOf(d.column);
        if (ci < 0) throw new FormulaError(`マスタに「${d.column}」列がありません`);
        const index = masterIndex(l);
        const keys = localKeys(src, n);
        // Build a one-column table of looked-up raw cells, then coerce it like a file column.
        const cells = { headers: [col.key], rows: keys.map((k) => [k === null ? null : (l.table.rows[index.get(k) ?? -1]?.[ci] ?? null)]) };
        values.set(col.key, coerceColumn(cells, 0, col.type));
      } else {
        const src = values.get(d.source);
        if (!src) throw new FormulaError("元の日付列がデータにありません");
        if (src.type !== "date") throw new FormulaError("元の列が日付ではありません");
        const out: (string | null)[] = new Array(n);
        for (let i = 0; i < n; i++) out[i] = datePart(src.values[i], d.part);
        values.set(col.key, { type: "category", values: out });
      }
      meta.set(col.key, col);
    } catch (e) {
      errors.set(col.key, `計算列「${col.label}」を計算できません（${e instanceof Error ? e.message : "原因不明"}）`);
    }
  }
  return { rowCount: n, columns: values, meta, errors };
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
  const coerced = coerceColumn(raw, idx, col.type);
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
    if ((coerced.type === "number" || coerced.type === "date") && Number.isNaN(coerced.values[i])) invalid++;
  }
  return { blank, distinct: distinct.size, invalid, samples };
}
