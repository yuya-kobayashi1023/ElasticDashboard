import Papa from "papaparse";
import { parseDate, parseNumber } from "./infer";
import type { ColumnMeta, Filter, RawCell, RawTable } from "./types";

export interface ParsedSheet {
  name: string | null;
  table: RawTable;
  notes: string[];
  /** Column inference and default filters, computed in the parse worker so the UI stays responsive. */
  prepared?: { columns: ColumnMeta[]; filters: Filter[] };
}

export class ParseError extends Error {}

export function decodeText(buffer: ArrayBuffer): { text: string; encoding: "utf-8" | "shift_jis" } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return { text: text.replace(/^﻿/, ""), encoding: "utf-8" };
  } catch {
    // Excel on Japanese Windows saves CSV as Shift_JIS (CP932) by default.
    return { text: new TextDecoder("shift_jis").decode(buffer), encoding: "shift_jis" };
  }
}

export function parseDelimited(text: string): ParsedSheet {
  if (text.trim() === "") throw new ParseError("ファイルにデータがありません。");
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimiter: "" });
  const grid: RawCell[][] = result.data.map((row) => row.map((c) => (c.trim() === "" ? null : c)));
  return normalizeGrid(grid, null);
}

const isEmpty = (c: RawCell) => c === null || (typeof c === "string" && c.trim() === "");
const isTyped = (c: RawCell) => typeof c === "number" || (c !== null && (!Number.isNaN(parseNumber(c)) || !Number.isNaN(parseDate(c))));
const isYear = (c: RawCell) => {
  const n = typeof c === "number" ? c : parseNumber(c);
  return Number.isInteger(n) && n >= 1900 && n <= 2100;
};

/**
 * Decides column by column whether the first row is data rather than a header. Columns whose body is
 * numbers or dates give the evidence: a typed first cell there means data, a text cell means header.
 * Text-only columns say nothing. Year-like headers over non-year values ("2023" columns in a wide
 * table) count as headers.
 */
function firstRowIsData(first: RawCell[], body: RawCell[][], width: number): boolean {
  let data = 0;
  let header = 0;
  for (let c = 0; c < width; c++) {
    const vals = body.map((r) => r[c] ?? null).filter((v) => !isEmpty(v));
    if (vals.length < 3 || vals.filter(isTyped).length / vals.length < 0.9) continue;
    const h = first[c] ?? null;
    if (isEmpty(h)) continue;
    if (isTyped(h) && !(isYear(h) && !vals.every(isYear))) data++;
    else header++;
  }
  return data > 0 && header === 0;
}
const SUMMARY_RE = /^(合計|総計|小計|計|総合計|total|grand total|sum|subtotal)$/i;

/**
 * Finds the header row, drops title rows above it, empty columns and trailing summary rows.
 */
export function normalizeGrid(input: RawCell[][], name: string | null): ParsedSheet {
  const notes: string[] = [];
  const grid = input.filter((row) => row.some((c) => !isEmpty(c)));
  if (grid.length === 0) throw new ParseError("ファイルにデータがありません。");

  const filled = (row: RawCell[]) => row.filter((c) => !isEmpty(c)).length;
  const probe = grid.slice(0, 50);
  const maxWidth = Math.max(...probe.map(filled));
  let headerIndex = probe.findIndex((row, i) => i < 20 && filled(row) >= Math.max(1, Math.ceil(maxWidth * 0.6)));
  if (headerIndex < 0) headerIndex = 0;
  if (headerIndex > 0) notes.push(`先頭の ${headerIndex} 行をタイトルとして除外しました`);

  // A loop, not Math.max(...rows): spreading hundreds of thousands of rows exceeds the argument limit.
  let width = 0;
  for (let i = headerIndex; i < grid.length; i++) if (grid[i].length > width) width = grid[i].length;
  const headerRow = grid[headerIndex];
  const nonEmptyHeader = headerRow.filter((c) => !isEmpty(c));
  const headerLooksLikeData =
    nonEmptyHeader.length > 0 &&
    (nonEmptyHeader.every(isTyped) || firstRowIsData(headerRow, grid.slice(headerIndex + 1, headerIndex + 51), width));

  const body = headerLooksLikeData ? grid.slice(headerIndex) : grid.slice(headerIndex + 1);
  if (headerLooksLikeData) notes.push("見出し行が見つからないため、列名を自動で付けました");

  // Keep only columns that have a header or any value.
  const keep: number[] = [];
  for (let c = 0; c < width; c++) {
    const hasHeader = !headerLooksLikeData && !isEmpty(headerRow[c] ?? null);
    if (hasHeader || body.some((r) => !isEmpty(r[c] ?? null))) keep.push(c);
  }

  const used = new Map<string, number>();
  const headers = keep.map((c, i) => {
    const rawHeader = headerLooksLikeData ? null : (headerRow[c] ?? null);
    let h = isEmpty(rawHeader) ? `列${i + 1}` : String(rawHeader).replace(/\s+/g, " ").trim();
    const n = used.get(h) ?? 0;
    used.set(h, n + 1);
    if (n > 0) h = `${h} (${n + 1})`;
    return h;
  });

  let rows = body.map((r) => keep.map((c) => (isEmpty(r[c] ?? null) ? null : (r[c] as RawCell))));
  let dropped = 0;
  while (rows.length > 1) {
    const last = rows[rows.length - 1];
    const first = last.find((c) => c !== null);
    if (typeof first === "string" && SUMMARY_RE.test(first.normalize("NFKC").replace(/\s/g, ""))) {
      rows = rows.slice(0, -1);
      dropped++;
    } else break;
  }
  if (dropped > 0) notes.push(`末尾の合計行 ${dropped} 行を除外しました`);
  if (rows.length === 0) throw new ParseError("見出し行の下にデータ行がありません。");
  return { name, table: { headers, rows }, notes };
}
