import { isDimensionType } from "../../core/columnTypes";
import type { PivotWidget } from "../../core/types";
import { CommonDisplay } from "./display";
import { ColumnSelect, MeasureFields, type FieldProps } from "./shared";

export function PivotData({ widget, columns, set }: FieldProps<PivotWidget>) {
  return (
    <>
      <div className="field-row">
        <ColumnSelect label="行" value={widget.rows} columns={columns.filter((c) => isDimensionType(c.type))} onChange={(rows) => set({ rows })} />
        <ColumnSelect label="列" value={widget.cols} columns={columns.filter((c) => isDimensionType(c.type))} onChange={(cols) => set({ cols })} />
      </div>
      <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
      <div className="field-row">
        <label className="field">
          <span className="field-label">表示する行数</span>
          <select className="select" value={widget.rowLimit ?? 20} onChange={(e) => set({ rowLimit: Number(e.target.value) })}>
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                上位 {n} 件
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">表示する列数</span>
          <select className="select" value={widget.colLimit ?? 10} onChange={(e) => set({ colLimit: Number(e.target.value) })}>
            {[5, 10, 20].map((n) => (
              <option key={n} value={n}>
                上位 {n} 件
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="field-hint">超えた分は「その他」にまとめます</span>
    </>
  );
}

export function PivotDisplay({ widget, set }: FieldProps<PivotWidget>) {
  const m = widget.measure.agg;
  return (
    <>
      <div className="check-list">
        <label className="checkbox">
          <input type="checkbox" checked={widget.heatmap !== false} onChange={(e) => set({ heatmap: e.target.checked })} />
          値に応じて色を付ける
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={widget.showTotals ?? m !== "distinct"}
            onChange={(e) => set({ showTotals: e.target.checked })}
          />
          合計を表示する
        </label>
      </div>
      {widget.heatmap !== false && <CommonDisplay widget={widget} set={set} />}
    </>
  );
}
