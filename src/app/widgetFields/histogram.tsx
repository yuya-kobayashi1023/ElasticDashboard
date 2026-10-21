import { isContinuousType } from "../../core/columnTypes";
import type { HistogramWidget } from "../../core/types";
import { CommonDisplay } from "./display";
import { ColumnSelect, type FieldProps } from "./shared";

export function HistogramData({ widget, columns, set }: FieldProps<HistogramWidget>) {
  return <ColumnSelect label="数値の列" value={widget.column} columns={columns.filter((c) => isContinuousType(c.type))} onChange={(column) => set({ column })} />;
}

export function HistogramDisplay({ widget, set }: FieldProps<HistogramWidget>) {
  return (
    <>
      <label className="field">
        <span className="field-label">区間の数</span>
        <select className="select" value={widget.bins ?? ""} onChange={(e) => set({ bins: e.target.value ? Number(e.target.value) : null })}>
          <option value="">自動</option>
          {[10, 20, 30, 50].map((n) => (
            <option key={n} value={n}>
              {n} 区間
            </option>
          ))}
        </select>
      </label>
      <CommonDisplay widget={widget} set={set} />
    </>
  );
}
