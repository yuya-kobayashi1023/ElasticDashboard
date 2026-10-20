import { create } from "zustand";
import { createDashboard, mergeColumns, type ReplaceReport } from "../core/autoDashboard";
import { appendRows, countDuplicateRows } from "../core/exportFormat";
import { newId } from "../core/id";
import * as storage from "../core/storage";
import type { ParsedSheet } from "../core/grid";
import type { ColumnMeta, Dashboard, DashboardSummary, DataSource, Filter, RawTable } from "../core/types";

export type View = "dashboard" | "columns";
interface Snapshot {
  dashboard: Dashboard;
  raw: RawTable;
}
type SaveState = "saved" | "saving" | "error";

interface State {
  ready: boolean;
  list: DashboardSummary[];
  dashboard: Dashboard | null;
  raw: RawTable | null;
  /** Undo history. Each step keeps the data it was made with, so undoing a data replacement restores the rows too. */
  past: Snapshot[];
  future: Snapshot[];
  saveState: SaveState;
  view: View;
  init: () => Promise<void>;
  open: (id: string) => Promise<void>;
  closeCurrent: () => void;
  setView: (v: View) => void;
  create: (raw: RawTable, source: Omit<DataSource, "rowCount">, name: string, prepared?: ParsedSheet["prepared"]) => Promise<void>;
  /** Edits that the user can undo. Consecutive edits with the same `coalesce` key (e.g. typing) form one undo step. */
  update: (fn: (d: Dashboard) => Dashboard, coalesce?: string) => void;
  /** Filter state is saved but kept out of undo history. */
  setFilters: (filters: Filter[]) => void;
  undo: () => void;
  redo: () => void;
  replaceData: (raw: RawTable, source: Omit<DataSource, "rowCount">, inferred?: ColumnMeta[]) => Promise<ReplaceReport>;
  /** Adds rows from another file with the same layout (e.g. next month's export). */
  appendData: (raw: RawTable, fileName: string, inferred?: ColumnMeta[]) => Promise<ReplaceReport & { added: string[]; rows: number; duplicates: number }>;
  /** Creates a dashboard from saved settings (an exported HTML or template) and data. */
  createFrom: (config: Dashboard, raw: RawTable, source: Omit<DataSource, "rowCount">, inferred?: ColumnMeta[]) => Promise<ReplaceReport>;
  remove: (id: string) => Promise<void>;
}

const LAST_KEY = "elastic-dashboard:last";

/** "売上" → "売上 (2)" when a dashboard with that name already exists, so the sidebar can tell them apart. */
export function uniqueName(name: string, list: { name: string }[]): string {
  const taken = new Set(list.map((d) => d.name));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}
const HISTORY_LIMIT = 100;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lastCoalesce: { key: string; at: number } | null = null;

function remember(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_KEY, id);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    /* storage unavailable */
  }
}

export const useApp = create<State>((set, get) => {
  const scheduleSave = () => {
    set({ saveState: "saving" });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const d = get().dashboard;
      if (!d) return;
      try {
        const list = await storage.saveDashboard(d);
        set({ list, saveState: "saved" });
      } catch {
        set({ saveState: "error" });
      }
    }, 400);
  };

  const commit = (next: Dashboard, history: boolean, coalesce?: string, prevRaw?: RawTable) => {
    const prev = get().dashboard;
    const raw = prevRaw ?? get().raw;
    if (!prev || !raw) return;
    next = { ...next, updatedAt: Date.now() };
    const now = Date.now();
    const merge = coalesce !== undefined && lastCoalesce?.key === coalesce && now - lastCoalesce.at < 1500;
    lastCoalesce = coalesce !== undefined ? { key: coalesce, at: now } : null;
    if (history && merge) set({ dashboard: next, future: [] });
    else if (history) set({ dashboard: next, past: [...get().past, { dashboard: prev, raw }].slice(-HISTORY_LIMIT), future: [] });
    else set({ dashboard: next });
    scheduleSave();
  };

  return {
    ready: false,
    list: [],
    dashboard: null,
    raw: null,
    past: [],
    future: [],
    saveState: "saved",
    view: "dashboard",

    async init() {
      const list = await storage.listDashboards().catch(() => []);
      set({ list });
      let last: string | null = null;
      try {
        last = localStorage.getItem(LAST_KEY);
      } catch {
        /* ignore */
      }
      const target = list.find((d) => d.id === last) ?? list[0];
      if (target) await get().open(target.id);
      set({ ready: true });
    },

    async open(id) {
      if (get().dashboard?.id === id) return;
      const loaded = await storage.loadDashboard(id);
      if (!loaded) return;
      remember(id);
      set({ dashboard: loaded.dashboard, raw: loaded.raw, past: [], future: [], view: "dashboard", saveState: "saved" });
    },

    closeCurrent() {
      remember(null);
      set({ dashboard: null, raw: null, past: [], future: [] });
    },

    setView(view) {
      set({ view });
    },

    async create(raw, source, name, prepared) {
      const dashboard = createDashboard(raw, source, uniqueName(name, get().list), { prepared });
      await storage.saveRaw(dashboard.id, raw);
      const list = await storage.saveDashboard(dashboard);
      remember(dashboard.id);
      set({ list, dashboard, raw, past: [], future: [], view: "dashboard", saveState: "saved" });
    },

    update(fn, coalesce) {
      const d = get().dashboard;
      if (d) commit(fn(d), true, coalesce);
    },

    setFilters(filters) {
      const d = get().dashboard;
      if (d) commit({ ...d, filters }, false);
    },

    undo() {
      lastCoalesce = null;
      const { past, dashboard, raw, future } = get();
      if (!dashboard || !raw || past.length === 0) return;
      const target = past[past.length - 1];
      // Filters are not part of history: keep the current ones.
      set({ dashboard: { ...target.dashboard, filters: dashboard.filters }, raw: target.raw, past: past.slice(0, -1), future: [{ dashboard, raw }, ...future] });
      if (target.raw !== raw) void storage.saveRaw(dashboard.id, target.raw);
      scheduleSave();
    },

    redo() {
      const { past, dashboard, raw, future } = get();
      if (!dashboard || !raw || future.length === 0) return;
      const target = future[0];
      set({ dashboard: { ...target.dashboard, filters: dashboard.filters }, raw: target.raw, past: [...past, { dashboard, raw }], future: future.slice(1) });
      if (target.raw !== raw) void storage.saveRaw(dashboard.id, target.raw);
      scheduleSave();
    },

    async replaceData(raw, source, inferred) {
      const d = get().dashboard;
      if (!d) return { added: [], missing: [], retyped: [] };
      const { columns, report } = mergeColumns(d.columns, raw, get().raw?.headers, inferred);
      const prevRaw = get().raw ?? undefined;
      await storage.saveRaw(d.id, raw);
      set({ raw });
      commit({ ...d, columns, source: { ...source, rowCount: raw.rows.length } }, true, undefined, prevRaw);
      return report;
    },

    async appendData(raw, fileName, inferred) {
      const d = get().dashboard;
      const prev = get().raw;
      if (!d || !prev) return { added: [], missing: [], retyped: [], rows: 0, duplicates: 0 };
      const duplicates = countDuplicateRows(prev, raw);
      const merged = appendRows(prev, raw);
      // New columns take their type from the appended file; existing ones keep theirs while the values fit.
      const { columns, report } = mergeColumns(d.columns, merged, prev.headers, inferred);
      await storage.saveRaw(d.id, merged);
      set({ raw: merged });
      const source = { ...d.source, appended: [...(d.source.appended ?? []), fileName], rowCount: merged.rows.length, importedAt: Date.now() };
      commit({ ...d, columns, source }, true, undefined, prev);
      const present = new Set(raw.headers);
      return { added: report.added, missing: prev.headers.filter((h) => !present.has(h)), retyped: report.retyped, rows: raw.rows.length, duplicates };
    },

    async createFrom(config, raw, source, inferred) {
      const { columns, report } = mergeColumns(config.columns, raw, undefined, inferred);
      const now = Date.now();
      const dashboard: Dashboard = {
        ...structuredClone(config),
        name: uniqueName(config.name, get().list),
        id: newId(),
        createdAt: now,
        updatedAt: now,
        columns,
        source: { ...source, rowCount: raw.rows.length },
      };
      await storage.saveRaw(dashboard.id, raw);
      const list = await storage.saveDashboard(dashboard);
      remember(dashboard.id);
      set({ list, dashboard, raw, past: [], future: [], view: "dashboard", saveState: "saved" });
      return report;
    },

    async remove(id) {
      const list = await storage.deleteDashboard(id);
      set({ list });
      if (get().dashboard?.id === id) {
        get().closeCurrent();
        if (list[0]) await get().open(list[0].id);
      }
    },
  };
});

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "success" | "error";
  action?: { label: string; run: () => void };
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">, ms?: number) => void;
  dismiss: (id: number) => void;
}

let toastSeq = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push(t, ms = 6000) {
    const id = ++toastSeq;
    set({ toasts: [...get().toasts.slice(-1), { ...t, id }] });
    setTimeout(() => get().dismiss(id), ms);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));
