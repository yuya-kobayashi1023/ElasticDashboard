import type { Agg, ColumnType, ColumnValues } from "./types";

/** Types stored as Float64Array (NaN = blank). */
export function isFloatType(t: ColumnType): boolean {
  return t !== "category" && t !== "text";
}

/** Type guard for columns stored as Float64Array. */
export function isFloatColumn(c: ColumnValues): c is Extract<ColumnValues, { values: Float64Array }> {
  return c.type !== "category" && c.type !== "text";
}

const AGGS: Record<ColumnType, Agg[]> = {
  number: ["count", "sum", "avg", "min", "max", "distinct"],
  duration: ["count", "sum", "avg", "min", "max", "distinct"],
  time: ["count", "avg", "min", "max", "distinct"],
  date: ["count", "min", "max", "distinct"],
  // sum = number of true, avg = share of true
  boolean: ["count", "sum", "avg", "distinct"],
  category: ["count", "distinct"],
  text: ["count", "distinct"],
};

/** Aggregations that make sense for a column of this type. */
export function aggsFor(t: ColumnType): Agg[] {
  return AGGS[t];
}

/** Columns that group rows (bar / pivot / split / color). */
export function isDimensionType(t: ColumnType): boolean {
  return t === "category" || t === "text" || t === "boolean";
}

/** Columns on a continuous axis (histogram, scatter). */
export function isContinuousType(t: ColumnType): boolean {
  return t === "number" || t === "duration" || t === "time";
}

/** Columns that can be the target of sum / avg / min / max. */
export function isMeasureColumnType(t: ColumnType): boolean {
  return t === "number" || t === "duration" || t === "time" || t === "boolean";
}
