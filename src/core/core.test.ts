import { describe, expect, it } from "vitest";
import { aggregate, filterRows, groupBy, histogram, timeSeries } from "./aggregate";
import { createDashboard, mergeColumns } from "./autoDashboard";
import { buildFrame } from "./frame";
import { inferColumn, parseDate, parseNumber } from "./infer";
import { decodeText, normalizeGrid, parseDelimited } from "./grid";
import { sampleSales } from "./sample";

describe("parseNumber", () => {
  it.each([
    ["1,234", 1234],
    ["¥12,300", 12300],
    ["￥１２３", 123],
    ["△500", -500],
    ["(1,000)", -1000],
    ["12.5%", 12.5],
    ["3千円", 3],
    ["300円", 300],
    ["abc", NaN],
    ["", NaN],
  ])("%s -> %s", (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});

describe("parseDate", () => {
  it.each([
    ["2025/01/05", Date.UTC(2025, 0, 5)],
    ["2025-1-5", Date.UTC(2025, 0, 5)],
    ["2025年1月5日", Date.UTC(2025, 0, 5)],
    ["2025-01-05 13:45", Date.UTC(2025, 0, 5, 13, 45)],
    ["2025-01-05T13:45:10Z", Date.UTC(2025, 0, 5, 13, 45, 10)],
    ["20250105", Date.UTC(2025, 0, 5)],
    ["令和7年1月5日", Date.UTC(2025, 0, 5)],
    ["2025/02/30", NaN],
    ["2025/04", Date.UTC(2025, 3, 1)],
    ["hello", NaN],
  ])("%s", (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });
});

describe("inferColumn", () => {
  it("detects currency numbers with unit", () => {
    const r = inferColumn("売上", ["¥1,000", "¥2,500", "¥300"]);
    expect(r.type).toBe("number");
    expect(r.format.prefix).toBe("¥");
  });
  it("treats codes with leading zeros as categories", () => {
    expect(inferColumn("店舗", ["001", "002", "001", "003"]).type).toBe("category");
  });
  it("marks unique id columns", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `ORD-${i}`);
    const r = inferColumn("注文ID", ids);
    expect(r.idLike).toBe(true);
  });
  it("treats year numbers as category", () => {
    expect(inferColumn("年度", [2023, 2024, 2023, 2025]).type).toBe("category");
  });
  it("detects dates", () => {
    expect(inferColumn("日付", ["2025/01/01", "2025/01/02", null]).type).toBe("date");
  });
});

describe("parse", () => {
  it("decodes Shift_JIS", () => {
    // "地域" in Shift_JIS
    const bytes = new Uint8Array([0x92, 0x6e, 0x88, 0xe6]);
    expect(decodeText(bytes.buffer)).toEqual({ text: "地域", encoding: "shift_jis" });
  });
  it("skips title rows and trailing totals", () => {
    const sheet = normalizeGrid(
      [
        ["月次売上レポート", null, null],
        [null, null, null],
        ["地域", "売上", "件数"],
        ["関東", 100, 2],
        ["近畿", 50, 1],
        ["合計", 150, 3],
      ],
      "Sheet1",
    );
    expect(sheet.table.headers).toEqual(["地域", "売上", "件数"]);
    expect(sheet.table.rows).toHaveLength(2);
    expect(sheet.notes).toHaveLength(2);
  });
  it("generates headers when missing and dedupes", () => {
    expect(parseDelimited("1,2\n3,4").table.headers).toEqual(["列1", "列2"]);
    expect(parseDelimited("a,a,\n1,2,3").table.headers).toEqual(["a", "a (2)", "列3"]);
  });
  it("handles hundreds of thousands of rows", () => {
    const grid = [["a", "b"], ...Array.from({ length: 300000 }, (_, i) => [String(i), "x"])];
    expect(normalizeGrid(grid, null).table.rows).toHaveLength(300000);
  });
    it("auto-detects tab delimiter", () => {
    expect(parseDelimited("a\tb\n1\t2").table.headers).toEqual(["a", "b"]);
  });
});

describe("dashboard generation and aggregation", () => {
  const raw = sampleSales(500);
  const dash = createDashboard(raw, { fileName: "s.csv", sheetName: null, importedAt: 0 }, "s", { withWidgets: true });
  const frame = buildFrame(raw, dash.columns);

  it("infers sample column types", () => {
    const types = Object.fromEntries(dash.columns.map((c) => [c.key, c.type]));
    expect(types).toMatchObject({ 注文日: "date", 地域: "category", 売上金額: "number", 数量: "number", 満足度: "number" });
    expect(dash.columns.find((c) => c.key === "注文ID")!.idLike).toBe(true);
  });

  it("starts without widgets by default", () => {
    const empty = createDashboard(raw, { fileName: "s.csv", sheetName: null, importedAt: 0 }, "s");
    expect(empty.widgets).toEqual([]);
    expect(empty.filters.length).toBeGreaterThan(0);
  });

  it("builds a sensible layout", () => {
    const kinds = dash.widgets.map((w) => w.kind);
    expect(kinds[0]).toBe("kpi");
    expect(kinds).toContain("time");
    expect(kinds).toContain("bar");
    expect(kinds.at(-1)).toBe("table");
    expect(dash.filters.some((f) => f.kind === "range")).toBe(true);
  });

  it("filters and aggregates", () => {
    const all = filterRows(frame, []);
    expect(all.length).toBe(500);
    const kanto = filterRows(frame, [{ id: "f", column: "地域", kind: "values", values: ["関東"] }]);
    expect(kanto.length).toBeGreaterThan(0);
    expect(kanto.length).toBeLessThan(500);
    const total = aggregate(frame, all, { agg: "sum", column: "売上金額" });
    const { bars } = groupBy(frame, all, "地域", { agg: "sum", column: "売上金額" }, 20, "value-desc");
    expect(bars.reduce((a, b) => a + b.value, 0)).toBeCloseTo(total);
    const limited = groupBy(frame, all, "地域", { agg: "sum", column: "売上金額" }, 3, "value-desc");
    expect(limited.bars).toHaveLength(4);
    expect(limited.bars.reduce((a, b) => a + b.value, 0)).toBeCloseTo(total);
  });

  it("builds time series and histograms", () => {
    const all = filterRows(frame, []);
    const ts = timeSeries(frame, all, "注文日", "auto", { agg: "count", column: null }, "地域");
    expect(ts.bucket).toBe("month");
    expect(ts.series.reduce((a, s) => a + s.values.reduce((x, y) => x + y, 0), 0)).toBe(500);
    const bins = histogram(frame, all, "数量");
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(500);
  });

  it("merges columns on data replacement", () => {
    const edited = dash.columns.map((c) => (c.key === "地域" ? { ...c, label: "エリア", hidden: true } : c));
    const next = { headers: [...raw.headers.filter((h) => h !== "担当者"), "新列"], rows: [] };
    const { columns, report } = mergeColumns(edited, next);
    expect(columns.find((c) => c.key === "地域")).toMatchObject({ label: "エリア", hidden: true });
    expect(report).toEqual({ added: ["新列"], missing: ["担当者"] });
  });
});

describe("measure priority", () => {
  it("prefers money columns for the primary chart", () => {
    const raw = sampleSales(200);
    const dash = createDashboard(raw, { fileName: "s.csv", sheetName: null, importedAt: 0 }, "s", { withWidgets: true });
    const time = dash.widgets.find((w) => w.kind === "time");
    expect(time && time.kind === "time" && time.measure.column).toBe("売上金額");
  });
});
