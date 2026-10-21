import { describe, expect, it } from "vitest";
import { inferColumn, inferColumns } from "./infer";
import { mergeColumns } from "./autoDashboard";

const rep = <T>(xs: T[], n: number): T[] => Array.from({ length: n }, (_, i) => xs[i % xs.length]);

describe("type inference: no false positives", () => {
  it("keeps 1/2, M/F and 男/女 as categories", () => {
    expect(inferColumn("区分", rep(["1", "2"], 30)).type).not.toBe("boolean");
    expect(inferColumn("sex", rep(["M", "F"], 30)).type).toBe("category");
    expect(inferColumn("性別", rep(["男", "女"], 30)).type).toBe("category");
  });
  it("does not treat 0/1 as boolean without a flag header", () => {
    expect(inferColumn("score", rep(["0", "1"], 30)).type).not.toBe("boolean");
    expect(inferColumn("island", rep([0, 1], 30)).type).not.toBe("boolean");
  });
  it("keeps prices, version strings and zip codes", () => {
    expect(inferColumn("price", rep([1700000000, 1700000500, 1700001000], 30)).type).toBe("number");
    expect(inferColumn("version", rep(["1.10", "1.2", "2.0"], 30)).type).not.toMatch(/date|time|duration|boolean/);
    const zip = inferColumn("zip", Array.from({ length: 60 }, (_, i) => String(1000000 + i * 37)));
    expect(zip.idLike).toBe(true);
  });
  it("keeps bare numbers in a duration-like column as numbers", () => {
    expect(inferColumn("所要時間", rep(["30", "45", "60"], 30)).type).toBe("number");
  });
  it("leaves 03/04/2025 alone when both orders are possible", () => {
    const r = inferColumn("d", rep(["03/04/2025", "05/06/2025"], 20));
    expect(r.type).not.toBe("date");
  });
  it("does not guess hh:mm without a clock-like range", () => {
    expect(inferColumn("値", rep(["00:30", "00:45"], 20)).type).toBe("category");
  });
});

describe("type inference: new types", () => {
  it("boolean pairs", () => {
    for (const [a, b] of [["true", "false"], ["Yes", "No"], ["はい", "いいえ"], ["有", "無"], ["済", "未"], ["○", "×"], ["TRUE", "FALSE"]]) {
      expect(inferColumn("x", rep([a, b], 30)).type, `${a}/${b}`).toBe("boolean");
    }
    expect(inferColumn("x", [...rep(["y", "n"], 30), null, ""]).type).toBe("boolean");
  });
  it("1/0 with a flag header", () => {
    expect(inferColumn("is_active", rep([1, 0], 30)).type).toBe("boolean");
    expect(inferColumn("退会フラグ", rep(["0", "1"], 30)).type).toBe("boolean");
    expect(inferColumn("is_active", rep([1], 30)).type).toBe("boolean");
    expect(inferColumn("x", rep(["yes"], 30)).type).not.toBe("boolean");
  });
  it("time of day", () => {
    const t = inferColumn("受付時刻", rep(["9:05", "13:40", "17:20"], 30));
    expect(t.type).toBe("time");
    expect(t.reason.length).toBeLessThanOrEqual(30);
    expect(inferColumn("x", rep(["09:05:10", "13:40:00"], 30)).type).toBe("time");
    expect(inferColumn("x", rep(["午前9:05", "午後1:40"], 30)).type).toBe("time");
    expect(inferColumn("x", rep(["9:05", "13:40", "17:20"], 30)).type).toBe("time");
  });
  it("duration", () => {
    expect(inferColumn("所要時間", rep(["12:30", "1:05", "0:45"], 30)).type).toBe("duration");
    expect(inferColumn("x", rep(["25:10", "3:00"], 30)).type).toBe("duration");
    expect(inferColumn("x", rep(["1時間30分", "2時間5分"], 30)).type).toBe("duration");
    expect(inferColumn("x", rep(["1h30m", "2h5m"], 30)).type).toBe("duration");
    expect(inferColumn("x", rep(["PT1H30M", "PT45M"], 30)).type).toBe("duration");
    expect(inferColumn("開始時間", rep(["9:05", "13:40"], 30)).type).toBe("time");
  });
  it("unix timestamps", () => {
    const s = inferColumn("created_at", rep([1700000000, 1700086400, 1700172800], 30));
    expect(s.type).toBe("date");
    expect(s.parse).toEqual({ dateFormat: "unix-s" });
    const ms = inferColumn("timestamp", rep([1700000000000, 1700086400000], 30));
    expect(ms.parse).toEqual({ dateFormat: "unix-ms" });
    expect(inferColumn("created_at", rep([5, 10, 15], 30)).type).toBe("number");
  });
  it("dd/mm vs mm/dd", () => {
    const dmy = inferColumn("日付", ["03/04/2025", "25/04/2025", ...rep(["01/02/2025"], 20)]);
    expect(dmy.type).toBe("date");
    expect(dmy.parse).toEqual({ dateFormat: "dmy" });
    expect(inferColumn("d", ["03/04/2025", "04/25/2025", ...rep(["01/02/2025"], 20)]).parse).toEqual({ dateFormat: "mdy" });
    expect(inferColumn("d", ["25/04/2025", "04/25/2025"]).type).not.toBe("date");
  });
  it("stores reason and inferred parse on the column", () => {
    const [c] = inferColumns(["created_at"], rep([[1700000000], [1700086400]], 20).map((r) => r));
    expect(c.type).toBe("date");
    expect(c.parse).toEqual({ dateFormat: "unix-s" });
    expect(c.inferredParse).toEqual({ dateFormat: "unix-s" });
    expect(c.inferredReason).toBeTruthy();
  });
  it("mergeColumns keeps parse when the type stays and re-infers otherwise", () => {
    const rows = rep([[1700000000], [1700086400]], 20);
    const [c] = inferColumns(["created_at"], rows);
    const kept = mergeColumns([c], { headers: ["created_at"], rows }).columns[0];
    expect(kept.parse).toEqual({ dateFormat: "unix-s" });
    const text = rep([["aaa"], ["bbb"]], 20);
    const re = mergeColumns([c], { headers: ["created_at"], rows: text }).columns[0];
    expect(re.type).toBe("category");
    expect(re.parse).toBeUndefined();
  });
});
