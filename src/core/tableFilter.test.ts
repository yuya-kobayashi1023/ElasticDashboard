import { describe, expect, it } from "vitest";
import { buildFrame } from "./frame";
import { applyColumnFilters, orderedTableKeys, parseColumnFilter, type ColumnFilter } from "./tableFilter";
import type { ColumnMeta } from "./types";

const meta = (key: string, type: ColumnMeta["type"]): ColumnMeta => ({
  key,
  label: key,
  type,
  inferredType: type,
  hidden: false,
  idLike: false,
  format: { prefix: "", suffix: "", decimals: null },
});

const frame = buildFrame(
  {
    headers: ["name", "qty", "day"],
    rows: [
      ["Apple", 10, "2025-01-05"],
      ["banana", 150, "2025-02-10"],
      ["Cherry", null, "2025-01-20"],
      [null, 200, null],
    ],
  },
  [meta("name", "category"), meta("qty", "number"), meta("day", "date")],
);
const all = Uint32Array.from([0, 1, 2, 3]);
const run = (filters: Record<string, string>, types: Record<string, ColumnMeta["type"]>) =>
  Array.from(applyColumnFilters(frame, all, new Map<string, ColumnFilter>(Object.entries(filters).map(([k, v]) => [k, parseColumnFilter(v, types[k])]))));

describe("table column filters", () => {
  it("matches text case-insensitively", () => {
    expect(run({ name: "AN" }, { name: "category" })).toEqual([1]);
  });

  it("compares numbers with expressions and keeps blanks out", () => {
    const t = { qty: "number" as const };
    expect(run({ qty: ">100" }, t)).toEqual([1, 3]);
    expect(run({ qty: ">=150" }, t)).toEqual([1, 3]);
    expect(run({ qty: "<150" }, t)).toEqual([0]);
    expect(run({ qty: "10..150" }, t)).toEqual([0, 1]);
    expect(run({ qty: "=200" }, t)).toEqual([3]);
    expect(run({ qty: "10" }, t)).toEqual([0]);
  });

  it("flags unparseable expressions and ignores them", () => {
    expect(parseColumnFilter(">abc", "number").kind).toBe("invalid");
    expect(parseColumnFilter("1..2..3", "number").kind).toBe("invalid");
    expect(parseColumnFilter("..", "number").kind).toBe("invalid");
    expect(run({ qty: ">abc" }, { qty: "number" })).toEqual([0, 1, 2, 3]);
  });

  it("filters dates by expression or displayed prefix", () => {
    const t = { day: "date" as const };
    expect(run({ day: ">=2025-02-01" }, t)).toEqual([1]);
    expect(run({ day: "2025-01-01..2025-01-31" }, t)).toEqual([0, 2]);
    expect(run({ day: "2025/01" }, t)).toEqual([0, 2]);
    expect(run({ day: "2025-02" }, t)).toEqual([1]);
  });

  it("combines filters", () => {
    expect(run({ qty: ">5", name: "a" }, { qty: "number", name: "category" })).toEqual([0, 1]);
  });
});

describe("table column filters for time, duration and boolean", () => {
  const types = { at: "time", took: "duration", ok: "boolean" } as const;
  const f2 = buildFrame(
    {
      headers: ["at", "took", "ok"],
      rows: [
        ["09:30", "1:30:00", "はい"],
        ["12:00", "45", "いいえ"],
        ["18:15", null, null],
        [null, "2:00:00", "はい"],
      ],
    },
    [meta("at", "time"), meta("took", "duration"), meta("ok", "boolean")],
  );
  const run2 = (filters: Record<string, string>) =>
    Array.from(
      applyColumnFilters(
        f2,
        all,
        new Map<string, ColumnFilter>(Object.entries(filters).map(([k, v]) => [k, parseColumnFilter(v, types[k as keyof typeof types])])),
      ),
    );

  it("compares time of day with parsed operands", () => {
    expect(run2({ at: ">=12:00" })).toEqual([1, 2]);
    expect(run2({ at: "9:00..13:00" })).toEqual([0, 1]);
    expect(parseColumnFilter(">abc", "time").kind).toBe("invalid");
  });

  it("matches plain text against the displayed time", () => {
    expect(run2({ at: "18:" })).toEqual([2]);
  });

  it("compares durations with parsed operands", () => {
    expect(run2({ took: ">=1:30:00" })).toEqual([0, 3]);
    expect(run2({ took: "<1:00:00" })).toEqual([1]);
    expect(parseColumnFilter("<x", "duration").kind).toBe("invalid");
  });

  it("filters booleans by choice, blank included", () => {
    expect(run2({ ok: "true" })).toEqual([0, 3]);
    expect(run2({ ok: "false" })).toEqual([1]);
    expect(run2({ ok: "blank" })).toEqual([2]);
    expect(run2({ ok: "" })).toEqual([0, 1, 2, 3]);
  });
});

describe("orderedTableKeys", () => {
  const avail = ["a", "b", "c"];
  it("uses column-settings order when nothing is stored", () => {
    expect(orderedTableKeys({ columns: null }, avail)).toEqual(["a", "b", "c"]);
  });
  it("honours an old columns-only order and appends the rest", () => {
    expect(orderedTableKeys({ columns: ["c", "a"] }, avail)).toEqual(["c", "a", "b"]);
  });
  it("prefers order and drops unknown keys", () => {
    expect(orderedTableKeys({ columns: ["a"], order: ["b", "x", "a"] }, avail)).toEqual(["b", "a", "c"]);
  });
});
