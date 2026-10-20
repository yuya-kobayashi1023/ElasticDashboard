import { describe, expect, it } from "vitest";
import { comparePeriods, filterRows, groupBy, pivot, scatterPoints } from "./aggregate";
import { createDashboard, mergeColumns } from "./autoDashboard";
import { datePart, datePartOrder, displayFormula, FormulaError, parseFormula, toStoredFormula } from "./derive";
import { planExport, renderExportHtml } from "./export";
import { appendRows, countDuplicateRows, parseExportHtml } from "./exportFormat";
import { buildFrame } from "./frame";
import { sampleSales } from "./sample";
import { contrastRatio, deltaE, paletteIssues, PALETTES, SURFACES, themeVars, DEFAULT_THEME } from "./theme";
import type { ColumnMeta } from "./types";

const raw = sampleSales(400);
const dash = createDashboard(raw, { fileName: "s.csv", sheetName: null, importedAt: 0 }, "s", { withWidgets: true });

const calc = (key: string, label: string, derived: ColumnMeta["derived"], type: ColumnMeta["type"] = "number"): ColumnMeta => ({
  key,
  label,
  type,
  inferredType: type,
  hidden: false,
  idLike: false,
  format: { prefix: "", suffix: "", decimals: null },
  derived,
});

describe("formulas", () => {
  it("parses precedence and parentheses", () => {
    const stored = toStoredFormula("[売上金額] / ([数量] + 0) * 2 - -1", dash.columns);
    expect(stored).toBe("[売上金額] / ([数量] + 0) * 2 - -1");
  });
  it("keeps needed parentheses when printing", () => {
    expect(toStoredFormula("[数量] - ([単価] - 1)", dash.columns)).toBe("[数量] - ([単価] - 1)");
    expect(toStoredFormula("[数量] / ([単価] * 2)", dash.columns)).toBe("[数量] / ([単価] * 2)");
  });
  it("reports readable errors", () => {
    expect(() => parseFormula("[存在しない列] * 2", () => null)).toThrow(FormulaError);
    expect(() => toStoredFormula("[数量] +", dash.columns)).toThrow("式が途中で終わっています");
    expect(() => toStoredFormula("[数量] ^ 2", dash.columns)).toThrow("「^」は使えません");
  });
  it("shows labels after a rename", () => {
    const cols = dash.columns.map((c) => (c.key === "数量" ? { ...c, label: "個数" } : c));
    expect(displayFormula("[売上金額] / [数量]", cols)).toBe("[売上金額] / [個数]");
  });
  it("computes values and division by zero as blank", () => {
    const cols = [...dash.columns, calc("calc:a", "単価2", { kind: "formula", expr: "[売上金額] / [数量]" }), calc("calc:z", "z", { kind: "formula", expr: "[数量] / 0" })];
    const frame = buildFrame(raw, cols);
    const a = frame.columns.get("calc:a")!.values as Float64Array;
    const amount = frame.columns.get("売上金額")!.values as Float64Array;
    const qty = frame.columns.get("数量")!.values as Float64Array;
    expect(a[0]).toBeCloseTo(amount[0] / qty[0]);
    expect(Number.isNaN((frame.columns.get("calc:z")!.values as Float64Array)[0])).toBe(true);
  });
  it("records an error instead of failing the frame", () => {
    const frame = buildFrame(raw, [...dash.columns, calc("calc:bad", "壊れた列", { kind: "formula", expr: "[地域] * 2" })]);
    expect(frame.columns.has("calc:bad")).toBe(false);
    expect(frame.errors.get("calc:bad")).toContain("数値ではありません");
  });
});

describe("date parts", () => {
  it("extracts parts", () => {
    const t = Date.UTC(2025, 0, 5, 13); // Sunday
    expect(datePart(t, "weekday")).toBe("日曜");
    expect(datePart(t, "yearmonth")).toBe("2025-01");
    expect(datePart(t, "quarter")).toBe("Q1");
    expect(datePart(t, "hour")).toBe("13時");
  });
  it("sorts weekdays by calendar order", () => {
    const col = { ...calc("calc:w", "曜日", { kind: "datepart", source: "注文日", part: "weekday" }, "category"), order: datePartOrder("weekday") };
    const frame = buildFrame(raw, [...dash.columns, col]);
    const { bars } = groupBy(frame, filterRows(frame, []), "calc:w", { agg: "count", column: null }, 10, "label", col.order);
    expect(bars.map((b) => b.label)).toEqual(["月曜", "火曜", "水曜", "木曜", "金曜", "土曜", "日曜"]);
  });
});

describe("new widgets", () => {
  const frame = buildFrame(raw, dash.columns);
  const all = filterRows(frame, []);
  it("pivot totals add up", () => {
    const p = pivot(frame, all, "地域", "カテゴリ", { agg: "sum", column: "売上金額" });
    const sumCells = p.cells.flat().reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);
    expect(sumCells).toBeCloseTo(p.grand);
    expect(p.rowTotals.reduce((a, b) => a + b, 0)).toBeCloseTo(p.grand);
  });
  it("pivot folds extra rows into その他", () => {
    const p = pivot(frame, all, "商品名", "地域", { agg: "count", column: null }, 5, 3);
    expect(p.rowLabels).toHaveLength(6);
    expect(p.rowLabels[5]).toMatch(/^その他/);
    expect(p.cells.flat().reduce((a, b) => a + b, 0)).toBe(400);
  });
  it("scatter caps colored groups at three", () => {
    const s = scatterPoints(frame, all, "数量", "売上金額", "地域");
    expect(s.groups).toHaveLength(4);
    expect(s.points.every((p) => p.group <= 3)).toBe(true);
    expect(s.valid).toBe(400);
  });
  it("compares the latest period", () => {
    const c = comparePeriods(frame, all, { agg: "count", column: null }, "注文日", "month")!;
    expect(c.bucket).toBe("month");
    expect(c.spark.length).toBeLessThanOrEqual(12);
    expect(c.current).toBe(c.spark[c.spark.length - 1]);
    expect(typeof c.partial).toBe("boolean");
  });
});

describe("export round trip", () => {
  it("restores dashboard and data from HTML", async () => {
    const html = await renderExportHtml(dash, raw, "console.log('</script>')", "body{}", { exportedAt: 1, compress: false });
    expect(html).not.toContain("console.log('</script>')");
    const back = await parseExportHtml(html);
    expect(back.dashboard.widgets).toHaveLength(dash.widgets.length);
    expect(back.raw!.rows).toHaveLength(400);
  });
  it("exports templates without rows", async () => {
    const back = await parseExportHtml(await renderExportHtml(dash, raw, "", "", { template: true }));
    expect(back.raw).toBeNull();
    expect(back.dashboard.columns).toHaveLength(dash.columns.length);
  });
  it("keeps sources of calculated columns", () => {
    const cols = dash.columns.map((c) => (c.key === "数量" ? { ...c, hidden: true } : c));
    const d = { ...dash, columns: [...cols, calc("calc:a", "客単価", { kind: "formula", expr: "[売上金額] / [数量]" })] };
    expect(planExport(d).included).toContain("数量");
  });
  it("keeps settings of excluded columns without their values", async () => {
    const cols = dash.columns.map((c) => (c.key === "注文ID" ? { ...c, hidden: true } : c));
    const back = await parseExportHtml(await renderExportHtml({ ...dash, columns: cols }, raw, "", ""));
    expect(back.raw!.headers).not.toContain("注文ID");
    expect(back.dashboard.columns.find((c) => c.key === "注文ID")?.hidden).toBe(true);
  });
  it("rejects unrelated HTML", async () => {
    await expect(parseExportHtml("<html></html>")).rejects.toThrow("書き出しファイルではありません");
  });
});

describe("append and merge", () => {
  it("appends rows by column name", () => {
    const a = { headers: ["a", "b"], rows: [[1, 2]] };
    const b = { headers: ["b", "c"], rows: [[3, 4]] };
    expect(appendRows(a, b)).toEqual({ headers: ["a", "b", "c"], rows: [[1, 2, null], [null, 3, 4]] });
  });
  it("counts rows that already exist", () => {
    const a = { headers: ["a", "b"], rows: [[1, 2], [3, 4]] };
    expect(countDuplicateRows(a, { headers: ["b", "a"], rows: [[2, 1], [9, 9]] })).toBe(1);
  });
  it("keeps calculated columns when data is replaced", () => {
    const cols = [...dash.columns, calc("calc:a", "客単価", { kind: "formula", expr: "[売上金額] / [数量]" })];
    const { columns, report } = mergeColumns(cols, raw, raw.headers);
    expect(columns.some((c) => c.key === "calc:a")).toBe(true);
    expect(report.missing).toEqual([]);
  });
});

describe("theme", () => {
  it("built-in palettes keep neighbours apart", () => {
    for (const p of Object.values(PALETTES)) {
      expect(paletteIssues(p.light, SURFACES.warm.vars["--surface"]).filter((i) => i.message.includes("似ていて"))).toEqual([]);
      expect(paletteIssues(p.dark, SURFACES.dark.vars["--surface"])).toEqual([]);
    }
  });
  it("flags look-alike custom colors", () => {
    expect(paletteIssues(["#b4583a", "#b65a3c"], "#fffcf7")[0].message).toContain("似ていて");
    expect(deltaE("#000000", "#ffffff")).toBeGreaterThan(90);
  });
  it("picks readable text on the accent", () => {
    const light = themeVars({ ...DEFAULT_THEME, accent: "#f5e663" });
    expect(light["--text-inverse"]).toBe("#1d1b19");
    const dark = themeVars({ ...DEFAULT_THEME, accent: "#3e5c8a" });
    expect(contrastRatio(dark["--text-inverse"], "#3e5c8a")).toBeGreaterThan(4.5);
  });
});

describe("auto layout on non-sales data", () => {
  const raw = {
    headers: ["番号", "受付日", "種別", "初回応答(分)", "満足度"],
    rows: Array.from({ length: 60 }, (_, i) => [`INQ-${i}`, `2025/10/${(i % 28) + 1}`, ["質問", "不具合", "要望"][i % 3], 10 + (i % 7), `${60 + (i % 40)}%`]),
  };
  const d = createDashboard(raw, { fileName: "q.csv", sheetName: null, importedAt: 0 }, "q", { withWidgets: true });
  it("averages durations and ratios instead of summing", () => {
    const kpis = d.widgets.filter((w) => w.kind === "kpi").map((w) => (w.kind === "kpi" ? w.measure : null));
    expect(kpis).toContainEqual({ agg: "avg", column: "初回応答(分)" });
    expect(kpis).toContainEqual({ agg: "avg", column: "満足度" });
  });
  it("counts rows in charts when there is no amount column", () => {
    const bar = d.widgets.find((w) => w.kind === "bar");
    expect(bar && bar.kind === "bar" && bar.measure).toEqual({ agg: "count", column: null });
  });
  it("does not double 別 in titles", async () => {
    const { widgetTitle } = await import("./format");
    const bar = d.widgets.find((w) => w.kind === "bar")!;
    expect(widgetTitle(bar, d.columns)).toBe("種別ごとの件数");
  });
});

describe("master lookups", () => {
  it("normalizes keys", async () => {
    const { normalizeKey } = await import("./derive");
    expect(normalizeKey("001")).toBe("1");
    expect(normalizeKey(1)).toBe("1");
    expect(normalizeKey("１２")).toBe("12");
    expect(normalizeKey(" S-01 ")).toBe("S-01");
    expect(normalizeKey("")).toBeNull();
  });
  it("adds master columns by key and leaves unmatched rows blank", async () => {
    const data = { headers: ["店舗コード", "売上"], rows: [["001", 100], ["002", 50], ["009", 10]] };
    const lookup = { id: "m", fileName: "店舗.csv", table: { headers: ["店舗コード", "店舗名", "面積"], rows: [[1, "新宿", "120"], [2, "梅田", "80"]] }, masterKey: "店舗コード", localKey: "店舗コード" };
    const cols: ColumnMeta[] = [
      { ...calc("店舗コード", "店舗コード", undefined, "category") },
      { ...calc("売上", "売上", undefined, "number") },
      { ...calc("lookup:m:店舗名", "店舗名", { kind: "lookup", lookupId: "m", column: "店舗名" }, "category") },
      { ...calc("lookup:m:面積", "面積", { kind: "lookup", lookupId: "m", column: "面積" }, "number") },
    ];
    const frame = buildFrame(data, cols, [lookup]);
    expect(frame.columns.get("lookup:m:店舗名")!.values).toEqual(["新宿", "梅田", null]);
    expect(Array.from(frame.columns.get("lookup:m:面積")!.values as Float64Array)).toEqual([120, 80, NaN]);
    const d = { ...dash, columns: cols, widgets: [], filters: [], lookups: [lookup] };
    const back = await parseExportHtml(await renderExportHtml(d, data, "", ""));
    expect(back.dashboard.lookups![0].table.headers).toEqual(["店舗コード", "店舗名", "面積"]);
    const hidden = { ...d, columns: cols.map((c) => (c.key === "lookup:m:面積" ? { ...c, hidden: true } : c)) };
    const back2 = await parseExportHtml(await renderExportHtml(hidden, data, "", ""));
    expect(back2.dashboard.lookups![0].table.headers).toEqual(["店舗コード", "店舗名"]);
  });
});

describe("compressed export", () => {
  it("round-trips through gzip and is much smaller", async () => {
    const big = "x".repeat(200000) + "</script>";
    const plain = await renderExportHtml(dash, raw, big, "", { compress: false });
    const packed = await renderExportHtml(dash, raw, big, "");
    expect(packed.length).toBeLessThan(plain.length / 3);
    expect(packed).not.toContain("</script>x");
    const back = await parseExportHtml(packed);
    expect(back.raw!.rows).toHaveLength(400);
    const { gunzipBase64 } = await import("./gzip");
    const app = /id="ed-app-gz">([^<]*)</.exec(packed)![1];
    expect((await gunzipBase64(app)).endsWith("<\\/script>")).toBe(true);
  });
});
