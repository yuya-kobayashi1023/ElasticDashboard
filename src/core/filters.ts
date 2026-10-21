import { newId } from "./id";
import type { DatePreset, Filter } from "./types";

/** Toggles a value in the column's value filter, creating the filter when needed (cross-filtering from charts). */
export function toggleFilterValue(filters: Filter[], column: string, value: string): Filter[] {
  const existing = filters.find((f) => f.column === column && f.kind === "values");
  if (!existing || existing.kind !== "values") {
    return [...filters, { id: newId(), column, kind: "values", values: [value] }];
  }
  const values = existing.values.includes(value) ? existing.values.filter((v) => v !== value) : [...existing.values, value];
  return filters.map((f) => (f.id === existing.id ? { ...existing, values } : f));
}

const DAY = 86400000;

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: "last-24h", label: "直近24時間" },
  { id: "last-month", label: "最終月" },
  { id: "last-30", label: "直近30日" },
  { id: "last-90", label: "直近90日" },
  { id: "latest-year", label: "最終年" },
];

/** Bounds of a relative preset, counted back from the latest date in the data. */
export function presetRange(preset: DatePreset, latest: number): [number, number] {
  const d = new Date(latest);
  const y = d.getUTCFullYear();
  const lastDay = Date.UTC(y, d.getUTCMonth(), d.getUTCDate());
  const end = lastDay + DAY - 1;
  switch (preset) {
    case "last-24h":
      return [latest - DAY, latest];
    case "last-month":
      return [Date.UTC(y, d.getUTCMonth(), 1), end];
    case "last-30":
      return [lastDay - 29 * DAY, end];
    case "last-90":
      return [lastDay - 89 * DAY, end];
    case "latest-year":
      return [Date.UTC(y, 0, 1), end];
  }
}

export function isFilterActive(f: Filter): boolean {
  return f.kind === "values" ? f.values.length > 0 : !!f.preset || f.min !== null || f.max !== null;
}

/** Clears a filter's condition but keeps the filter itself. */
export function clearFilter(f: Filter): Filter {
  return f.kind === "values" ? { ...f, values: [] } : { ...f, min: null, max: null, preset: null };
}
