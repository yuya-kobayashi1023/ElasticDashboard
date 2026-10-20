import { gunzipBase64 } from "./gzip";
import type { Dashboard, RawTable } from "./types";

/** Data embedded in an exported HTML file. `raw` is null for templates (layout only). */
export interface ExportPayload {
  format: "elastic-dashboard";
  version: 1;
  dashboard: Dashboard;
  raw: RawTable | null;
  exportedAt: number;
}

const DATA_RE = /<script type="application\/json" id="ed-data">([\s\S]*?)<\/script>/;
const DATA_GZ_RE = /<script type="application\/gzip\+base64" id="ed-data-gz">([^<]*)<\/script>/;

export function isExportHtml(fileName: string): boolean {
  return /\.html?$/i.test(fileName);
}

/** Reads the dashboard back from an exported HTML file. Throws with a user-facing message. */
export async function parseExportHtml(html: string): Promise<ExportPayload> {
  const plain = DATA_RE.exec(html);
  const packed = DATA_GZ_RE.exec(html);
  if (!plain && !packed) throw new Error("この HTML はダッシュボードの書き出しファイルではありません。");
  let data: Partial<ExportPayload>;
  try {
    data = JSON.parse(plain ? plain[1] : await gunzipBase64(packed![1]));
  } catch {
    throw new Error("書き出しファイルの中身を読み取れませんでした。ファイルが途中で切れている可能性があります。");
  }
  if (!data.dashboard || !Array.isArray(data.dashboard.widgets) || !Array.isArray(data.dashboard.columns)) {
    throw new Error("書き出しファイルにダッシュボードの設定が含まれていません。");
  }
  return { format: "elastic-dashboard", version: 1, dashboard: data.dashboard, raw: data.raw ?? null, exportedAt: data.exportedAt ?? 0 };
}

/** Appends rows from `next`, matching columns by name. New columns are added at the end. */
export function appendRows(base: RawTable, next: RawTable): RawTable {
  const headers = [...base.headers];
  for (const h of next.headers) if (!headers.includes(h)) headers.push(h);
  const pad = (row: (string | number | null)[], from: string[]) => {
    const idx = new Map(from.map((h, i) => [h, i]));
    return headers.map((h) => (idx.has(h) ? (row[idx.get(h)!] ?? null) : null));
  };
  return { headers, rows: [...base.rows.map((r) => pad(r, base.headers)), ...next.rows.map((r) => pad(r, next.headers))] };
}

/** Number of rows in `next` that already exist in `base` (same values in the shared columns). */
export function countDuplicateRows(base: RawTable, next: RawTable): number {
  const shared = next.headers.filter((h) => base.headers.includes(h));
  if (shared.length === 0) return 0;
  const bi = shared.map((h) => base.headers.indexOf(h));
  const ni = shared.map((h) => next.headers.indexOf(h));
  const seen = new Set(base.rows.map((r) => JSON.stringify(bi.map((i) => r[i] ?? null))));
  let dup = 0;
  for (const r of next.rows) if (seen.has(JSON.stringify(ni.map((i) => r[i] ?? null)))) dup++;
  return dup;
}
