import { describe, expect, it } from "vitest";
import { aggregate, filterRows, groupBy } from "./aggregate";
import { aggsFor, isContinuousType, isDimensionType, isMeasureColumnType } from "./columnTypes";
import { formatDuration, formatMeasure, formatTimeOfDay, formatValue, measureAxisTitle } from "./format";
import { buildFrame, columnStats } from "./frame";
import { converterFor, parseBoolean, parseDateWith, parseDuration, parseNumberWith, parseTimeOfDay, textNormalizerFor } from "./parsers";
import type { ColumnMeta, ColumnType, RawTable } from "./types";

const meta = (key: string, type: ColumnType, parse?: ColumnMeta["parse"]): ColumnMeta => ({
  key,
  label: key,
  type,
  inferredType: type,
  hidden: false,
  idLike: false,
  format: { prefix: "", suffix: "", decimals: null },
  ...(parse ? { parse } : {}),
});
const utc = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => Date.UTC(y, m - 1, d, h, mi, s);

describe("parseTimeOfDay", () => {
  it("reads common spellings", () => {
    expect(parseTimeOfDay("9:30")).toBe(34200);
    expect(parseTimeOfDay("09:30:15")).toBe(34215);
    expect(parseTimeOfDay("9:30:15.250")).toBe(34215.25);
    expect(parseTimeOfDay("9時30分")).toBe(34200);
    expect(parseTimeOfDay("9時30分15秒")).toBe(34215);
    expect(parseTimeOfDay("２０２５-01-02 09:30")).toBe(34200);
  });
  it("handles 12-hour clocks", () => {
    expect(parseTimeOfDay("9:30 PM")).toBe(21 * 3600 + 1800);
    expect(parseTimeOfDay("午後9:30")).toBe(21 * 3600 + 1800);
    expect(parseTimeOfDay("12:05 AM")).toBe(300);
    expect(parseTimeOfDay("12:05 PM")).toBe(12 * 3600 + 300);
    expect(parseTimeOfDay("13:00 PM")).toBeNaN();
  });
  it("rejects hours above 23 (durations)", () => {
    expect(parseTimeOfDay("25:30")).toBeNaN();
    expect(parseTimeOfDay("24:00")).toBeNaN();
    expect(parseTimeOfDay("9:75")).toBeNaN();
  });
  it("accepts compact digits only when asked", () => {
    expect(parseTimeOfDay("0930")).toBeNaN();
    expect(parseTimeOfDay("0930", { timeFormat: "hm" })).toBe(34200);
    expect(parseTimeOfDay(930, { timeFormat: "hm" })).toBe(34200);
  });
  it("respects hm / hms and patterns", () => {
    expect(parseTimeOfDay("9:30:15", { timeFormat: "hm" })).toBeNaN();
    expect(parseTimeOfDay("9:30", { timeFormat: "hms" })).toBeNaN();
    expect(parseTimeOfDay("9:30:15", { timeFormat: "hms" })).toBe(34215);
    expect(parseTimeOfDay("09.30", { timeFormat: "pattern", pattern: "hh.mm" })).toBe(34200);
  });
  it("reads Excel fractions", () => {
    expect(parseTimeOfDay(0.5)).toBe(43200);
    expect(parseTimeOfDay(1.5)).toBeNaN();
    expect(parseTimeOfDay(null)).toBeNaN();
    expect(parseTimeOfDay("")).toBeNaN();
  });
});

describe("parseDuration", () => {
  it("reads colon forms", () => {
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("12:34")).toBe(12 * 3600 + 34 * 60);
    expect(parseDuration("25:30")).toBe(91800);
    expect(parseDuration("12:34", { durationColon: "ms" })).toBe(754);
    expect(parseDuration("1:02:03", { durationColon: "ms" })).toBe(3723);
    expect(parseDuration("1:75:00")).toBeNaN();
  });
  it("reads unit forms", () => {
    expect(parseDuration("1h 30m")).toBe(5400);
    expect(parseDuration("1時間30分")).toBe(5400);
    expect(parseDuration("90分")).toBe(5400);
    expect(parseDuration("45秒")).toBe(45);
    expect(parseDuration("2日3時間")).toBe(2 * 86400 + 3 * 3600);
    expect(parseDuration("1.5h")).toBe(5400);
    expect(parseDuration("PT1H30M")).toBe(5400);
    expect(parseDuration("P1DT2H")).toBe(93600);
    expect(parseDuration("-1h")).toBe(-3600);
    expect(parseDuration("P")).toBeNaN();
    expect(parseDuration("abc")).toBeNaN();
  });
  it("uses the unit for bare numbers and applies scale", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration(90, { durationUnit: "min" })).toBe(5400);
    expect(parseDuration("1.5", { durationUnit: "h" })).toBe(5400);
    expect(parseDuration("500", { durationUnit: "ms" })).toBe(0.5);
    expect(parseDuration("10", { scale: 60 })).toBe(600);
  });
});

describe("parseBoolean", () => {
  it("knows common spellings", () => {
    for (const t of ["○", "◯", "〇", "はい", "TRUE", "Yes", "y", "1", "✓", "あり", "済", "ｙｅｓ"]) expect(parseBoolean(t), t).toBe(1);
    for (const f of ["×", "いいえ", "false", "No", "0", "なし", "未", "OFF"]) expect(parseBoolean(f), f).toBe(0);
    expect(parseBoolean(1)).toBe(1);
    expect(parseBoolean(0)).toBe(0);
    expect(parseBoolean(2)).toBeNaN();
    expect(parseBoolean("maybe")).toBeNaN();
    expect(parseBoolean("-")).toBeNaN();
    expect(parseBoolean(null)).toBeNaN();
  });
  it("accepts custom spellings", () => {
    const p = { trueValues: ["出席", "OK"], falseValues: ["欠席"] };
    expect(parseBoolean("出席", p)).toBe(1);
    expect(parseBoolean("ok", p)).toBe(1);
    expect(parseBoolean("欠席", p)).toBe(0);
    expect(parseBoolean("欠席")).toBeNaN();
  });
});

describe("parseDateWith", () => {
  it("auto matches the plain parser", () => {
    expect(parseDateWith("2025/03/04")).toBe(utc(2025, 3, 4));
    expect(parseDateWith("2023", { dateFormat: "auto" })).toBe(utc(2023, 1, 1));
  });
  it("reads dmy and mdy", () => {
    expect(parseDateWith("03/04/2025", { dateFormat: "dmy" })).toBe(utc(2025, 4, 3));
    expect(parseDateWith("03/04/2025", { dateFormat: "mdy" })).toBe(utc(2025, 3, 4));
    expect(parseDateWith("13/04/2025 10:20", { dateFormat: "dmy" })).toBe(utc(2025, 4, 13, 10, 20));
    expect(parseDateWith("13/04/2025", { dateFormat: "mdy" })).toBeNaN();
    expect(parseDateWith("2025-04-13", { dateFormat: "dmy" })).toBe(utc(2025, 4, 13));
    expect(parseDateWith("25/04/03", { dateFormat: "ymd" })).toBe(utc(2025, 4, 3));
  });
  it("reads unix times", () => {
    expect(parseDateWith(1700000000, { dateFormat: "unix-s" })).toBe(1700000000000);
    expect(parseDateWith("1700000000", { dateFormat: "unix-s" })).toBe(1700000000000);
    expect(parseDateWith(1700000000123, { dateFormat: "unix-ms" })).toBe(1700000000123);
    expect(parseDateWith("abc", { dateFormat: "unix-ms" })).toBeNaN();
  });
  it("reads Excel serials", () => {
    expect(parseDateWith(25569, { dateFormat: "excel" })).toBe(0);
    expect(parseDateWith(45000.5, { dateFormat: "excel" })).toBe(utc(2023, 3, 15, 12));
    expect(parseDateWith("45000", { dateFormat: "excel" })).toBe(utc(2023, 3, 15));
  });
  it("reads token patterns", () => {
    const p = { dateFormat: "pattern" as const, pattern: "DD.MM.YYYY hh:mm" };
    expect(parseDateWith("04.03.2025 09:05", p)).toBe(utc(2025, 3, 4, 9, 5));
    expect(parseDateWith("4.3.2025 09:05", p)).toBeNaN();
    expect(parseDateWith("30.02.2025 09:05", p)).toBeNaN();
    expect(parseDateWith("25年3月", { dateFormat: "pattern", pattern: "YY年M月" })).toBe(utc(2025, 3, 1));
  });
});

describe("parseNumberWith", () => {
  it("handles decimal commas and scale", () => {
    expect(parseNumberWith("1.234,5", { decimalComma: true })).toBe(1234.5);
    expect(parseNumberWith("1 234,56", { decimalComma: true })).toBe(1234.56);
    expect(parseNumberWith("0,5", { decimalComma: true })).toBe(0.5);
    expect(parseNumberWith("1,234.5")).toBe(1234.5);
    expect(parseNumberWith("12", { scale: 1000 })).toBe(12000);
    expect(parseNumberWith("1.234,5", { decimalComma: true, scale: 2 })).toBe(2469);
    expect(parseNumberWith("x", { scale: 2 })).toBeNaN();
  });
});

describe("converters", () => {
  it("dispatches by type", () => {
    expect(converterFor({ type: "time" })("9:30")).toBe(34200);
    expect(converterFor({ type: "duration" })("90分")).toBe(5400);
    expect(converterFor({ type: "boolean" })("○")).toBe(1);
    expect(converterFor({ type: "number", parse: { scale: 10 } })("2")).toBe(20);
    expect(converterFor({ type: "date", parse: { dateFormat: "dmy" } })("03/04/2025")).toBe(utc(2025, 4, 3));
  });
  it("normalizes text", () => {
    expect(textNormalizerFor({})("  ａｂｃ ")).toBe("ａｂｃ");
    expect(textNormalizerFor({ parse: { widthNormalize: true, letterCase: "upper" } })("ａｂｃ")).toBe("ABC");
    expect(textNormalizerFor({ parse: { letterCase: "lower" } })("ABC")).toBe("abc");
    expect(textNormalizerFor({ parse: { widthNormalize: true } })(" - ")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats time of day", () => {
    expect(formatTimeOfDay(34200)).toBe("09:30");
    expect(formatTimeOfDay(9 * 3600 + 5 * 60)).toBe("09:05");
    expect(formatTimeOfDay(34215)).toBe("09:30:15");
    expect(formatTimeOfDay(NaN)).toBe("—");
  });
  it("formats durations", () => {
    expect(formatDuration(4980)).toBe("1時間23分");
    expect(formatDuration(754)).toBe("12分34秒");
    expect(formatDuration(45)).toBe("45秒");
    expect(formatDuration(3600)).toBe("1時間");
    expect(formatDuration(2 * 86400 + 3 * 3600 + 5)).toBe("2日3時間");
    expect(formatDuration(0.25)).toBe("0.25秒");
    expect(formatDuration(-754)).toBe("-12分34秒");
    expect(formatDuration(5400, "compact")).toBe("1.5時間");
    expect(formatDuration(1800, "compact")).toBe("30分");
    expect(formatDuration(45, "compact")).toBe("45秒");
    expect(formatDuration(2.1 * 86400, "compact")).toBe("2.1日");
    expect(formatDuration(3599, "compact")).toBe("1時間");
  });
  it("dispatches formatValue by type", () => {
    expect(formatValue(1, meta("b", "boolean"))).toBe("はい");
    expect(formatValue(34200, meta("t", "time"))).toBe("09:30");
    expect(formatValue(754, meta("d", "duration"))).toBe("12分34秒");
    expect(formatValue(NaN, meta("d", "duration"))).toBe("—");
  });
});

describe("columnTypes", () => {
  it("lists aggregations and roles", () => {
    expect(aggsFor("date")).toEqual(["count", "min", "max", "distinct"]);
    expect(aggsFor("boolean")).toContain("avg");
    expect(aggsFor("time")).not.toContain("sum");
    expect(isDimensionType("boolean")).toBe(true);
    expect(isContinuousType("duration")).toBe(true);
    expect(isMeasureColumnType("category")).toBe(false);
  });
});

describe("frame and aggregation with new types", () => {
  const table: RawTable = {
    headers: ["flag", "stay", "at", "grp"],
    rows: [
      ["○", "1:30:00", "9:00", "a"],
      ["×", "0:30:00", "10:00", "a"],
      ["はい", "2:00:00", "11:00", "b"],
      ["いいえ", "bad", "25:00", "b"],
      [null, "1:00:00", "12:00", "b"],
    ],
  };
  const cols = [meta("flag", "boolean"), meta("stay", "duration"), meta("at", "time"), meta("grp", "category")];
  const frame = buildFrame(table, cols);
  const rows = Uint32Array.from([0, 1, 2, 3, 4]);

  it("converts columns", () => {
    expect([...(frame.columns.get("flag")!.values as Float64Array)]).toEqual([1, 0, 1, 0, NaN]);
    expect(frame.columns.get("stay")!.type).toBe("duration");
  });
  it("counts invalid values for every float type", () => {
    expect(columnStats(table, cols[1]).invalid).toBe(1);
    expect(columnStats(table, cols[2]).invalid).toBe(1);
    expect(columnStats(table, cols[0]).invalid).toBe(0);
  });
  it("aggregates booleans and durations", () => {
    expect(aggregate(frame, rows, { agg: "sum", column: "flag" })).toBe(2);
    expect(aggregate(frame, rows, { agg: "avg", column: "flag" })).toBe(0.5);
    expect(aggregate(frame, rows, { agg: "sum", column: "stay" })).toBe(5400 + 1800 + 7200 + 3600);
    expect(aggregate(frame, rows, { agg: "avg", column: "at" })).toBe(37800);
    expect(formatMeasure(0.452, { agg: "avg", column: "flag" }, frame.meta)).toBe("45.2%");
    expect(formatMeasure(2, { agg: "sum", column: "flag" }, frame.meta)).toBe("2");
    expect(formatMeasure(5400, { agg: "avg", column: "stay" }, frame.meta)).toBe("1時間30分");
    expect(measureAxisTitle({ agg: "avg", column: "flag" }, frame.meta)).toBe("flagの平均（%）");
    expect(measureAxisTitle({ agg: "sum", column: "stay" }, frame.meta)).toBe("stayの合計");
  });
  it("labels boolean groups and filters by them", () => {
    const { bars } = groupBy(frame, rows, "flag", { agg: "count", column: null }, 10, "value-desc");
    expect(bars.map((b) => b.label).sort()).toEqual(["(空欄)", "いいえ", "はい"].sort());
    const out = filterRows(frame, [{ id: "f", column: "flag", kind: "values", values: ["はい"] }]);
    expect([...out]).toEqual([0, 2]);
    const range = filterRows(frame, [{ id: "r", column: "stay", kind: "range", min: 3600, max: null }]);
    expect([...range]).toEqual([0, 2, 4]);
  });
});
