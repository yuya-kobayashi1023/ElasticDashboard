import { useEffect, useState } from "react";
import { aggsFor } from "../../core/columnTypes";
import { AGG_LABEL, TYPE_SHORT_LABEL } from "../../core/format";
import type { Agg, ColumnMeta, Frame, Measure, Widget } from "../../core/types";

export type SetWidget = (patch: Partial<Widget>, coalesce?: string) => void;

/** Props shared by the per-kind field groups. */
export interface FieldProps<W extends Widget = Widget> {
  widget: W;
  /** Dashboard columns present in the current data. */
  columns: ColumnMeta[];
  frame: Frame;
  set: SetWidget;
}

/** Marks the "several numeric columns" choice of the series select. */
export const SERIES_COLUMNS = "__series_columns";

export function ColumnSelect({ label, value, columns, onChange }: { label: string; value: string; columns: ColumnMeta[]; onChange: (key: string) => void }) {
  const known = columns.some((c) => c.key === value);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select className="select" value={known ? value : ""} onChange={(e) => onChange(e.target.value)}>
        {!known && <option value="">選択してください</option>}
        {columns.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}（{TYPE_SHORT_LABEL[c.type]}）{c.hidden ? " ・非表示" : ""}
          </option>
        ))}
      </select>
      {columns.length === 0 && <span className="field-error">該当する種類の列がありません。「列の設定」で種類を変更できます</span>}
    </label>
  );
}

const COLUMN_AGGS: Agg[] = ["sum", "avg", "min", "max", "distinct"];

export function MeasureFields({ measure, columns, onChange, aggs }: { measure: Measure; columns: ColumnMeta[]; onChange: (m: Measure) => void; /** Allowed aggregations; the others are shown disabled. Undefined = all. */ aggs?: Agg[] }) {
  // Columns a given aggregation makes sense for (a sum needs numbers, a distinct count takes anything).
  const poolFor = (agg: Agg) => columns.filter((c) => aggsFor(c.type).includes(agg));
  const candidates = poolFor(measure.agg);
  const setAgg = (agg: Agg) => {
    if (agg === "count") return onChange({ agg, column: null });
    const pool = poolFor(agg);
    const column = pool.some((c) => c.key === measure.column) ? measure.column : (pool.find((c) => !c.idLike) ?? pool[0])?.key ?? null;
    onChange({ agg, column });
  };
  return (
    <div className="field-row">
      <label className="field">
        <span className="field-label">集計方法</span>
        <select className="select" value={measure.agg} onChange={(e) => setAgg(e.target.value as Agg)}>
          <option value="count" disabled={!!aggs && !aggs.includes("count")}>
            {AGG_LABEL.count}（行数）
          </option>
          {COLUMN_AGGS.map((a) => (
            <option key={a} value={a} disabled={poolFor(a).length === 0 || (!!aggs && !aggs.includes(a))}>
              {AGG_LABEL[a]}
            </option>
          ))}
        </select>
        {aggs && <span className="field-hint">この表示では{aggs.map((a) => AGG_LABEL[a]).join("と")}のみ選べます（合算できない集計は割合が成り立たないため）</span>}
      </label>
      {measure.agg !== "count" && <ColumnSelect label="集計する列" value={measure.column ?? ""} columns={candidates} onChange={(column) => onChange({ ...measure, column })} />}
    </div>
  );
}

function parse(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Number field that keeps what is being typed ("1." or "-") while the stored value is a plain number or null. */
export function NumberInput({ label, value, onChange, placeholder }: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setText((prev) => (parse(prev) === (value ?? null) ? prev : value == null ? "" : String(value)));
  }, [value]);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="input"
        inputMode="decimal"
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          const t = e.target.value.trim();
          if (t === "") onChange(null);
          else if (parse(t) !== null) onChange(parse(t));
        }}
      />
    </label>
  );
}
