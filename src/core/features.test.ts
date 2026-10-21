import { describe, expect, it } from "vitest";
import { columnHasTime, comparePeriods, filterRows, floorDate, groupBy, nextBucket, pivot, durationStep, resolveBucket, resolveBucketDetailed, scatterPoints, timeSeries } from "./aggregate";
import { createDashboard, defaultWidget, mergeColumns, niceCeil } from "./autoDashboard";
import { datePart, datePartOrder, displayFormula, FormulaError, parseFormula, toStoredFormula } from "./derive";
import { presetRange } from "./filters";
import { formatDate, formatNumber, formatTick, measureAxisTitle, setNumberStyle, tickLabels } from "./format";
import { niceTicks } from "../components/charts/util";
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
    const lookup = { id: "m", fileName: "店舗.csv", table: { headers: ["店舗コード", "店舗名", "面積"], rows: [[1, "新宿", "120"], [2, "梅田", "80"]] }, masterKeys: ["店舗コード"], localKeys: ["店舗コード"] };
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

describe("composite and legacy lookup keys", () => {
  const cols = (extra: ColumnMeta[]): ColumnMeta[] => [
    calc("店舗", "店舗", undefined, "category"),
    calc("月", "月", undefined, "category"),
    calc("売上", "売上", undefined, "number"),
    ...extra,
  ];
  const data = { headers: ["店舗", "月", "売上"], rows: [["S1", "10", 100], ["S1", "11", 120], ["S2", "10", 80], ["S2", null, 5]] };
  const target = { headers: ["店舗", "月", "目標"], rows: [["S1", "10", 90], ["S1", "11", 130], ["S2", "10", 70]] };
  it("matches on several columns", () => {
    const l = { id: "t", fileName: "目標.csv", table: target, masterKeys: ["店舗", "月"], localKeys: ["店舗", "月"] };
    const frame = buildFrame(data, cols([calc("lookup:t:目標", "目標", { kind: "lookup", lookupId: "t", column: "目標" }, "number")]), [l]);
    expect(Array.from(frame.columns.get("lookup:t:目標")!.values as Float64Array)).toEqual([90, 130, 70, NaN]);
  });
  it("still reads single-key lookups saved by older versions", () => {
    const legacy = { id: "t", fileName: "目標.csv", table: target, masterKey: "店舗", localKey: "店舗" } as unknown as import("./types").Lookup;
    const frame = buildFrame(data, cols([calc("lookup:t:目標", "目標", { kind: "lookup", lookupId: "t", column: "目標" }, "number")]), [legacy]);
    expect(Array.from(frame.columns.get("lookup:t:目標")!.values as Float64Array)).toEqual([90, 90, 70, 70]);
  });
});

describe("date keys", () => {
  it("matches dates written differently", () => {
    const data = { headers: ["日付", "件数"], rows: [["2025/10/01", 3], ["2025-10-02", 4]] };
    const master = { headers: ["日付", "天気"], rows: [["2025-10-01", "晴れ"], ["20251002", "雨"]] };
    const l = { id: "w", fileName: "天気.csv", table: master, masterKeys: ["日付"], localKeys: ["日付"] };
    const cols: ColumnMeta[] = [calc("日付", "日付", undefined, "date"), calc("件数", "件数", undefined, "number"), calc("lookup:w:天気", "天気", { kind: "lookup", lookupId: "w", column: "天気" }, "category")];
    expect(buildFrame(data, cols, [l]).columns.get("lookup:w:天気")!.values).toEqual(["晴れ", "雨"]);
  });
});

describe("column types across data updates", () => {
  // Two countries per year, like the OWID data: years repeat, so they are not an ID column.
  const years = (from: number, to: number) => Array.from({ length: (to - from + 1) * 2 }, (_, i) => [String(from + Math.floor(i / 2)), String(i * 10)]);
  const base = { headers: ["year", "co2"], rows: years(1750, 1999) };
  const later = { headers: ["year", "co2"], rows: years(2000, 2023) };
  const d = createDashboard(base, { fileName: "a.csv", sheetName: null, importedAt: 0 }, "a");
  it("keeps the column type after appending rows", () => {
    expect(d.columns.find((c) => c.key === "year")!.type).toBe("date");
    expect(d.columns.find((c) => c.key === "co2")!.type).toBe("number");
    const merged = appendRows(base, later);
    const { columns, report } = mergeColumns(d.columns, merged, base.headers, createDashboard(later, { fileName: "b", sheetName: null, importedAt: 0 }, "b").columns);
    expect(columns.find((c) => c.key === "year")!.type).toBe("date");
    expect(columns.find((c) => c.key === "co2")!.type).toBe("number");
    expect(report.retyped).toEqual([]);
  });
  it("re-types and reports when the new values no longer fit", () => {
    const text = { headers: ["year", "co2"], rows: Array.from({ length: 30 }, (_, i) => [`第${i}期`, "1"]) };
    const { columns, report } = mergeColumns(d.columns, text, base.headers);
    expect(columns.find((c) => c.key === "year")!.type).not.toBe("date");
    expect(report.retyped[0]).toMatchObject({ label: "year", from: "date" });
  });
  it("never changes a type the user chose", () => {
    const chosen = d.columns.map((c) => (c.key === "co2" ? { ...c, type: "category" as const } : c));
    const { columns } = mergeColumns(chosen, base, base.headers);
    expect(columns.find((c) => c.key === "co2")!.type).toBe("category");
  });
});

describe("relative date presets", () => {
  const days = (from: number, n: number) => Array.from({ length: n }, (_, i) => [new Date(Date.UTC(2020, 0, 1) + (from + i) * 86400000).toISOString().slice(0, 10), 1]);
  const cols: ColumnMeta[] = [calc("Date", "Date", undefined, "date"), calc("ALL", "ALL", undefined, "number")];
  const filter = { id: "f", column: "Date", kind: "range" as const, min: null, max: null, preset: "last-90" as const };
  it("counts back from the latest date of the current data", () => {
    const first = buildFrame({ headers: ["Date", "ALL"], rows: days(0, 600) }, cols);
    expect(filterRows(first, [filter]).length).toBe(90);
    const more = buildFrame({ headers: ["Date", "ALL"], rows: days(0, 1209) }, cols);
    expect(filterRows(more, [filter]).length).toBe(90);
  });
});

describe("dates from split columns", () => {
  it("builds dates from year / month / day / hour columns and suggests them from headers", async () => {
    const { suggestDateParts } = await import("./derive");
    const data = { headers: ["現在時刻(年)", "現在時刻(月)", "現在時刻(日)", "現在時刻(時)", "気温"], rows: [[2026, "10", "21", 13, 20.1], [2026, "02", "30", 9, 3]] };
    const base: ColumnMeta[] = [
      { ...calc("現在時刻(年)", "現在時刻(年)", undefined, "date"), dateUnit: "year" },
      calc("現在時刻(月)", "現在時刻(月)", undefined, "category"),
      calc("現在時刻(日)", "現在時刻(日)", undefined, "category"),
      calc("現在時刻(時)", "現在時刻(時)", undefined, "category"),
      calc("気温", "気温", undefined, "number"),
    ];
    const parts = suggestDateParts(base)!;
    expect(parts).toEqual({ year: "現在時刻(年)", month: "現在時刻(月)", day: "現在時刻(日)", hour: "現在時刻(時)", minute: null });
    const frame = buildFrame(data, [...base, calc("calc:d", "日付", { kind: "datecompose", parts }, "date")]);
    const v = frame.columns.get("calc:d")!.values as Float64Array;
    expect(v[0]).toBe(Date.UTC(2026, 9, 21, 13));
    expect(Number.isNaN(v[1])).toBe(true);
  });
});

describe("wide tables", () => {
  it("draws one series per numeric column", async () => {
    const { timeSeriesColumns } = await import("./aggregate");
    const data = { headers: ["Date", "Tokyo", "Osaka"], rows: [["2025-01-01", 10, 4], ["2025-01-02", 12, 5], ["2025-02-01", 7, 3]] };
    const cols: ColumnMeta[] = [calc("Date", "Date", undefined, "date"), calc("Tokyo", "Tokyo", undefined, "number"), calc("Osaka", "Osaka", undefined, "number")];
    const frame = buildFrame(data, cols);
    const r = timeSeriesColumns(frame, filterRows(frame, []), "Date", "month", "sum", ["Tokyo", "Osaka"], (k) => k);
    expect(r.series.map((x) => [x.label, x.values])).toEqual([["Tokyo", [22, 7]], ["Osaka", [9, 3]]]);
  });
});

describe("number style and axis titles", () => {
  const yen: ColumnMeta = { ...dash.columns[0], key: "a", label: "売上金額", type: "number", format: { decimals: 0, prefix: "", suffix: "円" } };
  const temp: ColumnMeta = { ...yen, key: "t", label: "気温", format: { decimals: null, prefix: "", suffix: "℃" } };
  const meta = new Map([["a", yen], ["t", temp]]);

  it("abbreviates with en / ja / full styles", () => {
    setNumberStyle("en");
    expect(formatNumber(1500, null, "compact")).toBe("1.5k");
    expect(formatNumber(100000, null, "compact")).toBe("100k");
    expect(formatNumber(3_200_000, null, "compact")).toBe("3.2M");
    expect(formatNumber(1_100_000_000, null, "compact")).toBe("1.1B");
    expect(formatNumber(999, null, "compact")).toBe("999");
    expect(formatNumber(-2500, null, "compact")).toBe("-2.5k");
    setNumberStyle("ja");
    expect(formatNumber(12000, null, "compact")).toBe("1.2万");
    expect(formatNumber(1500, null, "compact")).toBe("1,500");
    setNumberStyle("full");
    expect(formatNumber(3_200_000, null, "compact")).toBe("3,200,000");
    setNumberStyle("en");
  });

  it("builds axis titles with units", () => {
    expect(measureAxisTitle({ agg: "sum", column: "a" }, meta)).toBe("売上金額の合計（円）");
    expect(measureAxisTitle({ agg: "avg", column: "t" }, meta)).toBe("気温の平均（℃）");
    expect(measureAxisTitle({ agg: "count", column: null }, meta)).toBe("件数");
  });
});

describe("sub-day time units", () => {
  const t = Date.UTC(2025, 0, 5, 14, 5, 30);
  const HOUR = 3600000;
  const col = (key: string, type: ColumnMeta["type"]): ColumnMeta => calc(key, key, undefined, type);

  it("floors and steps hours, minutes and seconds", () => {
    expect(floorDate(t, "hour")).toBe(Date.UTC(2025, 0, 5, 14));
    expect(floorDate(t, "minute")).toBe(Date.UTC(2025, 0, 5, 14, 5));
    expect(floorDate(t, "second")).toBe(t);
    expect(nextBucket(floorDate(t, "hour"), "hour")).toBe(Date.UTC(2025, 0, 5, 15));
    expect(nextBucket(floorDate(t, "minute"), "minute")).toBe(Date.UTC(2025, 0, 5, 14, 6));
    expect(nextBucket(t, "second")).toBe(t + 1000);
  });

  it("picks an auto unit from the span", () => {
    expect(resolveBucket("auto", t, t + 90_000)).toBe("second");
    expect(resolveBucket("auto", t, t + HOUR)).toBe("minute");
    expect(resolveBucket("auto", t, t + 20 * HOUR)).toBe("hour");
    expect(resolveBucket("auto", t, t + 10 * 86400000)).toBe("day");
    expect(resolveBucket("minute", t, t + 10 * 86400000)).toBe("hour");
  });

  it("never goes below a day for date-only data", () => {
    const d = Date.UTC(2025, 0, 5);
    expect(resolveBucket("auto", d, d + 86400000, false)).toBe("day");
    expect(resolveBucket("hour", d, d + 86400000, false)).toBe("day");
    const frame = buildFrame({ headers: ["d", "v"], rows: [["2025-01-05", 1], ["2025-01-06", 2]] }, [col("d", "date"), col("v", "number")]);
    expect(columnHasTime(frame, "d")).toBe(false);
    const rows = Uint32Array.from([0, 1]);
    expect(timeSeries(frame, rows, "d", "hour", { agg: "sum", column: "v" }, null).bucket).toBe("day");
    expect(timeSeries(frame, rows, "d", "auto", { agg: "sum", column: "v" }, null).bucket).toBe("day");
  });

  it("buckets a time-of-day column by hour", () => {
    const frame = buildFrame(
      { headers: ["at", "n"], rows: [["09:10", 1], ["09:50", 1], ["11:00", 1], ["23:59", 1]] },
      [col("at", "time"), col("n", "number")],
    );
    const rows = Uint32Array.from([0, 1, 2, 3]);
    const r = timeSeries(frame, rows, "at", "day", { agg: "count", column: null }, null);
    expect(r.timeOfDay).toBe(true);
    expect(r.bucket).toBe("hour");
    expect(r.buckets[0]).toBe(9 * HOUR);
    expect(r.buckets.length).toBe(15);
    expect(r.series[0].values[0]).toBe(2);
    expect(r.series[0].values[2]).toBe(1);
    expect(formatTick(r.buckets[0], r.bucket, true)).toBe("09:00");
    expect(formatDate(r.buckets[0], r.bucket, true)).toBe("9時");
  });

  it("derives minutes and hours from date-times and time columns", () => {
    expect(datePart(t, "minute")).toBe("5分");
    expect(datePart(t, "hour")).toBe("14時");
    expect(datePartOrder("minute")?.length).toBe(60);
    const cols = [col("at", "time"), calc("h", "h", { kind: "datepart", source: "at", part: "hour" }, "category")];
    const frame = buildFrame({ headers: ["at"], rows: [["09:10"], ["23:59"]] }, cols);
    expect(frame.columns.get("h")?.values).toEqual(["9時", "23時"]);
  });

  it("has a last-24h preset counted from the latest value", () => {
    expect(presetRange("last-24h", t)).toEqual([t - 86400000, t]);
  });

  it("formats ticks and tooltips", () => {
    expect(formatTick(Date.UTC(2025, 0, 5, 14), "hour")).toBe("14:00");
    expect(formatTick(Date.UTC(2025, 0, 5, 0), "hour")).toBe("1/5 0:00");
    expect(formatTick(Date.UTC(2025, 0, 5, 14, 5), "minute")).toBe("14:05");
    expect(formatTick(t, "second")).toBe("14:05:30");
    expect(formatDate(t, "hour")).toBe("2025/01/05 14時");
    expect(formatDate(t, "minute")).toBe("2025/01/05 14:05");
  });
});

describe("time axis and chart labels", () => {
  const t0 = Date.UTC(2025, 2, 2, 8);
  const DAYMS = 86400000;
  const HOUR = 3600000;
  const col = (key: string, type: ColumnMeta["type"]): ColumnMeta => calc(key, key, undefined, type);

  it("keeps an explicit minute/second unit up to 5000 points and reports coarsening", () => {
    // 10 days of minutes is 14400 points: too many, so hours.
    expect(resolveBucketDetailed("minute", t0, t0 + 10 * DAYMS)).toEqual({ bucket: "hour", requested: "minute" });
    // 2 days of minutes is 2880 points: fine for an explicit choice, too many for auto.
    expect(resolveBucketDetailed("minute", t0, t0 + 2 * DAYMS)).toEqual({ bucket: "minute" });
    expect(resolveBucketDetailed("second", t0, t0 + 1 * HOUR)).toEqual({ bucket: "second" });
    expect(resolveBucketDetailed("second", t0, t0 + 10 * DAYMS)).toEqual({ bucket: "hour", requested: "second" });
    expect(resolveBucket("auto", t0, t0 + 20 * HOUR)).toBe("hour");
    const frame = buildFrame({ headers: ["d"], rows: [["2025-03-02 08:00"], ["2025-03-12 08:00"]] }, [col("d", "date")]);
    const rows = Uint32Array.from([0, 1]);
    const r = timeSeries(frame, rows, "d", "minute", { agg: "count", column: null }, null);
    expect(r.bucket).toBe("hour");
    expect(r.requestedBucket).toBe("minute");
    expect(timeSeries(frame, rows, "d", "hour", { agg: "count", column: null }, null).requestedBucket).toBeUndefined();
  });

  it("puts the date on the first tick and wherever the day changes", () => {
    const ts = [t0, t0 + 6 * HOUR, t0 + 12 * HOUR, t0 + 18 * HOUR, t0 + 30 * HOUR];
    expect(tickLabels(ts, "hour")).toEqual(["3/2 8:00", "14:00", "20:00", "3/3 2:00", "14:00"]);
    expect(tickLabels([t0, t0 + 6 * HOUR], "hour")).toEqual(["08:00", "14:00"]);
    expect(tickLabels([t0, t0 + DAYMS], "minute")).toEqual(["3/2 8:00", "3/3 8:00"]);
    expect(tickLabels([t0, t0 + DAYMS], "hour", true)).toEqual(["08:00", "08:00"]);
    expect(tickLabels([t0, t0 + 3 * DAYMS], "day")).toEqual(["3/2", "3/5"]);
  });

  it("rounds a gauge target up to 1, 2, 2.5 or 5 times a power of ten", () => {
    expect(niceCeil(1280171722)).toBe(2e9);
    expect(niceCeil(306702244)).toBe(500000000);
    expect(niceCeil(2.2)).toBe(2.5);
    expect(niceCeil(0.0023)).toBe(0.0025);
    expect(niceCeil(100)).toBe(100);
    expect(niceCeil(101)).toBe(200);
    expect(niceCeil(5001)).toBe(10000);
    expect(niceCeil(0)).toBe(100);
    expect(niceCeil(NaN)).toBe(100);
    const frame = buildFrame({ headers: ["v"], rows: [[300], [450]] }, [col("v", "number")]);
    const w = defaultWidget("gauge", [col("v", "number")], frame);
    // 300 + 450 summed (or averaged to 375): either way a round number at or above the value.
    expect(w.kind === "gauge" && [500, 1000]).toContain(w.kind === "gauge" ? w.target : 0);
  });

  it("chooses round steps on duration axes", () => {
    expect(durationStep(100 * 60, 5)).toBe(1800);
    expect(durationStep(3 * 60, 5)).toBe(60);
    expect(durationStep(45, 5)).toBe(10);
    expect(durationStep(10 * 3600, 5)).toBe(7200);
    expect(durationStep(30 * 86400, 5)).toBe(86400 * 10);
    expect(durationStep(0.2, 5)).toBe(0);
    // 0 to 100 minutes: not 16.7 / 33.3 minutes.
    const ticks = niceTicks(0, 100 * 60, 5, true);
    expect(ticks.every((v) => v % 60 === 0)).toBe(true);
    expect(ticks).toEqual([0, 1800, 3600, 5400, 7200]);
    expect(niceTicks(0, 100, 5, false)).toEqual([0, 50, 100]);
  });
});
