import { isDimensionType } from "../../core/columnTypes";
import { HEAT_UNIT_LABEL, TYPE_SHORT_LABEL } from "../../core/format";
import type { ColumnMeta, HeatAxis, HeatmapWidget, HeatUnit } from "../../core/types";
import { CommonDisplay } from "./display";
import { MeasureFields, type FieldProps } from "./shared";

const DATE_UNITS: HeatUnit[] = ["weekday", "hour", "month", "day"];

interface Option {
  value: string;
  label: string;
  axis: HeatAxis;
}

const encode = (a: HeatAxis) => JSON.stringify([a.column, a.unit ?? null]);

/** Category and yes/no columns as they are; date columns by 曜日 / 時 / 月 / 日; time columns by 時. */
function axisOptions(columns: ColumnMeta[]): Option[] {
  const out: Option[] = [];
  const add = (axis: HeatAxis, label: string) => out.push({ value: encode(axis), label, axis });
  for (const c of columns) {
    if (isDimensionType(c.type)) add({ column: c.key }, `${c.label}（${TYPE_SHORT_LABEL[c.type]}）`);
    else if (c.type === "date") for (const unit of DATE_UNITS) add({ column: c.key, unit }, `${c.label}の${HEAT_UNIT_LABEL[unit]}`);
    else if (c.type === "time") add({ column: c.key, unit: "hour" }, `${c.label}の${HEAT_UNIT_LABEL.hour}`);
  }
  return out;
}

function AxisSelect({ label, value, options, onChange }: { label: string; value: HeatAxis; options: Option[]; onChange: (a: HeatAxis) => void }) {
  const current = encode(value);
  const known = options.some((o) => o.value === current);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select
        className="select"
        value={known ? current : ""}
        onChange={(e) => {
          const o = options.find((x) => x.value === e.target.value);
          if (o) onChange(o.axis);
        }}
      >
        {!known && <option value="">選択してください</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {options.length === 0 && <span className="field-error">使える列がありません。分類・日付・時刻の列が必要です</span>}
    </label>
  );
}

export function HeatmapData({ widget, columns, set }: FieldProps<HeatmapWidget>) {
  const options = axisOptions(columns);
  return (
    <>
      <div className="field-row">
        <AxisSelect label="横軸" value={widget.x} options={options} onChange={(x) => set({ x })} />
        <AxisSelect label="縦軸" value={widget.y} options={options} onChange={(y) => set({ y })} />
      </div>
      <span className="field-hint">日付の列は曜日・時・月・日ごとに分けられます。例: 縦軸を注文日時の曜日、横軸を時にすると、曜日と時間帯ごとの傾向が分かります</span>
      <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
    </>
  );
}

export function HeatmapDisplay({ widget, set }: FieldProps<HeatmapWidget>) {
  return (
    <>
      <label className="checkbox">
        <input type="checkbox" checked={widget.axisTitles !== false} onChange={(e) => set({ axisTitles: e.target.checked })} />
        値の単位を表示する
      </label>
      <CommonDisplay widget={widget} set={set} />
    </>
  );
}
