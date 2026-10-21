import { useEffect, useMemo, useState } from "react";
import { DATE_PART_LABEL, datePartOrder, displayFormula, FormulaError, suggestDateParts, toStoredFormula } from "../core/derive";
import { buildFrame } from "../core/frame";
import { formatDate, formatNumber } from "../core/format";
import { newId } from "../core/id";
import type { ColumnMeta, DatePart, DateParts, Derivation, RawTable } from "../core/types";
import { Dialog } from "./Dialog";
import { useApp } from "./store";

const PARTS: DatePart[] = ["year", "quarter", "month", "yearmonth", "weekday", "day", "hour", "minute"];
const COMPOSE_FIELDS: { key: keyof DateParts; label: string }[] = [
  { key: "year", label: "年" },
  { key: "month", label: "月" },
  { key: "day", label: "日" },
  { key: "hour", label: "時" },
  { key: "minute", label: "分" },
];
type Kind = "formula" | "datepart" | "datecompose";

interface Props {
  open: boolean;
  /** Column being edited, or null to add a new one. */
  editing: ColumnMeta | null;
  raw: RawTable;
  onClose: () => void;
}

export function DerivedDialog({ open, editing, raw, onClose }: Props) {
  const columns = useApp((s) => s.dashboard?.columns ?? []);
  const lookups = useApp((s) => s.dashboard?.lookups);
  const update = useApp((s) => s.update);
  const [kind, setKind] = useState<Kind>("formula");
  const [parts, setParts] = useState<DateParts>({ year: "", month: null, day: null, hour: null, minute: null });
  const [name, setName] = useState("");
  const [expr, setExpr] = useState("");
  const [source, setSource] = useState("");
  const [part, setPart] = useState<DatePart>("month");
  const [submitted, setSubmitted] = useState(false);

  // Columns a new column may refer to: everything defined before it.
  const others = columns.filter((c) => c.key !== editing?.key);
  const numeric = others.filter((c) => c.type === "number" || c.type === "duration");
  const dates = others.filter((c) => c.type === "date");
  // Time-of-day columns can only give hours and minutes.
  const timeCols = others.filter((c) => c.type === "time");
  const sources = part === "hour" || part === "minute" ? [...dates, ...timeCols] : dates;
  const partCandidates = others.filter((c) => c.type === "number" || c.type === "category" || (c.type === "date" && c.dateUnit === "year"));

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    const d = editing?.derived;
    setKind(d?.kind === "datepart" || d?.kind === "datecompose" ? d.kind : "formula");
    setParts(d?.kind === "datecompose" ? d.parts : (suggestDateParts(others) ?? { year: partCandidates[0]?.key ?? "", month: null, day: null, hour: null, minute: null }));
    setName(editing?.label ?? "");
    setExpr(d?.kind === "formula" ? displayFormula(d.expr, columns) : "");
    setSource(d?.kind === "datepart" ? d.source : (dates[0]?.key ?? timeCols[0]?.key ?? ""));
    setPart(d?.kind === "datepart" ? d.part : dates.length ? "month" : "hour");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const autoName = kind === "datepart" ? `${others.find((c) => c.key === source)?.label ?? ""}の${DATE_PART_LABEL[part]}` : kind === "datecompose" ? "日付" : "";
  const derivation = (): Derivation =>
    kind === "formula" ? { kind: "formula", expr: toStoredFormula(expr, others) } : kind === "datepart" ? { kind: "datepart", source, part } : { kind: "datecompose", parts };
  const resultType = kind === "formula" ? "number" : kind === "datepart" ? "category" : "date";
  const label = name.trim() || autoName;

  const preview = useMemo(() => {
    if (!open) return { error: null as string | null, samples: [] as string[] };
    try {
      const derived = derivation();
      const probe: ColumnMeta = {
        key: "__preview",
        label: "プレビュー",
        type: resultType,
        inferredType: "number",
        hidden: false,
        idLike: false,
        format: { prefix: "", suffix: "", decimals: null },
        derived,
      };
      const head = { headers: raw.headers, rows: raw.rows.slice(0, 200) };
      const frame = buildFrame(head, [...others, probe], lookups);
      const err = frame.errors.get("__preview");
      if (err) return { error: err.replace(/^計算列「プレビュー」を計算できません（(.*)）$/, "$1"), samples: [] };
      const col = frame.columns.get("__preview")!;
      const samples: string[] = [];
      for (let i = 0; i < Math.min(5, frame.rowCount); i++) {
        const v = col.values[i];
        samples.push(typeof v === "number" ? (Number.isNaN(v) ? "—" : resultType === "date" ? formatDate(v, "datetime") : formatNumber(v)) : (v ?? "—"));
      }
      return { error: null, samples };
    } catch (e) {
      return { error: e instanceof FormulaError ? e.message : "計算式を読み取れません", samples: [] };
    }
  }, [open, kind, expr, source, part, parts, raw, others, lookups]);

  const nameTaken = others.some((c) => c.label === label);
  const invalid = !label || nameTaken || !!preview.error || (kind === "formula" && !expr.trim());

  const save = () => {
    setSubmitted(true);
    if (invalid) return;
    const derived = derivation();
    const col: ColumnMeta = {
      key: editing?.key ?? `calc:${newId()}`,
      label,
      type: resultType,
      inferredType: resultType,
      hidden: editing?.hidden ?? false,
      idLike: false,
      format: editing?.format ?? { prefix: "", suffix: "", decimals: kind === "formula" ? null : null },
      derived,
      order: kind === "datepart" ? datePartOrder(part) : undefined,
    };
    update((d) => ({ ...d, columns: editing ? d.columns.map((c) => (c.key === editing.key ? col : c)) : [...d.columns, col] }));
    onClose();
  };

  const insert = (key: string) => {
    const c = others.find((x) => x.key === key);
    if (c) setExpr((e) => `${e}${e && !/[\s(+\-*/]$/.test(e) ? " " : ""}[${c.label}]`);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "計算列を編集" : "計算列を追加"}
      width={560}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            {editing ? "保存" : "追加"}
          </button>
        </>
      }
    >
      <div className="form-stack">
        <div className="field">
          <span className="field-label" id="derived-kind">
            作り方
          </span>
          <div className="segmented" role="group" aria-labelledby="derived-kind">
            <button type="button" aria-pressed={kind === "formula"} onClick={() => setKind("formula")}>
              計算式
            </button>
            <button type="button" aria-pressed={kind === "datepart"} onClick={() => setKind("datepart")} disabled={dates.length === 0 && timeCols.length === 0}>
              日付・時刻から取り出す
            </button>
            <button type="button" aria-pressed={kind === "datecompose"} onClick={() => setKind("datecompose")} disabled={partCandidates.length === 0}>
              年・月・日から作る
            </button>
          </div>
        </div>

        {kind === "formula" ? (
          <div className="field">
            <label className="field-label" htmlFor="derived-expr">
              計算式
            </label>
            <input
              id="derived-expr"
              className="input"
              style={{ fontFamily: "var(--font-mono)" }}
              value={expr}
              placeholder="[売上金額] / [数量]"
              onChange={(e) => setExpr(e.target.value)}
              aria-describedby="derived-expr-hint"
            />
            <span className="field-hint" id="derived-expr-hint">
              数値の列を [列名] で指定し、+ − × ÷（+ - * /）と括弧で計算します。0 で割った行は空欄になります
            </span>
            <select className="select select-sm" value="" onChange={(e) => insert(e.target.value)} aria-label="列を計算式に挿入">
              <option value="">列を挿入…</option>
              {numeric.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        ) : kind === "datecompose" ? (
          <div className="compose-grid">
            {COMPOSE_FIELDS.map((f) => (
              <label className="field" key={f.key}>
                <span className="field-label">{f.label}の列</span>
                <select
                  className="select"
                  value={parts[f.key] ?? ""}
                  onChange={(e) => setParts({ ...parts, [f.key]: e.target.value || (f.key === "year" ? "" : null) })}
                >
                  {f.key !== "year" && <option value="">使わない</option>}
                  {partCandidates.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        ) : (
          <div className="field-row">
            <label className="field">
              <span className="field-label">元の日付・時刻の列</span>
              <select className="select" value={source} onChange={(e) => setSource(e.target.value)}>
                {sources.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">取り出す内容</span>
              <select className="select" value={part} onChange={(e) => {
                  const next = e.target.value as DatePart;
                  setPart(next);
                  if (next !== "hour" && next !== "minute" && others.find((c) => c.key === source)?.type === "time") setSource(dates[0]?.key ?? "");
                }}>
                {PARTS.map((p) => (
                  <option key={p} value={p}>
                    {DATE_PART_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label className="field">
          <span className="field-label">列名</span>
          <input className="input" value={name} placeholder={autoName || "例: 客単価"} onChange={(e) => setName(e.target.value)} />
          {submitted && !label && <span className="field-error">列名を入力してください</span>}
          {nameTaken && <span className="field-error">同じ名前の列があります。別の名前にしてください</span>}
        </label>

        <div className="field">
          <span className="field-label">プレビュー（先頭 5 行）</span>
          {preview.error ? (
            <p className="field-error" role="alert">
              {preview.error}
            </p>
          ) : (
            <div className="preview-values">
              {preview.samples.map((v, i) => (
                <span key={i}>{v}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
