import { create } from "zustand";
import { parseDelimited, type ParsedSheet } from "../core/grid";
import { usedColumns } from "../core/export";
import { isExportHtml, parseExportHtml } from "../core/exportFormat";
import { columnLabel } from "../core/format";
import type { Dashboard } from "../core/types";
import type { ParseResult } from "../core/parse";
import { readDataFile } from "../core/readFile";
import { useApp, useToasts } from "./store";

export type ImportMode = "new" | "replace" | "append";

interface PendingSheets {
  fileName: string;
  result: ParseResult;
  mode: ImportMode;
}

interface Mismatch {
  fileName: string;
  sheet: ParsedSheet;
  encoding: ParseResult["encoding"];
  multiSheet: boolean;
  missing: string[];
  usedCount: number;
}

interface ImportState {
  /** Replacement data that lacks most columns the dashboard uses: confirm before applying. */
  mismatch: Mismatch | null;
  resolveMismatch: (choice: "replace" | "new" | "cancel") => Promise<void>;
  busy: string | null;
  error: string | null;
  pending: PendingSheets | null;
  /** A file dropped while a dashboard is open: ask whether to create or replace. */
  dropped: File | null;
  importFile: (file: File, mode: ImportMode) => Promise<void>;
  /** Settings from a template HTML waiting for a data file. */
  template: { fileName: string; dashboard: Dashboard } | null;
  clearTemplate: () => void;
  importText: (text: string) => Promise<boolean>;
  chooseSheet: (sheet: ParsedSheet | null) => Promise<void>;
  setDropped: (f: File | null) => void;
  clearError: () => void;
}

const count = new Intl.NumberFormat("ja-JP");
const baseName = (name: string) => name.replace(/\.[^.]+$/, "");

async function finalize(fileName: string, sheet: ParsedSheet, mode: ImportMode, encoding: ParseResult["encoding"], multiSheet: boolean, confirmed = false) {
  const app = useApp.getState();
  if (mode === "replace" && !confirmed && app.dashboard) {
    const used = usedColumns(app.dashboard);
    const present = new Set(sheet.table.headers);
    const missing = [...used].filter((k) => !present.has(k));
    if (used.size > 0 && missing.length / used.size > 0.5) {
      useImporter.setState({
        mismatch: { fileName, sheet, encoding, multiSheet, missing: missing.map((k) => columnLabel(app.dashboard!.columns, k)), usedCount: used.size },
      });
      return;
    }
  }
  const toast = useToasts.getState().push;
  const source = { fileName, sheetName: sheet.name, importedAt: Date.now() };
  const notes = [...sheet.notes];
  if (encoding === "shift_jis") notes.push("文字コードは Shift_JIS として読み込みました");
  const size = `${count.format(sheet.table.rows.length)} 行・${sheet.table.headers.length} 列`;

  if (mode === "new" && useImporter.getState().template) {
    const t = useImporter.getState().template!;
    useImporter.setState({ template: null });
    const report = await app.createFrom(t.dashboard, sheet.table, source, sheet.prepared?.columns);
    toast(
      {
        tone: report.missing.length ? "info" : "success",
        message:
          `テンプレート「${t.dashboard.name}」に「${fileName}」を読み込みました（${size}）。` +
          (report.missing.length ? `見つからない列: ${report.missing.join("、")}。` : "") +
          (notes.length ? notes.join("。") + "。" : ""),
      },
      10000,
    );
    return;
  }

  if (mode === "append") {
    const r = await app.appendData(sheet.table, fileName, sheet.prepared?.columns);
    const parts = [`「${fileName}」の ${count.format(r.rows)} 行を追加しました`];
    if (r.duplicates > 0) parts.push(`うち ${count.format(r.duplicates)} 行は、すでにある行と同じ内容です。同じファイルを重ねて追加していないか確認してください`);
    if (r.added.length) parts.push(`新しい列: ${r.added.join("、")}`);
    if (r.missing.length) parts.push(`追加したファイルにない列: ${r.missing.join("、")}（空欄になります）`);
    toast(
      { tone: r.missing.length || r.duplicates ? "info" : "success", message: parts.concat(notes).join("。") + "。", action: { label: "元に戻す", run: () => useApp.getState().undo() } },
      r.missing.length ? 12000 : 8000,
    );
    return;
  }

  if (mode === "new") {
    const name = multiSheet && sheet.name ? `${baseName(fileName)} - ${sheet.name}` : baseName(fileName);
    await app.create(sheet.table, source, name, sheet.prepared);
    toast(
      {
        tone: "success",
        message: `「${fileName}」を読み込みました（${size}）。${notes.length ? notes.join("。") + "。" : ""}列の種類は自動で判定しています。「ウィジェットを追加」から表示するグラフを選んでください。`,
        action: { label: "列を確認", run: () => useApp.getState().setView("columns") },
      },
      9000,
    );
    return;
  }

  const report = await app.replaceData(sheet.table, source, sheet.prepared?.columns);
  const parts = [`データを「${fileName}」に差し替えました（${size}）`];
  if (report.added.length) parts.push(`新しい列: ${report.added.join("、")}`);
  if (report.missing.length) parts.push(`見つからない列: ${report.missing.join("、")}`);
  toast(
    {
      tone: report.missing.length ? "info" : "success",
      message: parts.concat(notes).join("。") + "。",
      action: { label: "元に戻す", run: () => useApp.getState().undo() },
    },
    report.missing.length ? 12000 : 8000,
  );
}

export const useImporter = create<ImportState>((set, get) => ({
  busy: null,
  error: null,
  pending: null,
  dropped: null,
  mismatch: null,
  template: null,

  clearTemplate() {
    set({ template: null });
  },

  async resolveMismatch(choice) {
    const m = get().mismatch;
    set({ mismatch: null });
    if (!m || choice === "cancel") return;
    await finalize(m.fileName, m.sheet, choice, m.encoding, m.multiSheet, true);
  },

  async importFile(file, mode) {
    set({ busy: file.name, error: null, dropped: null });
    try {
      if (isExportHtml(file.name)) {
        await importExportHtml(file, mode);
        return;
      }
      const result = await readDataFile(file);
      if (result.sheets.length > 1) {
        set({ pending: { fileName: file.name, result, mode } });
        return;
      }
      await finalize(file.name, result.sheets[0], mode, result.encoding, false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "読み込みに失敗しました。";
      set({ error: message });
      useToasts.getState().push({ tone: "error", message }, 10000);
    } finally {
      set({ busy: null });
    }
  },

  async importText(text) {
    try {
      const sheet = parseDelimited(text);
      await finalize("貼り付けデータ", sheet, "new", null, false);
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : "貼り付けた内容を表として読み込めませんでした。" });
      return false;
    }
  },

  async chooseSheet(sheet) {
    const p = get().pending;
    set({ pending: null });
    if (!p || !sheet) return;
    set({ busy: p.fileName });
    try {
      await finalize(p.fileName, sheet, p.mode, p.result.encoding, true);
    } finally {
      set({ busy: null });
    }
  },

  setDropped(f) {
    set({ dropped: f });
  },

  clearError() {
    set({ error: null });
  },
}));

/** Restores a dashboard from an exported HTML file, or holds a template until data is chosen. */
async function importExportHtml(file: File, mode: ImportMode) {
  if (mode !== "new") throw new Error("書き出した HTML は「新規作成」の画面から読み込んでください。");
  const payload = await parseExportHtml(await file.text());
  const app = useApp.getState();
  if (!payload.raw) {
    if (app.dashboard) app.closeCurrent();
    useImporter.setState({ template: { fileName: file.name, dashboard: payload.dashboard } });
    useToasts.getState().push({ tone: "info", message: `テンプレート「${payload.dashboard.name}」を読み込みました。続けてデータのファイルを選んでください。` }, 9000);
    return;
  }
  const source = { ...payload.dashboard.source, importedAt: payload.dashboard.source.importedAt ?? Date.now() };
  await app.createFrom(payload.dashboard, payload.raw, source);
  useToasts.getState().push({ tone: "success", message: `「${file.name}」からダッシュボードを復元しました。データとレイアウトをそのまま編集できます。` }, 8000);
}
