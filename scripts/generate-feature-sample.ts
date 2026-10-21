/**
 * Generates samples/新機能確認/コールセンター記録.csv, a support-call log that exercises the column
 * types, per-column parse options, time units and widgets added after commit 513f96e.
 * Deterministic: re-running produces an identical file.
 *
 *   bun scripts/generate-feature-sample.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Papa from "papaparse";

const OUT_DIR = join(import.meta.dirname, "..", "samples", "新機能確認");

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const r = rng(20250303);
const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const chance = (p: number) => r() < p;

function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let x = r() * total;
  for (const [v, w] of items) {
    x -= w;
    if (x <= 0) return v;
  }
  return items[items.length - 1][0];
}

const DAYS = 14; // Mon 2025-03-03 .. Sun 2025-03-16
const WEEKDAY_HOURS: [number, number][] = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((h, i) => [
  h,
  [3, 6, 9, 10, 7, 6, 8, 9, 8, 6, 4, 3, 2][i],
]);

interface Call {
  at: number; // wall-clock time as UTC epoch ms
}

// ---------- Timestamps ----------

const calls: Call[] = [];
for (let d = 0; d < DAYS; d++) {
  const weekend = d % 7 >= 5;
  const n = weekend ? int(10, 14) : int(50, 60);
  for (let i = 0; i < n; i++) {
    const h = weekend ? int(9, 17) : weighted(WEEKDAY_HOURS);
    calls.push({ at: Date.UTC(2025, 2, 3 + d, h, int(0, 59), int(0, 59)) });
  }
}
calls.sort((a, b) => a.at - b.at);

// ---------- Column helpers ----------

const AGENTS = ["佐藤 花子", "鈴木 一郎", "高橋 美咲", "田中 健", "伊藤 愛", "山本 大輔"];
const REGIONS = ["北海道・東北", "関東", "中部", "関西", "九州・沖縄"];
const CHANNELS: [string, number][] = [["電話", 6], ["メール", 3], ["チャット", 3]];
const PRODUCTS = ["ABC-01", "ABC-02", "DEF-10", "GHI-20", "JKL-30"];
const ZIPS = ["100-0001", "060-0001", "530-0001", "460-0001", "812-0011", "980-0021", "220-0011", "640-8341"];

const FULLWIDTH: Record<string, string> = { "-": "－" };
function toFullWidth(s: string): string {
  return [...s].map((c) => (FULLWIDTH[c] ?? (/[A-Za-z0-9]/.test(c) ? String.fromCharCode(c.charCodeAt(0) + 0xfee0) : c))).join("");
}
function productVariant(code: string): string {
  const x = r();
  if (x < 0.5) return code;
  if (x < 0.75) return toFullWidth(code);
  return code.toLowerCase();
}

const yen = (n: number) => `¥${n.toLocaleString("en-US")}`;
function euro(n: number): string {
  const [int_, dec] = n.toFixed(2).split(".");
  return `${int_.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}
/** Excel serial number of a UTC date (1900 date system). */
const excelSerial = (ms: number) => Math.floor((ms - Date.UTC(1899, 11, 30)) / 86400000);

const dateText = (ms: number, sep: string, order: "ymd" | "dmy") => {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const dd = pad(d.getUTCDate());
  return order === "ymd" ? `${y}${sep}${m}${sep}${dd}` : `${dd}${sep}${m}${sep}${y}`;
};
const hm = (ms: number) => `${pad(new Date(ms).getUTCHours())}:${pad(new Date(ms).getUTCMinutes())}`;

// ---------- Rows ----------

const HEADERS = [
  "受付日時", "受付時刻", "開始時刻", "所要時間", "通話時間", "保留時間",
  "解決済み", "is_vip", "要折り返し", "created_at", "event_epoch_ms",
  "受付日(欧州形式)", "記録日時(独自形式)", "請求日(Excel)", "締め日",
  "売上", "売上(千円)", "単価(EUR)", "満足度",
  "担当", "地域", "チャネル", "製品コード", "性別", "優先度", "郵便番号",
];

const rows: string[][] = calls.map(({ at }) => {
  const d = new Date(at);
  const h = d.getUTCHours();
  const secs = chance(0.05) ? int(3600, 5400) : int(40, 1500);
  // Whole minutes for hour-long calls so that "1時間5分" has no seconds part.
  const dur = secs >= 3600 ? Math.round(secs / 60) * 60 : secs;
  const durH = Math.floor(dur / 3600);
  const durM = Math.floor((dur % 3600) / 60);
  const durS = dur % 60;
  const startMs = at + int(1, 6) * 60000;
  const sd = new Date(startMs);
  const amount = chance(0.08) ? int(1_000_001, 5_000_000) : Math.round(int(3, 400) * 1000 + int(0, 9) * 100);
  const sat = Math.max(1, Math.min(5, Math.round(4.4 - dur / 900 + (r() - 0.5) * 2.2)));
  const closing = weighted<number>([[Date.UTC(2025, 2, 31), 6], [Date.UTC(2025, 2, 20), 2], [Date.UTC(2025, 3, 20), 2]]);
  const billing = Date.UTC(2025, 2, 3) + (Math.floor((at - Date.UTC(2025, 2, 3)) / 86400000) + int(0, 30)) * 86400000;
  const resolved = chance(0.72);
  const recordedMs = at + int(1, 40) * 60000;

  return [
    `${dateText(at, "-", "ymd")} ${pad(h)}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
    `${h}:${pad(d.getUTCMinutes())}`,
    `${pad(sd.getUTCHours())}${pad(sd.getUTCMinutes())}`,
    `${durH}:${pad(durM)}:${pad(durS)}`,
    durH > 0 ? `${durH}時間${durM}分` : `${durM}分${durS}秒`,
    chance(0.03) ? "NA" : `${int(0, 15)}:${pad(int(0, 59))}`,
    chance(0.02) ? "" : resolved ? "はい" : "いいえ",
    chance(0.1) ? "1" : "0",
    chance(0.25) ? "○" : "×",
    String(at / 1000),
    String(at + int(0, 999)),
    dateText(at, "/", "dmy"),
    `${dateText(recordedMs, ".", "dmy")} ${hm(recordedMs)}`,
    String(excelSerial(billing)),
    dateText(closing, "/", "ymd"),
    chance(0.04) ? "" : yen(amount),
    "",
    euro(int(5, 2400) + int(0, 99) / 100),
    chance(0.05) ? "" : String(sat),
    pick(AGENTS),
    pick(REGIONS),
    weighted(CHANNELS),
    productVariant(pick(PRODUCTS)),
    chance(0.04) ? "" : chance(0.5) ? "M" : "F",
    String(weighted<number>([[1, 2], [2, 5], [3, 3]])),
    pick(ZIPS),
  ];
});

// 売上(千円) is 売上 in thousands of yen, left blank where 売上 is blank.
const SALES = HEADERS.indexOf("売上");
const SALES_K = HEADERS.indexOf("売上(千円)");
for (const row of rows) {
  const n = Number(row[SALES].replace(/[¥,]/g, ""));
  row[SALES_K] = row[SALES] === "" ? "" : String(Math.round(n / 1000));
}

mkdirSync(OUT_DIR, { recursive: true });
const text = Papa.unparse([HEADERS, ...rows], { newline: "\r\n" });
writeFileSync(join(OUT_DIR, "コールセンター記録.csv"), "﻿" + text);
console.log(`コールセンター記録.csv: ${rows.length} rows`);
