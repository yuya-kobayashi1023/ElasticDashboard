import * as XLSX from "xlsx";
import { decodeText, normalizeGrid, ParseError, parseDelimited, type ParsedSheet } from "./grid";
import type { RawCell } from "./types";

export { ParseError, type ParsedSheet };

export interface ParseResult {
  sheets: ParsedSheet[];
  encoding: "utf-8" | "shift_jis" | null;
}

const SPREADSHEET_EXT = /\.(xlsx|xlsm|xlsb|xls|ods)$/i;
const JSON_EXT = /\.json$/i;

export function parseFile(fileName: string, buffer: ArrayBuffer): ParseResult {
  if (buffer.byteLength === 0) throw new ParseError("ファイルが空です。");
  if (SPREADSHEET_EXT.test(fileName)) return { sheets: parseWorkbook(buffer), encoding: null };
  const { text, encoding } = decodeText(buffer);
  if (JSON_EXT.test(fileName)) return { sheets: [parseJson(text)], encoding };
  return { sheets: [parseDelimited(text)], encoding };
}

function parseJson(text: string): ParsedSheet {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ParseError("JSON の形式が正しくありません。");
  }
  const records = findRecordArray(data);
  if (!records) throw new ParseError("JSON 内にオブジェクトの配列が見つかりません。");
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
    }
  }
  const rows = records.map((r) => headers.map((h) => toCell(r[h])));
  return { name: null, table: { headers, rows }, notes: [] };
}

function findRecordArray(data: unknown): Record<string, unknown>[] | null {
  const isRecords = (v: unknown): v is Record<string, unknown>[] =>
    Array.isArray(v) && v.length > 0 && v.every((x) => x !== null && typeof x === "object" && !Array.isArray(x));
  if (isRecords(data)) return data;
  if (data && typeof data === "object") {
    for (const v of Object.values(data)) if (isRecords(v)) return v;
  }
  return null;
}

function toCell(v: unknown): RawCell {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return JSON.stringify(v);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateToText(d: Date): string {
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) return date;
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function parseWorkbook(buffer: ArrayBuffer): ParsedSheet[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array", cellDates: true, dense: true });
  } catch {
    throw new ParseError("Excel ファイルを読み込めませんでした。パスワード付きか、破損している可能性があります。");
  }
  const sheets: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
    const grid: RawCell[][] = aoa.map((row) =>
      row.map((c) => {
        if (c instanceof Date) return Number.isNaN(c.getTime()) ? null : dateToText(c);
        return toCell(c);
      }),
    );
    if (grid.length === 0) continue;
    try {
      sheets.push(normalizeGrid(grid, name));
    } catch {
      // Sheets without a usable table (cover pages, notes) are skipped.
    }
  }
  if (sheets.length === 0) throw new ParseError("表形式のデータを含むシートが見つかりません。");
  return sheets;
}

