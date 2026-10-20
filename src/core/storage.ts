import { createStore, del, get, set } from "idb-keyval";
import type { Dashboard, DashboardSummary, RawTable } from "./types";

const store = createStore("elastic-dashboard", "kv");
const INDEX_KEY = "index";

export function summarize(d: Dashboard): DashboardSummary {
  return { id: d.id, name: d.name, updatedAt: d.updatedAt, rowCount: d.source.rowCount, fileName: d.source.fileName };
}

export async function listDashboards(): Promise<DashboardSummary[]> {
  return ((await get<DashboardSummary[]>(INDEX_KEY, store)) ?? []).sort((a, b) => b.updatedAt - a.updatedAt);
}

async function writeIndex(update: (list: DashboardSummary[]) => DashboardSummary[]): Promise<DashboardSummary[]> {
  const next = update(await listDashboards()).sort((a, b) => b.updatedAt - a.updatedAt);
  await set(INDEX_KEY, next, store);
  return next;
}

/**
 * Rows are stored as a JSON string: IndexedDB copies a string far faster than a deep structured clone
 * of hundreds of thousands of small arrays, which would freeze the page while saving or opening.
 */
type StoredRaw = RawTable | { json: string };

export async function loadDashboard(id: string): Promise<{ dashboard: Dashboard; raw: RawTable } | null> {
  const [dashboard, stored] = await Promise.all([get<Dashboard>(`dash:${id}`, store), get<StoredRaw>(`rows:${id}`, store)]);
  if (!dashboard || !stored) return null;
  const raw = "json" in stored ? (JSON.parse(stored.json) as RawTable) : stored;
  return { dashboard, raw };
}

export async function saveDashboard(d: Dashboard): Promise<DashboardSummary[]> {
  await set(`dash:${d.id}`, d, store);
  return writeIndex((list) => [summarize(d), ...list.filter((x) => x.id !== d.id)]);
}

export async function saveRaw(id: string, raw: RawTable): Promise<void> {
  await set(`rows:${id}`, { json: JSON.stringify(raw) } satisfies StoredRaw, store);
}

export async function deleteDashboard(id: string): Promise<DashboardSummary[]> {
  await Promise.all([del(`dash:${id}`, store), del(`rows:${id}`, store)]);
  return writeIndex((list) => list.filter((x) => x.id !== id));
}
