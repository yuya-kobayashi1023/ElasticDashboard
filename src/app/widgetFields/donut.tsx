import { isDimensionType } from "../../core/columnTypes";
import type { DonutWidget } from "../../core/types";
import { ColumnSelect, MeasureFields, type FieldProps } from "./shared";

export function DonutData({ widget, columns, set }: FieldProps<DonutWidget>) {
  return (
    <>
      <ColumnSelect label="分類する列" value={widget.dimension} columns={columns.filter((c) => isDimensionType(c.type))} onChange={(dimension) => set({ dimension })} />
      <MeasureFields measure={widget.measure} columns={columns} aggs={["count", "sum"]} onChange={(measure) => set({ measure })} />
      <label className="field">
        <span className="field-label">表示する項目数</span>
        <select className="select" value={widget.limit} onChange={(e) => set({ limit: Number(e.target.value) })}>
          {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              上位 {n} 件
            </option>
          ))}
        </select>
        <span className="field-hint">超えた分は「その他」にまとめます</span>
      </label>
    </>
  );
}

export function DonutDisplay({ widget, set }: FieldProps<DonutWidget>) {
  return (
    <>
      <label className="checkbox">
        <input type="checkbox" checked={widget.showPercent !== false} onChange={(e) => set({ showPercent: e.target.checked })} />
        凡例に構成比（%）を表示する
      </label>
      <span className="field-hint">中央には合計を表示します。色は配色の順に割り当てます</span>
    </>
  );
}
