import { isContinuousType } from "../../core/columnTypes";
import type { ScatterWidget } from "../../core/types";
import { CommonDisplay } from "./display";
import { ColumnSelect, type FieldProps } from "./shared";

export function ScatterData({ widget, columns, set }: FieldProps<ScatterWidget>) {
  return (
    <>
      <div className="field-row">
        <ColumnSelect label="横軸" value={widget.x} columns={columns.filter((c) => isContinuousType(c.type))} onChange={(x) => set({ x })} />
        <ColumnSelect label="縦軸" value={widget.y} columns={columns.filter((c) => isContinuousType(c.type))} onChange={(y) => set({ y })} />
      </div>
      <label className="field">
        <span className="field-label">色分けする列</span>
        <select className="select" value={widget.colorBy ?? ""} onChange={(e) => set({ colorBy: e.target.value || null })}>
          <option value="">色分けしない</option>
          {columns
            .filter((c) => c.type === "category" || c.type === "boolean")
            .map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
        </select>
        {widget.colorBy && <span className="field-hint">点が多い上位 3 分類を色分けし、残りは「その他」にまとめます</span>}
      </label>
    </>
  );
}

const SIZES: { size: NonNullable<ScatterWidget["pointSize"]>; label: string }[] = [
  { size: "s", label: "小" },
  { size: "m", label: "中" },
  { size: "l", label: "大" },
];

export function ScatterDisplay({ widget, set }: FieldProps<ScatterWidget>) {
  return (
    <>
      <div className="field">
        <span className="field-label" id="point-size-label">
          点の大きさ
        </span>
        <div className="segmented" role="group" aria-labelledby="point-size-label">
          {SIZES.map((s) => (
            <button type="button" key={s.size} aria-pressed={(widget.pointSize ?? "m") === s.size} onClick={() => set({ pointSize: s.size })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <label className="checkbox">
        <input type="checkbox" checked={!!widget.trendLine} onChange={(e) => set({ trendLine: e.target.checked })} />
        近似直線と相関係数を表示する
      </label>
      <CommonDisplay widget={widget} set={set} />
    </>
  );
}
