import { FileArrowDownIcon, FileArrowUpIcon, FloppyDiskIcon, InfoIcon, TableIcon, TreeStructureIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { lookupKeys } from "../core/derive";
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Dialog } from "../app/Dialog";
import { FilterBar } from "../components/FilterBar";
import { ThemeScope } from "../components/ThemeScope";
import { useDashboardData } from "../components/useDashboardData";
import { WidgetCard } from "../components/WidgetCard";
import { mergeColumns } from "../core/autoDashboard";
import { renderExportHtml, safeFileName, usedColumns } from "../core/export";
import type { ExportPayload } from "../core/exportFormat";
import { toggleFilterValue } from "../core/filters";
import { columnLabel, TYPE_LABEL } from "../core/format";
import { parseFile, type ParsedSheet, type ParseResult } from "../core/parse";
import type { Dashboard, Filter, RawTable } from "../core/types";
import "../styles/base.css";
import "../styles/app.css";

const ACCEPT = ".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.ods,.json";
const count = new Intl.NumberFormat("ja-JP");
const dateFmt = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric" });

interface Notice {
  tone: "info" | "error";
  text: string;
}

function Viewer({ initial }: { initial: ExportPayload }) {
  const [dashboard, setDashboard] = useState<Dashboard>(initial.dashboard);
  const [raw, setRaw] = useState<RawTable | null>(initial.raw);
  const [filters, setFilters] = useState<Filter[]>(initial.dashboard.filters);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sheets, setSheets] = useState<{ fileName: string; sheets: ParsedSheet[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const masterRef = useRef<HTMLInputElement>(null);
  const [masterTarget, setMasterTarget] = useState<string | null>(null);
  const [masterPicker, setMasterPicker] = useState(false);
  const lookups = dashboard.lookups ?? [];

  const pickMaster = (id: string) => {
    setMasterTarget(id);
    setMasterPicker(false);
    masterRef.current?.click();
  };

  /** Replaces a joined master table with a new file that has the same key and value columns. */
  const updateMaster = async (file: File) => {
    const l = lookups.find((x) => x.id === masterTarget);
    if (!l) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const keys = lookupKeys(l).master;
      const used = dashboard.columns
        .filter((c) => c.derived?.kind === "lookup" && c.derived.lookupId === l.id)
        .map((c) => (c.derived as { column: string }).column);
      const needed = [...keys, ...used];
      const result = await parseOffThread(file);
      const sheet = result.sheets.find((s) => needed.every((h) => s.table.headers.includes(h))) ?? result.sheets[0];
      const missing = needed.filter((h) => !sheet.table.headers.includes(h));
      if (missing.length) {
        setNotice({ tone: "error", text: `「${file.name}」に ${missing.join("、")} 列がないため、マスタを更新できません。` });
        return;
      }
      const idx = needed.map((h) => sheet.table.headers.indexOf(h));
      const table = { headers: needed, rows: sheet.table.rows.map((r) => idx.map((i) => r[i] ?? null)) };
      setDashboard({ ...dashboard, lookups: lookups.map((x) => (x.id === l.id ? { ...x, fileName: file.name, table } : x)) });
      setNotice({ tone: "info", text: `マスタ「${l.fileName}」を「${file.name}」（${count.format(table.rows.length)} 行）に更新しました。このデータで残すには「HTML を保存」を押してください。` });
    } catch (e) {
      setNotice({ tone: "error", text: e instanceof Error ? e.message : "マスタのファイルを読み込めませんでした。" });
    } finally {
      setBusy(false);
    }
  };

  const apply = useCallback(
    (fileName: string, sheet: ParsedSheet, encoding: string | null) => {
      const { columns, report } = mergeColumns(dashboard.columns, sheet.table, raw?.headers ?? dashboard.columns.map((c) => c.key));
      const next = { ...dashboard, columns, source: { fileName, sheetName: sheet.name, importedAt: Date.now(), rowCount: sheet.table.rows.length } };
      setDashboard(next);
      setRaw(sheet.table);
      const used = [...usedColumns(next)];
      const present = new Set(sheet.table.headers);
      const missingUsed = used.filter((k) => !present.has(k) && !next.columns.find((c) => c.key === k)?.derived);
      const parts = [`「${fileName}」を読み込みました（${count.format(sheet.table.rows.length)} 行）`];
      if (missingUsed.length) parts.push(`グラフで使う列のうち、${missingUsed.map((k) => columnLabel(next.columns, k)).join("、")} が見つかりません`);
      if (report.added.length) parts.push(`新しい列: ${report.added.join("、")}`);
      if (report.retyped.length) {
        parts.push(`新しいデータに合わせて種類を変えた列: ${report.retyped.map((r) => `${r.label}（${TYPE_LABEL[r.from]} → ${TYPE_LABEL[r.to]}）`).join("、")}`);
      }
      parts.push(...sheet.notes);
      if (encoding === "shift_jis") parts.push("文字コードは Shift_JIS として読み込みました");
      parts.push("このデータで残すには「HTML を保存」を押してください");
      setNotice({ tone: missingUsed.length ? "error" : "info", text: parts.join("。") + "。" });
    },
    [dashboard, raw],
  );

  const load = useCallback(
    async (file: File) => {
      if (!/\.(csv|tsv|txt|xlsx|xlsm|xlsb|xls|ods|json)$/i.test(file.name)) {
        setNotice({ tone: "error", text: `「${file.name}」は読み込めない形式です。CSV・TSV・Excel・JSON ファイルを選んでください。` });
        return;
      }
      setBusy(true);
      // Let the busy state paint before parsing on the main thread.
      await new Promise((r) => setTimeout(r, 30));
      try {
        const result = await parseOffThread(file);
        if (result.sheets.length > 1) setSheets({ fileName: file.name, sheets: result.sheets });
        else apply(file.name, result.sheets[0], result.encoding);
      } catch (e) {
        setNotice({ tone: "error", text: e instanceof Error ? e.message : "ファイルを読み込めませんでした。" });
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  const save = async () => {
    const js = document.getElementById("ed-app")?.textContent ?? "";
    const css = document.getElementById("ed-style")?.textContent ?? "";
    const html = await renderExportHtml({ ...dashboard, filters }, raw, js, css, { template: !raw });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFileName(dashboard.name)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const f = e.dataTransfer?.files[0];
      if (f) void load(f);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [load]);

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void load(f);
      }}
    />
  );

  return (
    <ThemeScope theme={dashboard.theme}>
      <main className="viewer">
        <header className="viewer-head">
          <div>
            <h1>{dashboard.name}</h1>
            {raw && (
              <p className="muted viewer-source">
                {dashboard.source.fileName}
                {dashboard.source.sheetName ? ` / ${dashboard.source.sheetName}` : ""} ・ {count.format(raw.rows.length)} 行 ・ {dateFmt.format(dashboard.source.importedAt)} 読み込み
              </p>
            )}
          </div>
          <div className="viewer-actions">
            {raw && (
              <>
                <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
                  <FileArrowUpIcon size={18} aria-hidden />
                  データを読み込む
                </button>
                {lookups.length > 0 && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => (lookups.length === 1 ? pickMaster(lookups[0].id) : setMasterPicker(true))}
                  >
                    <TreeStructureIcon size={18} aria-hidden />
                    マスタを更新
                  </button>
                )}
                <button type="button" className="btn btn-primary" onClick={() => void save()}>
                  <FloppyDiskIcon size={18} aria-hidden />
                  HTML を保存
                </button>
              </>
            )}
            {fileInput}
            <input
              ref={masterRef}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void updateMaster(f);
              }}
            />
          </div>
        </header>

        {busy && (
          <div className="busy-banner" role="status">
            <span className="spinner" aria-hidden />
            読み込み中…
          </div>
        )}
        {notice && (
          <div className={`viewer-notice is-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
            {notice.tone === "error" ? <WarningCircleIcon size={20} aria-hidden /> : <InfoIcon size={20} aria-hidden />}
            <span>{notice.text}</span>
            <button type="button" className="icon-btn" aria-label="お知らせを閉じる" onClick={() => setNotice(null)}>
              <XIcon size={16} />
            </button>
          </div>
        )}

        {raw ? (
          <Dashboard_ dashboard={dashboard} raw={raw} filters={filters} setFilters={setFilters} />
        ) : (
          <div className="dropzone viewer-empty">
            <FileArrowUpIcon size={40} className="muted" aria-hidden />
            <p className="dropzone-lead">データのファイルをここにドロップ</p>
            <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
              ファイルを選択
            </button>
            <p className="muted dropzone-formats">
              このテンプレートで使う列: {dashboard.columns.filter((c) => !c.derived).map((c) => c.label).join("、")}
            </p>
          </div>
        )}

        <Dialog open={masterPicker} onClose={() => setMasterPicker(false)} title="更新するマスタを選択" width={520}>
          <div className="choice-list">
            {lookups.map((l) => (
              <button type="button" key={l.id} className="choice" onClick={() => pickMaster(l.id)}>
                <TreeStructureIcon size={22} aria-hidden className="muted" />
                <span className="choice-text">
                  <span className="choice-title">{l.fileName}</span>
                  <span className="choice-sub">
                    {lookupKeys(l)
                      .local.map((k) => columnLabel(dashboard.columns, k))
                      .join(" + ")}
                    で結合
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Dialog>

        <Dialog open={!!sheets} onClose={() => setSheets(null)} title="読み込むシートを選択" width={520}>
          <div className="choice-list">
            {sheets?.sheets.map((s) => (
              <button
                type="button"
                key={s.name}
                className="choice"
                onClick={() => {
                  const f = sheets.fileName;
                  setSheets(null);
                  apply(f, s, null);
                }}
              >
                <TableIcon size={22} aria-hidden className="muted" />
                <span className="choice-text">
                  <span className="choice-title">{s.name}</span>
                  <span className="choice-sub">
                    {count.format(s.table.rows.length)} 行・{s.table.headers.length} 列
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Dialog>

        {dragging && (
          <div className="drop-overlay" aria-hidden>
            <div className="drop-overlay-inner">
              <FileArrowDownIcon size={40} aria-hidden />
              <span>ドロップして読み込む</span>
            </div>
          </div>
        )}
      </main>
    </ThemeScope>
  );
}

function Dashboard_({ dashboard, raw, filters, setFilters }: { dashboard: Dashboard; raw: RawTable; filters: Filter[]; setFilters: React.Dispatch<React.SetStateAction<Filter[]>> }) {
  const { frame, rows } = useDashboardData(raw, dashboard.columns, filters, dashboard.lookups);
  const onToggle = useCallback((column: string, value: string) => setFilters((f) => toggleFilterValue(f, column, value)), [setFilters]);
  if (!frame) {
    return (
      <div className="busy-banner" role="status">
        <span className="spinner" aria-hidden />
        {raw.rows.length.toLocaleString("ja-JP")} 行を集計しています…
      </div>
    );
  }
  return (
    <>
      <FilterBar frame={frame} filters={filters} filteredCount={rows.length} onChange={setFilters} />
      <div className="dash-grid">
        {dashboard.widgets.map((w) => (
          <WidgetCard key={w.id} widget={w} frame={frame} rows={rows} filters={filters} onToggleValue={onToggle} />
        ))}
      </div>
    </>
  );
}

/**
 * Parses a file off the main thread. The viewer has no separate worker file (the export is a single
 * HTML), so it starts its own inlined code as a worker; see the worker branch at the bottom.
 */
async function parseOffThread(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const code = document.getElementById("ed-app")?.textContent;
  if (code && typeof Worker !== "undefined") {
    let url: string | null = null;
    try {
      url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
      const worker = new Worker(url);
      const copy = buffer.slice(0);
      const res = await new Promise<ViewerWorkerResponse>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<ViewerWorkerResponse>) => resolve(e.data);
        worker.onerror = () => reject(new Error("worker"));
        worker.postMessage({ name: file.name, buffer: copy }, [copy]);
      });
      worker.terminate();
      if (!res.ok) throw new Error(res.message);
      res.result.sheets.forEach((sh, i) => (sh.table.rows = JSON.parse(res.rows[i])));
      return res.result;
    } catch (e) {
      // A parse error is final; anything else (blocked workers on file://, old browsers) falls back below.
      if (e instanceof Error && e.message !== "worker") throw e;
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
  return parseFile(file.name, buffer);
}

type ViewerWorkerResponse = { ok: true; result: ParseResult; rows: string[] } | { ok: false; message: string };

const el = typeof document === "undefined" ? null : document.getElementById("ed-data");
const root = typeof document === "undefined" ? null : document.getElementById("root");
if (el && root) {
  const data = JSON.parse(el.textContent ?? "{}") as Partial<ExportPayload> & { dashboard: Dashboard };
  const payload: ExportPayload = { format: "elastic-dashboard", version: 1, dashboard: data.dashboard, raw: data.raw ?? null, exportedAt: data.exportedAt ?? 0 };
  createRoot(root).render(
    <StrictMode>
      <Viewer initial={payload} />
    </StrictMode>,
  );
}

// Running as the parse worker started by parseOffThread.
if (typeof document === "undefined" && typeof self !== "undefined") {
  self.onmessage = (e: MessageEvent<{ name: string; buffer: ArrayBuffer }>) => {
    let res: ViewerWorkerResponse;
    try {
      const result = parseFile(e.data.name, e.data.buffer);
      const rows = result.sheets.map((sh) => JSON.stringify(sh.table.rows));
      for (const sh of result.sheets) sh.table = { headers: sh.table.headers, rows: [] };
      res = { ok: true, result, rows };
    } catch (err) {
      res = { ok: false, message: err instanceof Error ? err.message : "ファイルを読み込めませんでした。" };
    }
    self.postMessage(res);
  };
}
