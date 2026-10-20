import { useMemo } from "react";
import { filterRows } from "../core/aggregate";
import { buildFrame } from "../core/frame";
import type { ColumnMeta, Filter, Frame, Lookup, RawTable } from "../core/types";

/** Coerces raw data once per column-type change; renames and visibility only refresh metadata. */
export function useDashboardData(raw: RawTable, columns: ColumnMeta[], filters: Filter[], lookups?: Lookup[]): { frame: Frame; rows: Uint32Array } {
  const typeKey = columns.map((c) => `${c.key}\u0000${c.type}\u0000${c.derived ? JSON.stringify(c.derived) : ""}`).join("\u0001");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const base = useMemo(() => buildFrame(raw, columns, lookups), [raw, typeKey, lookups]);
  const frame = useMemo<Frame>(
    () => ({ ...base, meta: new Map(columns.filter((c) => base.columns.has(c.key)).map((c) => [c.key, c])) }),
    [base, columns],
  );
  const rows = useMemo(() => filterRows(frame, filters), [frame, filters]);
  return { frame, rows };
}
