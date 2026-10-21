import { describe, expect, it } from "vitest";
import { donutSlices, filterRows, heatmapGrid } from "./aggregate";
import { createDashboard } from "./autoDashboard";
import { buildFrame } from "./frame";
import { parseNote } from "./note";
import { sampleSales } from "./sample";

const raw = sampleSales(400);
const dash = createDashboard(raw, { fileName: "s.csv", sheetName: null, importedAt: 0 }, "s", { withWidgets: true });
const frame = buildFrame(raw, dash.columns);
const all = filterRows(frame, []);
const count = { agg: "count", column: null } as const;

describe("donutSlices", () => {
  it("keeps the total and folds the rest into その他", () => {
    const { slices, total } = donutSlices(frame, all, "商品名", count, 3);
    expect(slices).toHaveLength(4);
    expect(slices[3].isOther).toBe(true);
    expect(slices[3].label).toMatch(/^その他/);
    expect(total).toBe(400);
    expect(slices.reduce((a, s) => a + s.value, 0)).toBe(400);
  });
  it("has no その他 when everything fits", () => {
    const { slices } = donutSlices(frame, all, "地域", count, 10);
    expect(slices.some((s) => s.isOther)).toBe(false);
    expect(slices.map((s) => s.value)).toEqual([...slices.map((s) => s.value)].sort((a, b) => b - a));
  });
});

describe("heatmapGrid", () => {
  it("counts weekday x month in calendar order", () => {
    const h = heatmapGrid(frame, all, { column: "注文日", unit: "month" }, { column: "注文日", unit: "weekday" }, count);
    expect(h.yLabels).toEqual(["月曜", "火曜", "水曜", "木曜", "金曜", "土曜", "日曜"]);
    const months = h.xLabels.map((l) => Number(l.replace("月", "")));
    expect(months).toEqual([...months].sort((a, b) => a - b));
    expect(h.cells.flat().reduce<number>((a, v) => a + (v ?? 0), 0)).toBe(400);
    expect(h.max).toBeGreaterThanOrEqual(h.min);
  });
  it("leaves empty cells null", () => {
    const h = heatmapGrid(frame, all, { column: "注文日", unit: "day" }, { column: "地域" }, count);
    const empties = h.cells.flat().filter((v) => v === null).length;
    expect(h.cells.flat().length).toBe(h.xLabels.length * h.yLabels.length);
    expect(empties).toBeGreaterThanOrEqual(0);
    expect(h.min).toBeGreaterThan(0);
  });
  it("works with two category columns and a sum", () => {
    const h = heatmapGrid(frame, all, { column: "カテゴリ" }, { column: "地域" }, { agg: "sum", column: "売上金額" });
    expect(h.cells.length).toBe(h.yLabels.length);
    expect(h.cells.flat().every((v) => v === null || v >= 0)).toBe(true);
  });
  it("rejects a unit on a non-date column", () => {
    const h = heatmapGrid(frame, all, { column: "地域", unit: "hour" }, { column: "カテゴリ" }, count);
    expect(h.cells).toEqual([]);
  });
});

describe("parseNote", () => {
  it("parses headings, lists, paragraphs and bold", () => {
    const b = parseNote("# 見出し\n## 小\n- a\n- **b**\n\n本文1\n本文2\n\n別の段落");
    expect(b.map((x) => x.type)).toEqual(["h1", "h2", "ul", "p", "p"]);
    expect(b[2]).toMatchObject({ type: "ul", items: [[{ text: "a", bold: false }], [{ text: "b", bold: true }]] });
    expect(b[3]).toMatchObject({ type: "p" });
    expect((b[3] as { lines: unknown[] }).lines).toHaveLength(2);
  });
  it("keeps markup as plain text", () => {
    const b = parseNote("<script>alert(1)</script> **x**");
    expect(b[0]).toMatchObject({ type: "p", lines: [[{ text: "<script>alert(1)</script> ", bold: false }, { text: "x", bold: true }]] });
  });
  it("returns nothing for blank text", () => {
    expect(parseNote(" \n\n")).toEqual([]);
  });
});
