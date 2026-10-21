import { parseDateWith, parseDuration, parseTimeOfDay } from "./parsers";
import type { ColumnMeta, ColumnParse, ColumnType, NumberFormat, RawCell } from "./types";

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

/** Markers that mean "no value" in exports from R, pandas, Excel and databases. */
const MISSING_RE = /^(na|n\/a|#n\/a|nan|null|none|nil|-|—|―|－)$/i;

export function isMissing(s: string): boolean {
  return MISSING_RE.test(s);
}

export function parseNumberDetailed(v: RawCell): ParsedNumber | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? { value: v, prefix: "", suffix: "", decimals: decimalsOf(v) } : null;
  let s = normalize(v);
  if (s === "" || isMissing(s)) return null;
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
  return s === "" || isMissing(s) ? null : s;
}

/** Year-only values ("1750", 2023) as January 1st of that year. Only for columns already known to be dates. */
function parseYear(v: RawCell): number {
  const n = typeof v === "number" ? v : v !== null && /^\s*\d{4}\s*$/.test(v) ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1000 && n <= 2999 ? Date.UTC(n, 0, 1) : NaN;
}

/** Converts a value of a date column: full dates, plus bare years. */
export function parseDateValue(v: RawCell): number {
  const t = parseDate(v);
  return Number.isNaN(t) ? parseYear(v) : t;
}

const ID_HEADER_RE = /(^|[^a-z])(id|code|no|zip|tel)$|^id[^a-z]|ＩＤ|番号|コード|郵便|電話|識別子|ナンバー/i;
const YEAR_HEADER_RE = /年|year|fy/i;
/** Parts of a timestamp split into columns: 現在時刻(月), 日, hour… Small integers here are labels, not amounts. */
const DATEPART_HEADER_RE =
  /(時刻|日時|日付|起日|年月日|date|time)\s*[(（](月|日|時|分|秒)[)）]$|^(月|日|時|分|秒|曜日)$|(^|[_\s])(month|day|hour|minute|second)$/i;
/** Status and quality codes: numbers that must never be summed. */
const CODE_HEADER_RE = /品質|フラグ|flag|状態コード|status.?code/i;
// Values where a total is meaningless: ratios, prices, scores, durations and ages.
const AVG_HEADER_RE =
  /率|割合|単価|平均|価格|price|rate|ratio|score|評価|点数|満足|気温|温度|%|時間|[(（]分[)）]|[(（]秒[)）]|応答|日数|待ち|所要|リードタイム|年齢|\bduration\b|\btime\b|\bage\b|(^|[_\s(（])(mm|cm|km|g|kg|mg|lb|kcal|℃|°c)([)）\s]|$)|身長|体重|長さ|高さ|重さ|重量|面積|体積|気温|湿度|風速|気圧|濃度|密度|速度/i;

export interface InferResult {
  type: ColumnType;
  idLike: boolean;
  format: NumberFormat;
  dateUnit?: "year";
  /** Conversion options the inference settled on (date order, unix timestamps…). */
  parse?: ColumnParse;
  /** Short Japanese explanation of the guess, shown to the user. */
  reason: string;
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


// ---------- Conservative detection of boolean / time / duration / unix / dd-mm dates ----------

const BOOL_PAIRS: [string, string][] = [
  ["true", "false"],
  ["yes", "no"],
  ["y", "n"],
  ["t", "f"],
  ["on", "off"],
  ["はい", "いいえ"],
  ["有", "無"],
  ["あり", "なし"],
  ["済", "未"],
  ["○", "×"],
  ["◯", "×"],
  ["〇", "×"],
];
const BOOL_SINGLES = new Set(["✓", "✔"]);
/** Header hints that make 1/0 (or a single flag value) a boolean. The is/has prefix is case-sensitive so "island" does not match. */
const FLAG_PREFIX_RE = /^(?:[Ii]s|[Hh]as|[Cc]an|[Ss]hould|[Ww]as)[_A-Z]/;
const FLAG_HEADER_RE = /_flag$|flag|フラグ|有無|可否|済み?$/i;
const TIME_HEADER_RE = /時刻|開始|終了|発生|time|at$|clock|受付/i;
const DURATION_STRONG_RE = /所要|経過|duration|elapsed|run_?time|長さ|稼働|待ち|通話|lap|タイム/i;
const DURATION_WEAK_RE = /時間$/;
const UNIX_HEADER_RE = /timestamp|epoch|unix|_at$|_ts$|time$/i;
const COLON_VALUE_RE = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/;
const MERIDIAN_VALUE_RE = /^(午前|午後)|(am|pm)$/i;
/** Multi-unit text ("1時間30分", "1h30m") or ISO 8601 ("PT1H30M"); a lone "30分" stays a number with a unit. */
const UNIT_DURATION_RE = /^(?:\d+(?:\.\d+)?\s*(?:日|時間|分|秒|[dhms])\s*){2,}$|^P(?=\d|T\d)(?:\d+D)?(?:T(?:\d+(?:\.\d+)?[HMS])+)?$/i;

const keyOf = (v: RawCell) => (cellToString(v) ?? "").normalize("NFKC").trim().toLowerCase();

function detectBoolean(header: string, s: RawCell[]): string | null {
  const h = header.normalize("NFKC").trim();
  const flagHint = FLAG_PREFIX_RE.test(h) || FLAG_HEADER_RE.test(h);
  const vals = new Set(s.map(keyOf));
  if (vals.size > 2) return null;
  const list = [...vals];
  if (vals.size === 2) {
    if (BOOL_PAIRS.some(([t, f]) => vals.has(t) && vals.has(f))) return `値が ${list.join("/")} の2種類`;
    if (flagHint && vals.has("1") && vals.has("0")) return "列名がフラグで、値が 1/0";
    return null;
  }
  const only = list[0];
  if (!flagHint) return null;
  const known = BOOL_PAIRS.some(([t, f]) => only === t || only === f) || BOOL_SINGLES.has(only) || only === "1" || only === "0";
  return known ? "列名がフラグで、値が真偽の1種類" : null;
}

function detectTimeOrDuration(header: string, s: RawCell[]): InferResult | null {
  const h = header.normalize("NFKC").trim();
  const strings = s.map((v) => (typeof v === "string" ? v.normalize("NFKC").trim() : null));
  if (strings.some((x) => x === null)) {
    // Excel fractions of a day are not guessed; only text is.
    return null;
  }
  const texts = strings as string[];
  const colon = texts.map((x) => COLON_VALUE_RE.exec(x.replace(MERIDIAN_VALUE_RE, "").trim()));
  const colonShare = colon.filter((m) => m !== null).length / texts.length;
  const timeHint = TIME_HEADER_RE.test(h);
  const strongDur = DURATION_STRONG_RE.test(h);
  const weakDur = DURATION_WEAK_RE.test(h);
  const mk = (type: "time" | "duration", reason: string): InferResult => ({ type, idLike: false, format: EMPTY_FORMAT, reason });
  const okShare = (fn: (v: RawCell) => number) => s.filter((v) => !Number.isNaN(fn(v))).length / s.length >= 0.95;

  if (texts.filter((x) => UNIT_DURATION_RE.test(x)).length / texts.length >= 0.95 && okShare((v) => parseDuration(v))) {
    return mk("duration", "値が 1時間30分 のような長さ");
  }
  if (colonShare < 0.95) return null;
  const hours = colon.map((m) => (m ? +m[1] : NaN)).filter((x) => !Number.isNaN(x));
  const maxHour = Math.max(...hours);
  const minHour = Math.min(...hours);
  const hasSeconds = colon.some((m) => m && m[3] !== undefined);
  const hasMeridian = texts.some((x) => MERIDIAN_VALUE_RE.test(x));
  if (maxHour > 23) return okShare((v) => parseDuration(v)) ? mk("duration", "24時間を超える値があり、長さと判断") : null;
  const durationHinted = strongDur || (weakDur && !timeHint);
  if (durationHinted) return okShare((v) => parseDuration(v)) ? mk("duration", "列名が経過時間を示し、値が h:mm") : null;
  if (!okShare((v) => parseTimeOfDay(v))) return null;
  if (timeHint) return mk("time", "列名が時刻を示し、値が hh:mm");
  if (hasSeconds || hasMeridian) return mk("time", hasMeridian ? "値が午前/午後付きの時刻" : "値が hh:mm:ss の時刻");
  // Plain h:mm with no hint: only when the hours look like a clock.
  return maxHour <= 23 && maxHour >= 1 && minHour >= 0 && hours.some((x) => x >= 1) ? mk("time", "値が時刻の範囲の hh:mm") : null;
}

/** "03/04/2025" style dates: the order is decided only when some value proves it. */
function detectAmbiguousDate(s: RawCell[]): { order: "dmy" | "mdy" } | null {
  const parts = s.map((v) => (typeof v === "string" ? /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v.normalize("NFKC").trim()) : null));
  if (parts.some((m) => m === null)) return null;
  const firstBig = parts.some((m) => +m![1] > 12);
  const secondBig = parts.some((m) => +m![2] > 12);
  if (firstBig === secondBig) return null;
  const order = firstBig ? "dmy" : "mdy";
  return s.every((v) => !Number.isNaN(parseDateWith(v, { dateFormat: order }))) ? { order } : null;
}

function detectUnix(header: string, numHits: ParsedNumber[]): "unix-s" | "unix-ms" | null {
  if (!UNIX_HEADER_RE.test(header.normalize("NFKC").trim())) return null;
  if (!numHits.every((n) => Number.isInteger(n.value) && !n.prefix && !n.suffix)) return null;
  const within = (lo: number, hi: number) => numHits.every((n) => n.value >= lo && n.value <= hi);
  if (within(946684800, 4102444800)) return "unix-s";
  return within(946684800000, 4102444800000) ? "unix-ms" : null;
}

export function inferColumn(header: string, values: RawCell[]): InferResult {
  const nonEmpty = values.filter((v) => cellToString(v) !== null);
  if (nonEmpty.length === 0) return { type: "text", idLike: false, format: EMPTY_FORMAT, reason: "値がありません" };
  const s = sample(nonEmpty, 3000);
  const headerIsId = ID_HEADER_RE.test(header.normalize("NFKC").trim());

  const dateHits = s.filter((v) => !Number.isNaN(parseDate(v))).length;
  if (dateHits / s.length >= 0.95) return { type: "date", idLike: false, format: EMPTY_FORMAT, reason: "値が日付の形式" };

  const ambiguous = detectAmbiguousDate(s);
  if (ambiguous) {
    return {
      type: "date",
      idLike: false,
      format: EMPTY_FORMAT,
      parse: { dateFormat: ambiguous.order },
      reason: ambiguous.order === "dmy" ? "日/月/年 の並びと判断" : "月/日/年 の並びと判断",
    };
  }
  const boolReason = detectBoolean(header, s);
  if (boolReason) return { type: "boolean", idLike: false, format: EMPTY_FORMAT, reason: boolReason };
  const timeOrDuration = detectTimeOrDuration(header, s);
  if (timeOrDuration) return timeOrDuration;

  const nums = s.map(parseNumberDetailed);
  const numHits = nums.filter((n) => n !== null) as ParsedNumber[];
  const leadingZeros = s.some((v) => typeof v === "string" && /^0\d+$/.test(v.trim())) && !DATEPART_HEADER_RE.test(header.trim());
  const distinct = new Set(nonEmpty.map((v) => cellToString(v))).size;
  const unique = distinct === nonEmpty.length && nonEmpty.length >= 20;

  if (numHits.length / s.length >= 0.95 && !leadingZeros) {
    const allInts = numHits.every((n) => Number.isInteger(n.value));
    // Years are time, not amounts: never summed, and usable as the axis of a trend chart.
    const yearLike = allInts && YEAR_HEADER_RE.test(header) && numHits.every((n) => n.value >= 1000 && n.value <= 2100);
    if (yearLike) return { type: "date", idLike: false, format: EMPTY_FORMAT, dateUnit: "year", reason: "列名に年を含み、値が西暦" };
    const unix = detectUnix(header, numHits);
    if (unix) {
      return {
        type: "date",
        idLike: false,
        format: EMPTY_FORMAT,
        parse: { dateFormat: unix },
        reason: unix === "unix-s" ? "列名と値の範囲から Unix 秒" : "列名と値の範囲から Unix ミリ秒",
      };
    }
    if (allInts && DATEPART_HEADER_RE.test(header.trim()) && numHits.every((n) => n.value >= 0 && n.value <= 60)) {
      return { type: "category", idLike: false, format: EMPTY_FORMAT, reason: "日時を分けた列の一部" };
    }
    if (CODE_HEADER_RE.test(header)) return { type: "category", idLike: true, format: EMPTY_FORMAT, reason: "列名がコード・フラグ" };
    // Unique integers of one fixed width (≥5 digits, no unit) are codes such as station numbers.
    const fixedWidthCodes =
      unique &&
      allInts &&
      nonEmpty.length >= 50 &&
      numHits.every((n) => !n.prefix && !n.suffix && n.value >= 10000 && String(n.value).length === String(numHits[0].value).length);
    if (headerIsId || fixedWidthCodes || (unique && allInts && isSequential(numHits.map((n) => n.value)))) {
      return { type: unique ? "text" : "category", idLike: true, format: EMPTY_FORMAT, reason: "ID・コードと判断" };
    }
    const prefix = mostCommon(numHits.map((n) => n.prefix));
    const suffix = mostCommon(numHits.map((n) => n.suffix));
    const maxDecimals = Math.max(...numHits.map((n) => n.decimals));
    return {
      type: "number",
      idLike: false,
      format: { prefix, suffix, decimals: maxDecimals === 0 ? 0 : null },
      reason: "値が数値",
    };
  }

  const strings = s.map((v) => cellToString(v) ?? "");
  const avgLen = strings.reduce((a, b) => a + b.length, 0) / strings.length;
  if (headerIsId || (unique && avgLen <= 24)) {
    return { type: unique ? "text" : "category", idLike: true, format: EMPTY_FORMAT, reason: "ID・コードと判断" };
  }
  const isCategory = avgLen <= 40 && (distinct <= 50 || (distinct <= 300 && distinct / nonEmpty.length <= 0.3));
  return isCategory
    ? { type: "category", idLike: false, format: EMPTY_FORMAT, reason: "値の種類が少ない" }
    : { type: "text", idLike: false, format: EMPTY_FORMAT, reason: "値の種類が多い文章" };
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
      ...(r.dateUnit ? { dateUnit: r.dateUnit } : {}),
      ...(r.parse ? { parse: r.parse, inferredParse: r.parse } : {}),
      inferredReason: r.reason,
    };
  });
}
