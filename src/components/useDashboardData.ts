import { useEffect, useMemo, useState } from "react";
import { filterRows } from "../core/aggregate";
import { buildFrame, buildFrameAsync } from "../core/frame";
import type { ColumnMeta, Filter, Frame, Lookup, RawTable } from "../core/types";

/** From this many rows the frame is built in small slices so the page stays responsive. */
const LARGE = 50000;
const NO_ROWS = new Uint32Array(0);

export interface DashboardData {
  /** null only while the first build of a large dataset is running. */
  frame: Frame | null;
  rows: Uint32Array;
  /** A (re)build is running; the frame shown may be the previous one. */
  computing: boolean;
}

/** Coerces raw data once per column-type change; renames and visibility only refresh metadata. */
export function useDashboardData(raw: RawTable, columns: ColumnMeta[], filters: Filter[], lookups?: Lookup[]): DashboardData {
  const typeKey = columns.map((c) => `${c.key}\u0000${c.type}\u0000${c.derived ? JSON.stringify(c.derived) : ""}`).join("\u0001");
  const large = raw.rows.length >= LARGE;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const syncBase = useMemo(() => (large ? null : buildFrame(raw, columns, lookups)), [raw, typeKey, lookups, large]);

  const [asyncBase, setAsyncBase] = useState<Frame | null>(null);
  const [computing, setComputing] = useState(false);
  useEffect(() => {
    if (!large) return;
    const signal = { cancelled: false };
    setComputing(true);
    void buildFrameAsync(raw, columns, lookups ?? [], signal).then((f) => {
      if (!f || signal.cancelled) return;
      setAsyncBase(f);
      setComputing(false);
    });
    return () => {
      signal.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, typeKey, lookups, large]);

  const base = large ? asyncBase : syncBase;
  const frame = useMemo<Frame | null>(
    () => (base ? { ...base, meta: new Map(columns.filter((c) => base.columns.has(c.key)).map((c) => [c.key, c])) } : null),
    [base, columns],
  );
  const rows = useMemo(() => (frame ? filterRows(frame, filters) : NO_ROWS), [frame, filters]);
  return { frame, rows, computing: large && computing };
}
