import { derivedSources } from "./derive";
import { GZIP_LOADER, gzipBase64 } from "./gzip";
import type { ExportPayload } from "./exportFormat";
import type { Dashboard, Lookup, RawTable } from "./types";

export interface ExportPlan {
  included: string[];
  excluded: string[];
}

/** Columns referenced by widgets or filters. */
export function usedColumns(d: Dashboard): Set<string> {
  const used = new Set<string>();
  for (const w of d.widgets) {
    switch (w.kind) {
      case "kpi":
        if (w.measure.column) used.add(w.measure.column);
        if (w.compare) used.add(w.compare.dateColumn);
        break;
      case "bar":
        used.add(w.dimension);
        if (w.measure.column) used.add(w.measure.column);
        break;
      case "time":
        used.add(w.dateColumn);
        if (w.split) used.add(w.split);
        if (w.measure.column) used.add(w.measure.column);
        break;
      case "histogram":
        used.add(w.column);
        break;
      case "scatter":
        used.add(w.x);
        used.add(w.y);
        if (w.colorBy) used.add(w.colorBy);
        break;
      case "pivot":
        used.add(w.rows);
        used.add(w.cols);
        if (w.measure.column) used.add(w.measure.column);
        break;
      case "table":
        break;
    }
  }
  for (const f of d.filters) used.add(f.column);
  used.delete("");
  return used;
}

/** Hidden columns are dropped from the file unless a widget or filter still uses them. */
export function planExport(d: Dashboard): ExportPlan {
  const used = usedColumns(d);
  const included: string[] = [];
  const excluded: string[] = [];
  for (const c of d.columns) (c.hidden && !used.has(c.key) ? excluded : included).push(c.key);
  // Calculated columns need their source columns in the file.
  const need = new Set(included);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of d.columns) {
      if (!need.has(c.key)) continue;
      for (const src of derivedSources(c, d.lookups)) {
        if (!need.has(src)) {
          need.add(src);
          grew = true;
        }
      }
    }
  }
  return { included: d.columns.filter((c) => need.has(c.key)).map((c) => c.key), excluded: d.columns.filter((c) => !need.has(c.key)).map((c) => c.key) };
}

/** Master tables keep only the key and the columns the export includes. */
function pruneLookups(d: Dashboard, included: Set<string>): Lookup[] | undefined {
  if (!d.lookups?.length) return d.lookups;
  return d.lookups
    .map((l) => {
      const cols = d.columns
        .filter((c) => c.derived?.kind === "lookup" && c.derived.lookupId === l.id && included.has(c.key))
        .map((c) => (c.derived as { column: string }).column);
      if (cols.length === 0) return null;
      const keep = [l.masterKey, ...cols].map((h) => l.table.headers.indexOf(h)).filter((i) => i >= 0);
      return { ...l, table: { headers: keep.map((i) => l.table.headers[i]), rows: l.table.rows.map((r) => keep.map((i) => r[i] ?? null)) } };
    })
    .filter((l): l is Lookup => l !== null);
}

export function pruneForExport(d: Dashboard, raw: RawTable): { dashboard: Dashboard; raw: RawTable } {
  const { included } = planExport(d);
  const keep = included.map((k) => raw.headers.indexOf(k)).filter((i) => i >= 0);
  const headers = keep.map((i) => raw.headers[i]);
  const keepSet = new Set(headers);
  return {
    // Excluded columns keep their settings (no values), so a later file with the same column stays hidden.
    dashboard: { ...d, columns: d.columns.filter((c) => keepSet.has(c.key) || c.derived || c.hidden), lookups: pruneLookups(d, new Set(included)) },
    raw: { headers, rows: raw.rows.map((r) => keep.map((i) => r[i] ?? null)) },
  };
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export interface RenderOptions {
  /** Template: layout and settings only, no rows. */
  template?: boolean;
  exportedAt?: number;
  /** gzip the viewer and data (default). Roughly halves the file size. */
  compress?: boolean;
}

/** Builds the standalone HTML. The viewer code and styles are inlined with ids so the viewer can re-save itself. */
export async function renderExportHtml(d: Dashboard, raw: RawTable | null, viewerJs: string, viewerCss: string, opts: RenderOptions = {}): Promise<string> {
  const exportedAt = opts.exportedAt ?? Date.now();
  let payload: ExportPayload;
  if (opts.template || !raw) {
    payload = { format: "elastic-dashboard", version: 1, dashboard: d, raw: null, exportedAt };
  } else {
    const pruned = pruneForExport(d, raw);
    payload = { format: "elastic-dashboard", version: 1, dashboard: pruned.dashboard, raw: pruned.raw, exportedAt };
  }
  // Escape "<" so the JSON can never close the <script> element.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  const js = viewerJs.replace(/<\/script/gi, "<\\/script");
  const css = viewerCss.replace(/<\/style/gi, "<\\/style");
  // base64 has no "<", so the packed blocks cannot break out of their elements either.
  const scripts =
    opts.compress === false
      ? `<script type="application/json" id="ed-data">${json}</script>
<script id="ed-app">${js}</script>`
      : `<script type="application/gzip+base64" id="ed-data-gz">${await gzipBase64(json)}</script>
<script type="application/gzip+base64" id="ed-app-gz">${await gzipBase64(js)}</script>
<script>${GZIP_LOADER}</script>`;
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Elastic Dashboard">
<title>${escapeHtml(d.name)}</title>
<style id="ed-style">${css}</style>
</head>
<body>
<div id="root"></div>
<noscript><p style="padding:24px">このダッシュボードを表示するには JavaScript を有効にしてください。</p></noscript>
${scripts}
</body>
</html>
`;
}

export function safeFileName(name: string): string {
  return (name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim() || "dashboard").slice(0, 120);
}
