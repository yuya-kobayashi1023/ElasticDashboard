import { cellToString, isMissing, parseDateValue, parseNumber } from "./infer";
import type { ColumnMeta, ColumnParse, RawCell } from "./types";

const norm = (s: string) => s.normalize("NFKC").trim();

/** Text of a cell after NFKC + trim, or null when it is blank or a missing marker. */
function textOf(v: RawCell): string | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  const s = norm(v);
  return s === "" || isMissing(s) ? null : s;
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const DAY_MS = 86400000;

// ---------- Number ----------

export function parseNumberWith(v: RawCell, p?: ColumnParse): number {
  let x: number;
  if (p?.decimalComma && typeof v === "string") {
    const s = textOf(v);
    if (s === null) return NaN;
    // Dot, space and apostrophes are grouping; the comma is the decimal separator.
    x = parseNumber(s.replace(/[.\s'’]/g, "").replace(",", "."));
  } else x = parseNumber(v);
  return p?.scale !== undefined && Number.isFinite(p.scale) ? x * p.scale : x;
}

// ---------- Patterns (date / time) ----------

const TOKEN_RE = /YYYY|YY|MM|M|DD|D|hh|h|mm|m|ss|s/g;
const TOKEN_GROUP: Record<string, { field: "Y" | "M" | "D" | "h" | "m" | "s"; re: string }> = {
  YYYY: { field: "Y", re: "(\\d{4})" },
  YY: { field: "Y", re: "(\\d{2})" },
  MM: { field: "M", re: "(\\d{2})" },
  M: { field: "M", re: "(\\d{1,2})" },
  DD: { field: "D", re: "(\\d{2})" },
  D: { field: "D", re: "(\\d{1,2})" },
  hh: { field: "h", re: "(\\d{2})" },
  h: { field: "h", re: "(\\d{1,2})" },
  mm: { field: "m", re: "(\\d{2})" },
  m: { field: "m", re: "(\\d{1,2})" },
  ss: { field: "s", re: "(\\d{2})" },
  s: { field: "s", re: "(\\d{1,2})" },
};

interface Fields {
  Y?: number;
  M?: number;
  D?: number;
  h?: number;
  m?: number;
  s?: number;
}

const patternCache = new Map<string, { re: RegExp; fields: (keyof Fields)[]; twoDigitYear: boolean } | null>();

function compilePattern(pattern: string) {
  const hit = patternCache.get(pattern);
  if (hit !== undefined) return hit;
  const pat = pattern.normalize("NFKC");
  const fields: (keyof Fields)[] = [];
  let re = "";
  let last = 0;
  let twoDigitYear = false;
  for (const m of pat.matchAll(TOKEN_RE)) {
    re += escapeRe(pat.slice(last, m.index));
    const g = TOKEN_GROUP[m[0]];
    if (fields.includes(g.field)) {
      patternCache.set(pattern, null);
      return null;
    }
    fields.push(g.field);
    if (m[0] === "YY") twoDigitYear = true;
    re += g.re;
    last = m.index + m[0].length;
  }
  re += escapeRe(pat.slice(last));
  const out = fields.length ? { re: new RegExp(`^${re}$`), fields, twoDigitYear } : null;
  patternCache.set(pattern, out);
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matchPattern(s: string, pattern: string | undefined): Fields | null {
  if (!pattern) return null;
  const c = compilePattern(pattern);
  if (!c) return null;
  const m = c.re.exec(s);
  if (!m) return null;
  const f: Fields = {};
  c.fields.forEach((k, i) => (f[k] = +m[i + 1]));
  if (c.twoDigitYear && f.Y !== undefined) f.Y += f.Y < 70 ? 2000 : 1900;
  return f;
}

function utcMs(y: number, mo: number, d: number, h: number, mi: number, s: number): number {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return NaN;
  const t = Date.UTC(y, mo - 1, d, h, mi, s);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return NaN;
  return t;
}

// ---------- Time of day ----------

const MERIDIAN_RE = /^(午前|午後|am|pm|a\.m\.|p\.m\.)\s*|\s*(am|pm|a\.m\.|p\.m\.)$/i;
const COLON_TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2})(\.\d+)?)?$/;
const JA_TIME_RE = /^(\d{1,2})時(?:(\d{1,2})分)?(?:(\d{1,2})秒)?$/;
const DATE_PREFIX_RE = /^\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s+|T)/;

function hmsToSeconds(h: number, m: number, s: number, frac = 0): number {
  if (h > 23 || m > 59 || s > 59) return NaN;
  return round3(h * 3600 + m * 60 + s + frac);
}

/** Time of day in seconds since 00:00, or NaN. Hours above 23 are durations, not times. */
export function parseTimeOfDay(v: RawCell, p?: ColumnParse): number {
  if (typeof v === "number") {
    // Excel stores a time as a fraction of a day.
    if (Number.isFinite(v) && v >= 0 && v < 1) return round3(v * 86400);
    // "0930" read from a spreadsheet as the number 930.
    const fmt = p?.timeFormat;
    if ((fmt === "hm" || fmt === "hms") && Number.isInteger(v) && v >= 0 && v <= 235959) {
      return parseTimeOfDay(String(v).padStart(fmt === "hm" ? 4 : 6, "0"), p);
    }
    return NaN;
  }
  let s = textOf(v);
  if (s === null) return NaN;
  const fmt = p?.timeFormat ?? "auto";
  if (fmt === "pattern") {
    const f = matchPattern(s, p?.pattern);
    return f && f.h !== undefined ? hmsToSeconds(f.h, f.m ?? 0, f.s ?? 0) : NaN;
  }
  s = s.replace(DATE_PREFIX_RE, "");
  let meridian: "am" | "pm" | null = null;
  const mm = MERIDIAN_RE.exec(s);
  if (mm) {
    const tag = (mm[1] ?? mm[2]).toLowerCase();
    meridian = tag === "午前" || tag.startsWith("a") ? "am" : "pm";
    s = s.replace(MERIDIAN_RE, "");
  }
  let h: number;
  let m: number;
  let sec = 0;
  let frac = 0;
  let hasSeconds = false;
  let x: RegExpExecArray | null;
  if ((x = COLON_TIME_RE.exec(s))) {
    [h, m] = [+x[1], +x[2]];
    if (x[3] !== undefined) [sec, frac, hasSeconds] = [+x[3], x[4] ? Number(x[4]) : 0, true];
  } else if ((x = JA_TIME_RE.exec(s))) {
    [h, m] = [+x[1], x[2] ? +x[2] : 0];
    if (x[3] !== undefined) [sec, hasSeconds] = [+x[3], true];
  } else if ((fmt === "hm" || fmt === "hms") && (x = /^(\d{2})(\d{2})(\d{2})?$/.exec(s))) {
    [h, m] = [+x[1], +x[2]];
    if (x[3] !== undefined) [sec, hasSeconds] = [+x[3], true];
  } else return NaN;
  if (fmt === "hm" && hasSeconds) return NaN;
  if (fmt === "hms" && !hasSeconds) return NaN;
  if (meridian) {
    if (h < 1 || h > 12) return NaN;
    h = (h % 12) + (meridian === "pm" ? 12 : 0);
  }
  return hmsToSeconds(h, m, sec, frac);
}

// ---------- Duration ----------

const UNIT_SECONDS: Record<NonNullable<ColumnParse["durationUnit"]>, number> = { ms: 0.001, s: 1, min: 60, h: 3600, d: 86400 };
const UNIT_WORD = "ミリ秒|milliseconds?|msecs?|ms|日|days?|d|時間|hours?|hrs?|h|分|minutes?|mins?|m|秒|seconds?|secs?|s";
const UNIT_PAIR_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIT_WORD})`, "gi");
const UNIT_FULL_RE = new RegExp(`^(?:\\s*\\d+(?:\\.\\d+)?\\s*(?:${UNIT_WORD})\\s*)+$`, "i");
const ISO_RE = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;
const DURATION_COLON_RE = /^(\d+):(\d{1,2})(?::(\d{1,2}))?(\.\d+)?$/;

function unitSeconds(word: string): number {
  const w = word.toLowerCase();
  if (w === "ミリ秒" || w.startsWith("ms") || w.startsWith("milli")) return 0.001;
  if (w === "日" || w.startsWith("d")) return 86400;
  if (w === "時間" || w.startsWith("h")) return 3600;
  if (w === "分" || w.startsWith("m")) return 60;
  return 1;
}

/** Length of time in seconds ("1:02:03", "1h 30m", "1時間30分", "PT1H30M", bare numbers by unit), or NaN. */
export function parseDuration(v: RawCell, p?: ColumnParse): number {
  const scale = p?.scale !== undefined && Number.isFinite(p.scale) ? p.scale : 1;
  const unit = UNIT_SECONDS[p?.durationUnit ?? "s"];
  if (typeof v === "number") return Number.isFinite(v) ? round3(v * unit * scale) : NaN;
  let s = textOf(v);
  if (s === null) return NaN;
  let sign = 1;
  if (/^[-−]/.test(s)) {
    sign = -1;
    s = s.slice(1).trim();
  }
  let total: number;
  let m: RegExpExecArray | null;
  if ((m = ISO_RE.exec(s)) && /[DHMS]/i.test(s)) {
    total = (+(m[1] ?? 0)) * 86400 + (+(m[2] ?? 0)) * 3600 + (+(m[3] ?? 0)) * 60 + +(m[4] ?? 0);
  } else if ((m = DURATION_COLON_RE.exec(s))) {
    const frac = m[4] ? Number(m[4]) : 0;
    if (m[3] !== undefined) {
      if (+m[2] > 59 || +m[3] > 59) return NaN;
      total = +m[1] * 3600 + +m[2] * 60 + +m[3] + frac;
    } else if ((p?.durationColon ?? "hm") === "ms") {
      if (+m[2] > 59) return NaN;
      total = +m[1] * 60 + +m[2] + frac;
    } else {
      if (+m[2] > 59 || frac) return NaN;
      total = +m[1] * 3600 + +m[2] * 60;
    }
  } else if (UNIT_FULL_RE.test(s)) {
    total = 0;
    for (const pair of s.matchAll(UNIT_PAIR_RE)) total += +pair[1] * unitSeconds(pair[2]);
  } else if (/^\d+(?:\.\d+)?$/.test(s)) {
    total = Number(s) * unit;
  } else {
    const d = parseNumber(s);
    // Grouped numbers such as "1,500"; values with their own unit were handled above.
    if (Number.isNaN(d) || !/^[\d,.]+$/.test(s)) return NaN;
    total = d * unit;
  }
  return round3(sign * total * scale);
}

// ---------- Boolean ----------

export const TRUE_WORDS = new Set(["true", "yes", "y", "t", "1", "on", "はい", "有", "有り", "あり", "済", "○", "◯", "✓", "✔", "〇", "真"]);
export const FALSE_WORDS = new Set(["false", "no", "n", "f", "0", "off", "いいえ", "無", "無し", "なし", "未", "×", "✗", "✘", "偽"]);
const boolKey = (s: string) => s.normalize("NFKC").trim().toLowerCase();

/** 1 / 0 for recognised spellings of yes / no, NaN otherwise. */
export function parseBoolean(v: RawCell, p?: ColumnParse): number {
  if (typeof v === "number") return v === 1 ? 1 : v === 0 ? 0 : NaN;
  const raw = v === null ? null : boolKey(v);
  if (raw === null || raw === "" || isMissing(raw)) return NaN;
  if (p?.trueValues?.some((x) => boolKey(x) === raw)) return 1;
  if (p?.falseValues?.some((x) => boolKey(x) === raw)) return 0;
  if (TRUE_WORDS.has(raw)) return 1;
  if (FALSE_WORDS.has(raw)) return 0;
  return /^0+(\.0+)?$/.test(raw) ? 0 : /^1(\.0+)?$/.test(raw) ? 1 : NaN;
}

// ---------- Date ----------

const NUMERIC_RE = /^[+-]?\d+(?:\.\d+)?$/;
const THREE_PART_RE = /^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})(?:(?:\s+|T)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/;

function numericOf(v: RawCell): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = textOf(v);
  return s !== null && NUMERIC_RE.test(s) ? Number(s) : NaN;
}

function threePart(s: string, order: "ymd" | "mdy" | "dmy"): number {
  const m = THREE_PART_RE.exec(s);
  if (!m) return NaN;
  const [a, b, c] = [m[1], m[2], m[3]];
  let y: number;
  let mo: number;
  let d: number;
  if (order === "ymd") {
    if (a.length === 3 || a.length === 1 || c.length > 2) return NaN;
    [y, mo, d] = [+a, +b, +c];
    if (a.length === 2) y += y < 70 ? 2000 : 1900;
  } else {
    if (c.length === 3 || a.length > 2) return NaN;
    [mo, d] = order === "mdy" ? [+a, +b] : [+b, +a];
    y = +c;
    if (c.length === 2) y += y < 70 ? 2000 : 1900;
  }
  return utcMs(y, mo, d, m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
}

/** Converts a value of a date column according to the column's date format. Result is UTC epoch ms (wall clock). */
export function parseDateWith(v: RawCell, p?: ColumnParse): number {
  const fmt = p?.dateFormat ?? "auto";
  switch (fmt) {
    case "auto":
      return parseDateValue(v);
    case "ymd":
    case "mdy":
    case "dmy": {
      const s = textOf(v);
      if (s === null) return NaN;
      const t = threePart(s, fmt);
      return Number.isNaN(t) ? parseDateValue(v) : t;
    }
    case "unix-s": {
      const x = numericOf(v);
      return Number.isNaN(x) ? NaN : validTime(Math.round(x * 1000));
    }
    case "unix-ms": {
      const x = numericOf(v);
      return Number.isNaN(x) ? NaN : validTime(Math.round(x));
    }
    case "excel": {
      const x = numericOf(v);
      // 25569 = 1970-01-01 in the 1900 date system; rounded to the second to hide float noise.
      return Number.isNaN(x) ? NaN : validTime(Math.round(((x - 25569) * DAY_MS) / 1000) * 1000);
    }
    case "pattern": {
      const s = textOf(v);
      const f = s === null ? null : matchPattern(s, p?.pattern);
      if (!f || f.Y === undefined || f.M === undefined) return NaN;
      return utcMs(f.Y, f.M, f.D ?? 1, f.h ?? 0, f.m ?? 0, f.s ?? 0);
    }
  }
}

function validTime(t: number): number {
  return Math.abs(t) <= 8.64e15 ? t : NaN;
}

// ---------- Column converters ----------

/** Converter from a raw cell to the stored number for a Float64Array column type. */
export function converterFor(meta: Pick<ColumnMeta, "type" | "parse" | "dateUnit">): (v: RawCell) => number {
  const p = meta.parse;
  switch (meta.type) {
    case "number":
      return p ? (v) => parseNumberWith(v, p) : parseNumber;
    case "date":
      return p ? (v) => parseDateWith(v, p) : parseDateValue;
    case "time":
      return (v) => parseTimeOfDay(v, p);
    case "duration":
      return (v) => parseDuration(v, p);
    case "boolean":
      return (v) => parseBoolean(v, p);
    default:
      return () => NaN;
  }
}

/** Converter for category / text columns: trimmed text with the optional normalizations applied. */
export function textNormalizerFor(meta: Pick<ColumnMeta, "parse">): (v: RawCell) => string | null {
  const p = meta.parse;
  if (!p || (p.trim !== false && !p.widthNormalize && (!p.letterCase || p.letterCase === "none"))) return cellToString;
  return (v) => {
    let s = cellToString(v);
    if (s === null) return null;
    if (p.trim === false && typeof v === "string") s = v;
    if (p.widthNormalize) s = s.normalize("NFKC");
    if (p.letterCase === "upper") s = s.toUpperCase();
    else if (p.letterCase === "lower") s = s.toLowerCase();
    return s === "" ? null : s;
  };
}
