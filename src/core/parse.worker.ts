import { autoFilters } from "./autoDashboard";
import { buildFrame } from "./frame";
import { inferColumns } from "./infer";
import { ParseError, parseFile, type ParseResult } from "./parse";

export type WorkerRequest = { name: string; buffer: ArrayBuffer };
export type WorkerResponse = { ok: true; result: ParseResult; rows: string[] } | { ok: false; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  let res: WorkerResponse;
  try {
    const result = parseFile(e.data.name, e.data.buffer);
    for (const sheet of result.sheets) {
      const columns = inferColumns(sheet.table.headers, sheet.table.rows);
      sheet.prepared = { columns, filters: autoFilters(columns, buildFrame(sheet.table, columns)) };
    }
    // Send rows as one JSON string: copying a string to the page is cheap, a deep clone of many arrays is not.
    const rows = result.sheets.map((s) => JSON.stringify(s.table.rows));
    for (const s of result.sheets) s.table = { headers: s.table.headers, rows: [] };
    res = { ok: true, result, rows };
  } catch (err) {
    res = {
      ok: false,
      message: err instanceof ParseError ? err.message : "ファイルを読み込めませんでした。形式を確認してください。",
    };
  }
  self.postMessage(res);
};
