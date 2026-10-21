import { describe, expect, it } from "vitest";
import { buildFrame } from "./frame";
import { createDashboard } from "./autoDashboard";
import { groupBy, histogram } from "./aggregate";
import { formatMeasure, formatNumber } from "./format";
import { cumulative, linearRegression, movingAverage } from "./stats";

describe("cumulative", () => {
  it("adds up and carries the total over blanks", () => {
    expect(cumulative([1, 2, NaN, 3])).toEqual([1, 3, 3, 6]);
    expect(cumulative([])).toEqual([]);
  });
});

describe("movingAverage", () => {
  it("leaves the first n - 1 points empty", () => {
    const r = movingAverage([1, 2, 3, 4, 5], 3);
    expect(r.slice(0, 2).every(Number.isNaN)).toBe(true);
    expect(r.slice(2)).toEqual([2, 3, 4]);
  });
  it("skips blanks inside a window", () => {
    expect(movingAverage([2, NaN, 4], 3)[2]).toBe(3);
    expect(movingAverage([NaN, NaN, NaN], 3)[2]).toBeNaN();
  });
  it("is the identity for a window of 1", () => {
    expect(movingAverage([1, 5, 2], 1)).toEqual([1, 5, 2]);
  });
});

describe("linearRegression", () => {
  it("fits an exact line", () => {
    const r = linearRegression([1, 2, 3, 4], [3, 5, 7, 9])!;
    expect(r.slope).toBeCloseTo(2);
    expect(r.intercept).toBeCloseTo(1);
    expect(r.r).toBeCloseTo(1);
  });
  it("reports a negative correlation", () => {
    expect(linearRegression([1, 2, 3], [6, 4, 2])!.r).toBeCloseTo(-1);
  });
  it("is null when undefined", () => {
    expect(linearRegression([1], [1])).toBeNull();
    expect(linearRegression([2, 2, 2], [1, 2, 3])).toBeNull();
    expect(linearRegression([1, 2, 3], [5, 5, 5])).toBeNull();
  });
});

describe("number format override", () => {
  it("keeps the dashboard style without an override", () => {
    expect(formatNumber(1_234_567, null, "compact")).toBe("1.2M");
  });
  it("switches style, decimals, prefix and suffix per call", () => {
    expect(formatNumber(1_234_567, null, "compact", { style: "ja" })).toBe("123.5万");
    expect(formatNumber(1_234_567, null, "compact", { style: "full" })).toBe("1,234,567");
    expect(formatNumber(1_234_567, null, "compact", { style: "en", decimals: 2 })).toBe("1.23M");
    expect(formatNumber(1234.5, null, "full", { decimals: 0, prefix: "¥", suffix: "円" })).toBe("¥1,235円");
    expect(formatNumber(1234.5, null, "full", { style: "auto" })).toBe("1,234.5");
  });
  it("does not change the module-level style", () => {
    formatNumber(1_234_567, null, "compact", { style: "full" });
    expect(formatNumber(1_234_567, null, "compact")).toBe("1.2M");
  });
  it("applies to measures", () => {
    expect(formatMeasure(1234.5, { agg: "count", column: null }, new Map(), "full", { decimals: 1, suffix: "件" })).toBe("1,234.5件");
  });
});

describe("bar and histogram options", () => {
  const raw = { headers: ["g", "v"], rows: ["a", "b", "c", "d", "e"].map((g, i) => [g, (i + 1) * 10]) };
  const d = createDashboard(raw, { fileName: "t.csv", sheetName: null, importedAt: 0 }, "t");
  const frame = buildFrame(raw, d.columns);
  const rows = Uint32Array.from([0, 1, 2, 3, 4]);
  const sum = { agg: "sum", column: "v" } as const;
  it("folds the remainder by default and drops it on request", () => {
    const withOther = groupBy(frame, rows, "g", sum, 2, "value-desc");
    expect(withOther.bars.map((b) => b.isOther)).toEqual([false, false, true]);
    const without = groupBy(frame, rows, "g", sum, 2, "value-desc", undefined, false);
    expect(without.bars).toHaveLength(2);
    expect(without.sum).toBe(150);
  });
  it("makes the requested number of bins", () => {
    expect(histogram(frame, rows, "v", 10)).toHaveLength(10);
    expect(histogram(frame, rows, "v", 10).reduce((a, b) => a + b.count, 0)).toBe(5);
  });
});
