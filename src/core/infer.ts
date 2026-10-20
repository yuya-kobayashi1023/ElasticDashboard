import type { ColumnMeta, ColumnType, NumberFormat, RawCell } from "./types";

const NUMBER_RE =
  /^([¥$€£])?\s*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(%|円|千円|万円|百万円|件|個|人|台|本|回|点|pt|kg|g|km|m|時間|分|秒|日|ヶ月|か月)?$/;

const ERA_BASE: Record<string, number> = { 令和: 2018, R: 2018, 平成: 1988, H: 1988, 昭和: 1925, S: 1925 };

export interface ParsedNumber {
  value: number;
  prefix: string;
  suffix: string;
  decimals: number;
}

function normalize(s: string): string {
  return s.normalize("NFKC").trim();
}

export function parseNumberDetailed(v: RawCell): ParsedNumber | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? { value: v, prefix: "", suffix: "", decimals: decimalsOf(v) } : null;
  let s = normalize(v);
  if (s === "" || s === "-" || s === "—") return null;
  let negative = false;
  // Japanese accounting notation (△ / ▲) and parenthesised negatives.
  if (/^[△▲]/.test(s)) {
    negative = true;
    s = s.slice(1).trim();
  } else if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^[−–]/, "-");
  const m = NUMBER_RE.exec(s);
  if (!m || m[2] === "" || m[2] === "+" || m[2] === "-") return null;
  const numText = m[2].replace(/,/g, "");
  const value = Number(numText);
  if (!Number.isFinite(value)) return null;
  const dot = numText.indexOf(".");
  const decimals = dot === -1 || /e/i.test(numText) ? 0 : numText.length - dot - 1;
  return { value: negative ? -value : value, prefix: m[1] ?? "", suffix: m[3] ?? "", decimals };
}

function decimalsOf(n: number): number {
  if (Number.isInteger(n)) return 0;
  const s = String(n);
  const dot = s.indexOf(".");
  return dot === -1 ? 0 : Math.min(s.length - dot - 1, 6);
}

export function parseNumber(v: RawCell): number {
  const p = parseNumberDetailed(v);
  return p ? p.value : NaN;
}

function utc(y: number, mo: number, d: number, h = 0, mi = 0, s = 0): number {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return NaN;
  const t = Date.UTC(y, mo - 1, d, h, mi, s);
  const dt = new Date(t);
  // Reject overflow such as 2/30.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return NaN;
  return t;
}

const YMD_RE =
  /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:(?:\s+|T)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?$/;
const YM_RE = /^(\d{4})[-/.年](\d{1,2})月?$/;
const COMPACT_RE = /^(\d{4})(\d{2})(\d{2})$/;
const ERA_RE = /^(令和|平成|昭和|[RHS])\s*(\d{1,2}|元)[年.\/-](\d{1,2})[月.\/-](\d{1,2})日?$/;

/** Parses a date-like value into UTC epoch milliseconds (wall-clock time, offsets ignored). */
export function parseDate(v: RawCell): number {
  if (v === null) return NaN;
  if (typeof v === "number") {
    return Number.isInteger(v) && v >= 19000101 && v <= 21001231 ? parseDate(String(v)) : NaN;
  }
  const s = normalize(v);
  if (s === "") return NaN;
  let m = YMD_RE.exec(s);
  if (m) return utc(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
  m = COMPACT_RE.exec(s);
  if (m) {
    const y = +m[1];
    return y >= 1900 && y <= 2100 ? utc(y, +m[2], +m[3]) : NaN;
  }
  m = YM_RE.exec(s);
  if (m) return utc(+m[1], +m[2], 1);
  m = ERA_RE.exec(s);
  if (m) {
    const year = ERA_BASE[m[1]] + (m[2] === "元" ? 1 : +m[2]);
    return utc(year, +m[3], +m[4]);
  }
  return NaN;
}

export function cellToString(v: RawCell): string | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  const s = v.trim();
  return s === "" ? null : s;
}

const ID_HEADER_RE = /(^|[^a-z])(id|code|no|zip|tel)$|^id[^a-z]|ＩＤ|番号|コード|郵便|電話|識別子|ナンバー/i;
const YEAR_HEADER_RE = /年|year|fy/i;
// Values where a total is meaningless: ratios, prices, scores, durations and ages.
const AVG_HEADER_RE =
  /率|割合|単価|平均|価格|price|rate|ratio|score|評価|点数|満足|気温|温度|%|時間|[(（]分[)）]|[(（]秒[)）]|応答|日数|待ち|所要|リードタイム|年齢|\bduration\b|\btime\b|\bage\b/i;

export interface InferResult {
  type: ColumnType;
  idLike: boolean;
  format: NumberFormat;
}

const EMPTY_FORMAT: NumberFormat = { prefix: "", suffix: "", decimals: null };

function sample<T>(values: T[], max: number): T[] {
  if (values.length <= max) return values;
  const step = values.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(values[Math.floor(i * step)]);
  return out;
}

function mostCommon(items: string[]): string {
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it, (counts.get(it) ?? 0) + 1);
  let best = "";
  let bestN = 0;
  for (const [k, n] of counts) if (n > bestN) [best, bestN] = [k, n];
  return best;
}

export function inferColumn(header: string, values: RawCell[]): InferResult {
  const nonEmpty = values.filter((v) => cellToString(v) !== null);
  if (nonEmpty.length === 0) return { type: "text", idLike: false, format: EMPTY_FORMAT };
  const s = sample(nonEmpty, 3000);
  const headerIsId = ID_HEADER_RE.test(header.normalize("NFKC").trim());

  const dateHits = s.filter((v) => !Number.isNaN(parseDate(v))).length;
  if (dateHits / s.length >= 0.95) return { type: "date", idLike: false, format: EMPTY_FORMAT };

  const nums = s.map(parseNumberDetailed);
  const numHits = nums.filter((n) => n !== null) as ParsedNumber[];
  const leadingZeros = s.some((v) => typeof v === "string" && /^0\d+$/.test(v.trim()));
  const distinct = new Set(nonEmpty.map((v) => cellToString(v))).size;
  const unique = distinct === nonEmpty.length && nonEmpty.length >= 20;

  if (numHits.length / s.length >= 0.95 && !leadingZeros) {
    const allInts = numHits.every((n) => Number.isInteger(n.value));
    const yearLike =
      allInts && YEAR_HEADER_RE.test(header) && numHits.every((n) => n.value >= 1900 && n.value <= 2100) && distinct <= 50;
    if (yearLike) return { type: "category", idLike: false, format: EMPTY_FORMAT };
    if (headerIsId || (unique && allInts && isSequential(numHits.map((n) => n.value)))) {
      return { type: unique ? "text" : "category", idLike: true, format: EMPTY_FORMAT };
    }
    const prefix = mostCommon(numHits.map((n) => n.prefix));
    const suffix = mostCommon(numHits.map((n) => n.suffix));
    const maxDecimals = Math.max(...numHits.map((n) => n.decimals));
    return {
      type: "number",
      idLike: false,
      format: { prefix, suffix, decimals: maxDecimals === 0 ? 0 : null },
    };
  }

  const strings = s.map((v) => cellToString(v) ?? "");
  const avgLen = strings.reduce((a, b) => a + b.length, 0) / strings.length;
  if (headerIsId || (unique && avgLen <= 24)) {
    return { type: unique ? "text" : "category", idLike: true, format: EMPTY_FORMAT };
  }
  const isCategory = avgLen <= 40 && (distinct <= 50 || (distinct <= 300 && distinct / nonEmpty.length <= 0.3));
  return { type: isCategory ? "category" : "text", idLike: false, format: EMPTY_FORMAT };
}

function isSequential(values: number[]): boolean {
  if (values.length < 20) return false;
  let steps = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(values[i] - values[i - 1]) === 1) steps++;
  return steps / (values.length - 1) >= 0.9;
}

export function prefersAverage(meta: ColumnMeta): boolean {
  return AVG_HEADER_RE.test(meta.label) || meta.format.suffix === "%";
}

export function inferColumns(headers: string[], rows: RawCell[][]): ColumnMeta[] {
  return headers.map((h, i) => {
    const r = inferColumn(
      h,
      rows.map((row) => row[i] ?? null),
    );
    return {
      key: h,
      label: h,
      type: r.type,
      inferredType: r.type,
      hidden: false,
      idLike: r.idLike,
      format: r.format,
    };
  });
}
