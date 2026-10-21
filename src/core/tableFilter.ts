import { isFloatColumn, isFloatType } from "./columnTypes";
import { formatValue } from "./format";
import { parseDateValue, parseNumber } from "./infer";
import { parseDuration, parseTimeOfDay } from "./parsers";
import type { ColumnMeta, Frame } from "./types";

/** A compiled per-column filter. "invalid" is reported to the user and ignored when filtering. */
export type ColumnFilter =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "text"; needle: string }
  | { kind: "number"; test: (v: number) => boolean }
  /** Plain (non-expression) text typed into a date / time / duration column: matched against the displayed text. */
  | { kind: "valueText"; needle: string }
  /** Boolean column: "true" / "false" / "blank" (anything else means no filter). */
  | { kind: "bool"; want: "true" | "false" | "blank" };

const EXPR_RE = /^(>=|<=|>|<|=)\s*(.*)$/;

/** Parses the right-hand side of an expression for the column type; NaN when it is not a valid value. */
function operand(s: string, type: ColumnMeta["type"]): number {
  const t = s.trim();
  if (t === "") return NaN;
  switch (type) {
    case "date":
      return parseDateValue(t);
    case "time":
      return parseTimeOfDay(t);
    case "duration":
      return parseDuration(t);
    default:
      return parseNumber(t);
  }
}

export function parseColumnFilter(input: string, type: ColumnMeta["type"]): ColumnFilter {
  const text = input.trim();
  if (text === "") return { kind: "none" };
  if (type === "boolean") return text === "true" || text === "false" || text === "blank" ? { kind: "bool", want: text } : { kind: "none" };
  if (!isFloatType(type)) return { kind: "text", needle: text.toLowerCase() };

  const m = EXPR_RE.exec(text);
  if (m) {
    const n = operand(m[2], type);
    if (Number.isNaN(n)) return { kind: "invalid" };
    switch (m[1]) {
      case ">":
        return { kind: "number", test: (v) => v > n };
      case ">=":
        return { kind: "number", test: (v) => v >= n };
      case "<":
        return { kind: "number", test: (v) => v < n };
      case "<=":
        return { kind: "number", test: (v) => v <= n };
      default:
        return { kind: "number", test: (v) => v === n };
    }
  }
  if (text.includes("..")) {
    const [a, b, ...rest] = text.split("..");
    if (rest.length || (a.trim() === "" && b.trim() === "")) return { kind: "invalid" };
    const lo = a.trim() === "" ? -Infinity : operand(a, type);
    const hi = b.trim() === "" ? Infinity : operand(b, type);
    if (Number.isNaN(lo) || Number.isNaN(hi)) return { kind: "invalid" };
    return { kind: "number", test: (v) => v >= lo && v <= hi };
  }
  if (type === "date") return { kind: "valueText", needle: text.replace(/[-.]/g, "/") };
  if (type === "time" || type === "duration") return { kind: "valueText", needle: text.toLowerCase() };
  const n = parseNumber(text);
  return Number.isNaN(n) ? { kind: "invalid" } : { kind: "number", test: (v) => v === n };
}

/** Keeps the rows that match every active filter, in a single pass over the row index array. */
export function applyColumnFilters(frame: Frame, rows: Uint32Array, filters: ReadonlyMap<string, ColumnFilter>): Uint32Array {
  const tests: ((i: number) => boolean)[] = [];
  for (const [key, f] of filters) {
    const col = frame.columns.get(key);
    if (!col || f.kind === "none" || f.kind === "invalid") continue;
    if (f.kind === "text") {
      if (isFloatColumn(col)) continue;
      const v = col.values;
      const needle = f.needle;
      tests.push((i) => v[i] !== null && v[i]!.toLowerCase().includes(needle));
    } else if (f.kind === "number") {
      if (!isFloatColumn(col) || col.type === "boolean") continue;
      const v = col.values;
      const test = f.test;
      tests.push((i) => !Number.isNaN(v[i]) && test(v[i]));
    } else if (f.kind === "bool") {
      if (col.type !== "boolean") continue;
      const v = col.values;
      const want = f.want;
      tests.push((i) => (want === "blank" ? Number.isNaN(v[i]) : want === "true" ? v[i] === 1 : v[i] === 0));
    } else if (isFloatColumn(col) && col.type !== "boolean") {
      const v = col.values;
      const meta = frame.meta.get(key);
      const needle = f.needle;
      // Values repeat a lot (one per day), so format each distinct value once.
      const cache = new Map<number, boolean>();
      tests.push((i) => {
        const t = v[i];
        if (Number.isNaN(t)) return false;
        let hit = cache.get(t);
        if (hit === undefined) {
          hit = formatValue(t, meta).toLowerCase().includes(needle);
          cache.set(t, hit);
        }
        return hit;
      });
    }
  }
  if (tests.length === 0) return rows;
  const out = new Uint32Array(rows.length);
  let n = 0;
  outer: for (let k = 0; k < rows.length; k++) {
    const i = rows[k];
    for (let t = 0; t < tests.length; t++) if (!tests[t](i)) continue outer;
    out[n++] = i;
  }
  return out.slice(0, n);
}

/**
 * Column keys in table order, including unchecked columns. `order` (the full list) wins over `columns`
 * (how the order was stored before `order` existed); keys in neither come last in column-settings order.
 */
export function orderedTableKeys(w: { columns: string[] | null; order?: string[] }, available: string[]): string[] {
  const set = new Set(available);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of [...(w.order ?? w.columns ?? []), ...available]) {
    if (set.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}
