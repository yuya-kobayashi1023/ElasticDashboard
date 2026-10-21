import { useMemo } from "react";
import { columnHasTime } from "../../core/aggregate";
import type { CompareBucket, KpiWidget } from "../../core/types";
import { CommonDisplay } from "./display";
import { ColumnSelect, MeasureFields, NumberInput, type FieldProps } from "./shared";

const COMPARE_BUCKETS: [CompareBucket, string][] = [
  ["hour", "時"],
  ["day", "日"],
  ["week", "週"],
  ["month", "月"],
  ["quarter", "四半期"],
  ["year", "年"],
];

export function KpiData({ widget, columns, frame, set }: FieldProps<KpiWidget>) {
  const dates = columns.filter((c) => c.type === "date");
  const cmp = widget.compare ?? null;
  // Sub-day units need a time part in the data; date-only columns are aggregated by day.
  const noTimePart = useMemo(() => !!cmp && !columnHasTime(frame, cmp.dateColumn), [frame, cmp]);
  const onChange = (compare: KpiWidget["compare"]) => set({ compare });
  return (
    <>
      <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
      <fieldset className="field fieldset">
        <legend className="field-label">前の期間との比較</legend>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!cmp}
            disabled={dates.length === 0}
            onChange={(e) => onChange(e.target.checked ? { dateColumn: dates[0].key, bucket: "month", upIsGood: true } : null)}
          />
          最新の期間の値と、前の期間からの増減を表示する
        </label>
        {dates.length === 0 && <span className="field-hint">日付の列がないため使えません</span>}
        {cmp && (
          <>
            <div className="field-row" style={{ marginTop: 6 }}>
              <ColumnSelect label="日付の列" value={cmp.dateColumn} columns={dates} onChange={(dateColumn) => onChange({ ...cmp, dateColumn })} />
              <label className="field">
                <span className="field-label">期間の単位</span>
                <select className="select" value={cmp.bucket} onChange={(e) => onChange({ ...cmp, bucket: e.target.value as CompareBucket })}>
                  {COMPARE_BUCKETS.map(([b, l]) => (
                    <option key={b} value={b}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {noTimePart && cmp.bucket === "hour" && <span className="field-hint">この列には時刻が含まれていないため、日単位で集計します</span>}
            <label className="checkbox">
              <input type="checkbox" checked={cmp.upIsGood} onChange={(e) => onChange({ ...cmp, upIsGood: e.target.checked })} />
              増えるほど良い指標（オフにすると、減少を良い変化として色付けします）
            </label>
          </>
        )}
      </fieldset>
    </>
  );
}

export function KpiDisplay({ widget, set }: FieldProps<KpiWidget>) {
  return (
    <>
      <NumberInput
        label="目標値"
        value={widget.target}
        placeholder="例: 1200000"
        onChange={(target) => set({ target }, `target:${widget.id}`)}
      />
      <span className="field-hint">入力すると、達成率と進み具合のバーを値の下に表示します</span>
      {widget.compare && (
        <label className="checkbox">
          <input type="checkbox" checked={widget.showSparkline !== false} onChange={(e) => set({ showSparkline: e.target.checked })} />
          推移の小さなグラフを表示する
        </label>
      )}
      <CommonDisplay widget={widget} set={set} />
    </>
  );
}
