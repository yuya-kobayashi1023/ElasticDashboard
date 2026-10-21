import { formatValue } from "./format";
import { cellToString } from "./infer";
import { converterFor, textNormalizerFor } from "./parsers";
import type { ColumnMeta, RawTable } from "./types";

export interface ParsePreview {
  /** Up to `maxSamples` distinct non-blank raw values with their converted display. `ok` is false when conversion failed. */
  samples: { raw: string; shown: string; ok: boolean }[];
  /** Non-blank values in the checked rows that could not be converted. */
  invalid: number;
  /** Non-blank values checked. */
  checked: number;
}

/**
 * Shows what the current conversion options do to a column. Looks at no more than `limit` rows,
 * evenly spread over the table, so it stays cheap on very large data.
 */
export function previewParse(
  raw: RawTable,
  colIndex: number,
  meta: Pick<ColumnMeta, "type" | "parse" | "dateUnit" | "format">,
  limit = 2000,
  maxSamples = 5,
): ParsePreview {
  const out: ParsePreview = { samples: [], invalid: 0, checked: 0 };
  if (colIndex < 0) return out;
  const n = raw.rows.length;
  const step = n > limit ? n / limit : 1;
  const count = Math.min(n, limit);
  const float = meta.type !== "category" && meta.type !== "text";
  const convert = float ? converterFor(meta) : null;
  const normalize = float ? null : textNormalizerFor(meta);
  const full = { ...meta, key: "", label: "", inferredType: meta.type, hidden: false, idLike: false } as ColumnMeta;
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const cell = raw.rows[Math.floor(i * step)]?.[colIndex] ?? null;
    const text = cellToString(cell);
    if (text === null) continue;
    let shown: string;
    let ok = true;
    if (convert) {
      const v = convert(cell);
      ok = !Number.isNaN(v);
      shown = ok ? formatValue(v, full) : "変換できません";
    } else {
      const s = normalize!(cell);
      if (s === null) continue;
      shown = s;
    }
    out.checked++;
    if (!ok) out.invalid++;
    if (out.samples.length < maxSamples && !seen.has(text)) {
      seen.add(text);
      out.samples.push({ raw: text, shown, ok });
    }
  }
  return out;
}
