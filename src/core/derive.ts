import { parseDate } from "./infer";
import type { ColumnMeta, ColumnValues, DatePart, DateParts, Lookup, RawCell } from "./types";

// ---------- Formula columns ----------

type Node =
  | { t: "num"; v: number }
  | { t: "col"; key: string }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/"; a: Node; b: Node };

export class FormulaError extends Error {}

type Token = { t: "num"; v: number } | { t: "col"; name: string } | { t: "op"; v: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const s = src.normalize("NFKC");
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === "[") {
      const end = s.indexOf("]", i);
      if (end < 0) throw new FormulaError("「[」に対応する「]」がありません");
      const name = s.slice(i + 1, end).trim();
      if (!name) throw new FormulaError("[ ] の中に列名を入れてください");
      tokens.push({ t: "col", name });
      i = end + 1;
    } else if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const v = Number(s.slice(i, j));
      if (!Number.isFinite(v)) throw new FormulaError(`数値「${s.slice(i, j)}」を読み取れません`);
      tokens.push({ t: "num", v });
      i = j;
    } else if ("+-*/()".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
    } else if (c === "×") {
      tokens.push({ t: "op", v: "*" });
      i++;
    } else if (c === "÷") {
      tokens.push({ t: "op", v: "/" });
      i++;
    } else {
      throw new FormulaError(`「${c}」は使えません。列は [列名] のように書きます`);
    }
  }
  return tokens;
}

/** Parses a formula. `resolve` maps a written column name (label or key) to a column key. */
export function parseFormula(src: string, resolve: (name: string) => string | null): Node {
  const tokens = tokenize(src);
  if (tokens.length === 0) throw new FormulaError("計算式を入力してください");
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === "op" && (peek() as { v: string }).v === v;

  const primary = (): Node => {
    const tok = tokens[pos++];
    if (!tok) throw new FormulaError("式が途中で終わっています");
    if (tok.t === "num") return { t: "num", v: tok.v };
    if (tok.t === "col") {
      const key = resolve(tok.name);
      if (!key) throw new FormulaError(`列「${tok.name}」が見つかりません`);
      return { t: "col", key };
    }
    if (tok.v === "(") {
      const n = expr();
      if (!isOp(")")) throw new FormulaError("「(」に対応する「)」がありません");
      pos++;
      return n;
    }
    if (tok.v === "-") return { t: "neg", a: primary() };
    throw new FormulaError(`「${tok.v}」の位置が正しくありません`);
  };
  const term = (): Node => {
    let n = primary();
    while (isOp("*") || isOp("/")) {
      const op = (tokens[pos++] as { v: "*" | "/" }).v;
      n = { t: "bin", op, a: n, b: primary() };
    }
    return n;
  };
  const expr = (): Node => {
    let n = term();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[pos++] as { v: "+" | "-" }).v;
      n = { t: "bin", op, a: n, b: term() };
    }
    return n;
  };
  const root = expr();
  if (pos < tokens.length) throw new FormulaError("式の後ろに余分な記号があります");
  return root;
}

export function formulaRefs(node: Node, out = new Set<string>()): Set<string> {
  if (node.t === "col") out.add(node.key);
  else if (node.t === "neg") formulaRefs(node.a, out);
  else if (node.t === "bin") {
    formulaRefs(node.a, out);
    formulaRefs(node.b, out);
  }
  return out;
}

/** Converts a formula typed with labels into the stored form with [key] references. */
export function toStoredFormula(src: string, columns: ColumnMeta[]): string {
  const node = parseFormula(src, (name) => resolveColumn(name, columns));
  const print = (n: Node, parent = 0): string => {
    switch (n.t) {
      case "num":
        return String(n.v);
      case "col":
        return `[${n.key}]`;
      case "neg":
        return `-${print(n.a, 3)}`;
      case "bin": {
        const prec = n.op === "+" || n.op === "-" ? 1 : 2;
        // Right operand of - and / needs parentheses at equal precedence.
        const body = `${print(n.a, prec)} ${n.op} ${print(n.b, prec + (n.op === "-" || n.op === "/" ? 0.5 : 0))}`;
        return prec < parent ? `(${body})` : body;
      }
    }
  };
  return print(node);
}

/** Shows a stored formula with column labels instead of keys. */
export function displayFormula(stored: string, columns: ColumnMeta[]): string {
  return stored.replace(/\[([^\]]+)\]/g, (m, key: string) => {
    const c = columns.find((x) => x.key === key);
    return c ? `[${c.label}]` : m;
  });
}

function resolveColumn(name: string, columns: ColumnMeta[]): string | null {
  const n = name.normalize("NFKC").trim();
  const byLabel = columns.find((c) => c.label.normalize("NFKC").trim() === n);
  if (byLabel) return byLabel.key;
  return columns.find((c) => c.key === n)?.key ?? null;
}

export function evaluateFormula(stored: string, columns: Map<string, ColumnValues>, rowCount: number): Float64Array {
  const node = parseFormula(stored, (key) => (columns.has(key) ? key : null));
  const arrays = new Map<string, Float64Array>();
  for (const key of formulaRefs(node)) {
    const col = columns.get(key)!;
    if (col.type !== "number" && col.type !== "duration") throw new FormulaError(`列「${key}」は数値ではありません`);
    arrays.set(key, col.values);
  }
  const out = new Float64Array(rowCount);
  const ev = (n: Node, i: number): number => {
    switch (n.t) {
      case "num":
        return n.v;
      case "col":
        return arrays.get(n.key)![i];
      case "neg":
        return -ev(n.a, i);
      case "bin": {
        const a = ev(n.a, i);
        const b = ev(n.b, i);
        if (n.op === "+") return a + b;
        if (n.op === "-") return a - b;
        if (n.op === "*") return a * b;
        return b === 0 ? NaN : a / b;
      }
    }
  };
  for (let i = 0; i < rowCount; i++) out[i] = ev(node, i);
  return out;
}

// ---------- Date parts ----------

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

export const DATE_PART_LABEL: Record<DatePart, string> = {
  year: "年",
  quarter: "四半期",
  month: "月",
  yearmonth: "年月",
  weekday: "曜日",
  day: "日",
  hour: "時",
};

/** Fixed category order so charts sort weekdays and months naturally. */
export function datePartOrder(part: DatePart): string[] | undefined {
  switch (part) {
    case "weekday":
      return WEEKDAYS.map((d) => `${d}曜`);
    case "month":
      return Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
    case "quarter":
      return ["Q1", "Q2", "Q3", "Q4"];
    case "day":
      return Array.from({ length: 31 }, (_, i) => `${i + 1}日`);
    case "hour":
      return Array.from({ length: 24 }, (_, i) => `${i}時`);
    default:
      return undefined;
  }
}

export function datePart(t: number, part: DatePart): string | null {
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  switch (part) {
    case "year":
      return `${y}`;
    case "quarter":
      return `Q${Math.floor((m - 1) / 3) + 1}`;
    case "month":
      return `${m}月`;
    case "yearmonth":
      return `${y}-${String(m).padStart(2, "0")}`;
    case "weekday":
      return `${WEEKDAYS[(d.getUTCDay() + 6) % 7]}曜`;
    case "day":
      return `${d.getUTCDate()}日`;
    case "hour":
      return `${d.getUTCHours()}時`;
  }
}

export function derivedSources(c: ColumnMeta, lookups: Lookup[] = []): string[] {
  if (!c.derived) return [];
  if (c.derived.kind === "datepart") return [c.derived.source];
  if (c.derived.kind === "datecompose") return Object.values(c.derived.parts).filter((k): k is string => !!k);
  if (c.derived.kind === "lookup") {
    const id = c.derived.lookupId;
    const l = lookups.find((x) => x.id === id);
    return l ? lookupKeys(l).local : [];
  }
  try {
    return [...formulaRefs(parseFormula(c.derived.expr, (k) => k))];
  } catch {
    return [];
  }
}

// ---------- Master lookups ----------

/** Key columns of a lookup, accepting the single-key shape saved by older versions. */
export function lookupKeys(l: Lookup): { master: string[]; local: string[] } {
  if (l.masterKeys?.length && l.localKeys?.length) return { master: l.masterKeys, local: l.localKeys };
  return { master: l.masterKey ? [l.masterKey] : [], local: l.localKey ? [l.localKey] : [] };
}

/** Normalizes join keys so "001", "1" and full-width digits match. */
export function normalizeKey(v: RawCell | number | undefined): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  const s = v.normalize("NFKC").trim();
  if (s === "") return null;
  return /^-?\d+(\.0+)?$/.test(s) ? String(Number(s)) : s;
}

const SEP = "\u0001";

/** Composite key of each row in the dashboard data, from already-coerced column values. A blank part gives no key. */
export function rowKeys(cols: ColumnValues[], rowCount: number): (string | null)[] {
  const out: (string | null)[] = new Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    let key = "";
    for (let c = 0; c < cols.length; c++) {
      const col = cols[c];
      const v = col.values[i];
      const part = col.type === "date" ? dayKey(v as number) : typeof v === "number" ? (Number.isNaN(v) ? null : normalizeKey(v)) : normalizeKey(v);
      if (part === null) {
        key = "";
        break;
      }
      key += (c ? SEP : "") + part;
    }
    out[i] = key === "" ? null : key;
  }
  return out;
}

/** Dates match by calendar day, however they are written ("2025/10/01", "2025-10-01", Excel dates). */
function dayKey(t: number): string | null {
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Map from normalized master key to the master row (first occurrence wins).
 * `dateKeys[i]` marks key parts whose local column is a date, so master cells are read as dates.
 */
export function masterIndex(l: Lookup, dateKeys: boolean[] = []): Map<string, number> {
  const idx = lookupKeys(l).master.map((h) => l.table.headers.indexOf(h));
  const index = new Map<string, number>();
  if (idx.some((i) => i < 0)) return index;
  l.table.rows.forEach((r, i) => {
    const parts = idx.map((k, p) => (dateKeys[p] ? dayKey(parseDate(r[k] ?? null)) : normalizeKey(r[k] ?? null)));
    if (parts.some((p) => p === null)) return;
    const key = parts.join(SEP);
    if (!index.has(key)) index.set(key, i);
  });
  return index;
}

export interface MatchReport {
  matched: number;
  total: number;
  /** A few key values with no master row (composite parts joined by " / "). */
  unmatched: string[];
}

export function matchReport(keys: (string | null)[], index: Map<string, number>): MatchReport {
  let matched = 0;
  let total = 0;
  const unmatched = new Set<string>();
  for (const k of keys) {
    if (k === null) continue;
    total++;
    if (index.has(k)) matched++;
    else if (unmatched.size < 5) unmatched.add(k.split(SEP).join(" / "));
  }
  return { matched, total, unmatched: [...unmatched] };
}

/** One-line description of a calculated column for settings screens. */
export function describeDerived(c: ColumnMeta, columns: ColumnMeta[], lookups: Lookup[] = []): string {
  const d = c.derived;
  if (!d) return "";
  const label = (k: string) => columns.find((x) => x.key === k)?.label ?? k;
  if (d.kind === "formula") return `= ${displayFormula(d.expr, columns)}`;
  if (d.kind === "datepart") return `${label(d.source)}の${DATE_PART_LABEL[d.part]}`;
  if (d.kind === "datecompose") return `${Object.values(d.parts).filter((k): k is string => !!k).map(label).join(" + ")} から作った日付`;
  const id = d.lookupId;
  const l = lookups.find((x) => x.id === id);
  return l ? `「${l.fileName}」の${d.column}（${lookupKeys(l).local.map(label).join(" + ")}で結合）` : "結合したマスタが見つかりません";
}

// ---------- Dates from split columns ----------

/** Numeric value of a part column: numbers, digit labels ("08") or the year of a yearly date column. */
function partValue(col: ColumnValues, i: number): number {
  const v = col.values[i];
  if (col.type === "date") return Number.isNaN(v as number) ? NaN : new Date(v as number).getUTCFullYear();
  if (typeof v === "number") return v;
  return v === null ? NaN : Number(v.normalize("NFKC").trim());
}

/** Builds UTC timestamps from year / month / day / hour / minute columns. Invalid combinations become blank. */
export function composeDates(parts: DateParts, values: Map<string, ColumnValues>, rowCount: number): Float64Array {
  const get = (k: string | null) => {
    if (!k) return null;
    const col = values.get(k);
    if (!col) throw new FormulaError(`列「${k}」がデータにありません`);
    return col;
  };
  const [y, mo, d, h, mi] = [get(parts.year), get(parts.month), get(parts.day), get(parts.hour), get(parts.minute)];
  if (!y) throw new FormulaError("年の列を選んでください");
  const out = new Float64Array(rowCount);
  for (let i = 0; i < rowCount; i++) {
    const year = partValue(y, i);
    const month = mo ? partValue(mo, i) : 1;
    const day = d ? partValue(d, i) : 1;
    const hour = h ? partValue(h, i) : 0;
    const minute = mi ? partValue(mi, i) : 0;
    const t = Date.UTC(year, month - 1, day, hour, minute);
    const dt = new Date(t);
    const valid =
      Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) && dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day && hour >= 0 && hour < 24 && minute >= 0 && minute < 60;
    out[i] = valid ? t : NaN;
  }
  return out;
}

const PART_HINTS: Record<keyof DateParts, RegExp> = {
  year: /[(（]年[)）]$|^年$|year$/i,
  month: /[(（]月[)）]$|^月$|month$/i,
  day: /[(（]日[)）]$|^日$|day$/i,
  hour: /[(（]時[)）]$|^時$|hour$/i,
  minute: /[(（]分[)）]$|^分$|minute$/i,
};

/** Suggests part columns from headers such as 現在時刻(年) / 現在時刻(月) …, preferring one shared prefix. */
export function suggestDateParts(columns: ColumnMeta[]): DateParts | null {
  const years = columns.filter((c) => PART_HINTS.year.test(c.label));
  for (const y of years) {
    const prefix = y.label.replace(PART_HINTS.year, "");
    const find = (k: keyof DateParts) =>
      columns.find((c) => c.label.startsWith(prefix) && PART_HINTS[k].test(c.label) && c.key !== y.key)?.key ?? null;
    const parts = { year: y.key, month: find("month"), day: find("day"), hour: find("hour"), minute: find("minute") };
    if (parts.month) return parts;
  }
  return null;
}
