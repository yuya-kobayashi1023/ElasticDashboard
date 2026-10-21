import { ChartBarHorizontalIcon, ChartBarIcon } from "@phosphor-icons/react";
import { isDimensionType } from "../../core/columnTypes";
import type { BarSort, BarWidget } from "../../core/types";
import { CommonDisplay } from "./display";
import { ColumnSelect, MeasureFields, type FieldProps } from "./shared";

export function BarData({ widget, columns, set }: FieldProps<BarWidget>) {
  return (
    <>
      <ColumnSelect
        label="分類する列"
        value={widget.dimension}
        columns={columns.filter((c) => isDimensionType(c.type))}
        onChange={(dimension) => set(columns.find((c) => c.key === dimension)?.order ? { dimension, sort: "label" } : { dimension })}
      />
      <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
      <div className="field-row">
        <label className="field">
          <span className="field-label">表示件数</span>
          <select className="select" value={widget.limit} onChange={(e) => set({ limit: Number(e.target.value) })}>
            {[5, 10, 15, 20, 30, 50].map((n) => (
              <option key={n} value={n}>
                上位 {n} 件
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">並び順</span>
          <select className="select" value={widget.sort} onChange={(e) => set({ sort: e.target.value as BarSort })}>
            <option value="value-desc">値が大きい順</option>
            <option value="value-asc">値が小さい順</option>
            <option value="label">名前順</option>
          </select>
        </label>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={widget.otherBucket !== false} onChange={(e) => set({ otherBucket: e.target.checked })} />
        表示件数を超えた分を「その他」にまとめる
      </label>
    </>
  );
}

export function BarDisplay({ widget, set }: FieldProps<BarWidget>) {
  const vertical = widget.orientation === "vertical";
  const additive = widget.measure.agg === "count" || widget.measure.agg === "sum";
  return (
    <>
      <div className="field">
        <span className="field-label" id="orientation-label">
          向き
        </span>
        <div className="segmented" role="group" aria-labelledby="orientation-label">
          <button type="button" aria-pressed={!vertical} onClick={() => set({ orientation: "horizontal" })}>
            <ChartBarHorizontalIcon size={16} aria-hidden />
            横棒
          </button>
          <button type="button" aria-pressed={vertical} onClick={() => set({ orientation: "vertical" })}>
            <ChartBarIcon size={16} aria-hidden />
            縦棒
          </button>
        </div>
      </div>
      <div className="check-list">
        <label className="checkbox">
          <input type="checkbox" checked={widget.showValues !== false} onChange={(e) => set({ showValues: e.target.checked })} />
          値を表示する
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={widget.showShare ?? additive} onChange={(e) => set({ showShare: e.target.checked })} />
          構成比を表示する
        </label>
      </div>
      <span className="field-hint">構成比はマウスを重ねたときに表示します。合計や件数以外では意味が変わるため、初期状態では表示しません</span>
      <CommonDisplay widget={widget} set={set} />
    </>
  );
}
