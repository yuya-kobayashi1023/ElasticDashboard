import { describe, expect, it } from "vitest";
import { frameKey } from "./useDashboardData";
import type { ColumnMeta } from "../core/types";

const col = (over: Partial<ColumnMeta> = {}): ColumnMeta => ({
  key: "売上",
  label: "売上",
  type: "number",
  inferredType: "number",
  hidden: false,
  idLike: false,
  format: {},
  ...over,
} as ColumnMeta);

describe("frameKey", () => {
  const base = frameKey([col()]);
  it("changes when type, parse or dateUnit change", () => {
    expect(frameKey([col({ type: "text" })])).not.toBe(base);
    expect(frameKey([col({ parse: { kind: "number", scale: 1000 } as ColumnMeta["parse"] })])).not.toBe(base);
    const a = frameKey([col({ parse: { kind: "number", scale: 1000 } as ColumnMeta["parse"] })]);
    expect(frameKey([col({ parse: { kind: "number", scale: 100 } as ColumnMeta["parse"] })])).not.toBe(a);
    expect(frameKey([col({ type: "date", dateUnit: "year" })])).not.toBe(frameKey([col({ type: "date" })]));
  });
  it("ignores label, visibility and format", () => {
    expect(frameKey([col({ label: "別名", hidden: true, idLike: true, format: { decimals: 2 } as ColumnMeta["format"] })])).toBe(base);
  });
});
