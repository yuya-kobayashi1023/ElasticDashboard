import { newId } from "./id";
import type { Filter } from "./types";

/** Toggles a value in the column's value filter, creating the filter when needed (cross-filtering from charts). */
export function toggleFilterValue(filters: Filter[], column: string, value: string): Filter[] {
  const existing = filters.find((f) => f.column === column && f.kind === "values");
  if (!existing || existing.kind !== "values") {
    return [...filters, { id: newId(), column, kind: "values", values: [value] }];
  }
  const values = existing.values.includes(value) ? existing.values.filter((v) => v !== value) : [...existing.values, value];
  return filters.map((f) => (f.id === existing.id ? { ...existing, values } : f));
}
