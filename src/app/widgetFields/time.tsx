import { ChartBarIcon, ChartLineIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { columnHasTime, extent, resolveBucketDetailed } from "../../core/aggregate";
import { isContinuousType } from "../../core/columnTypes";
import { BUCKET_LABEL } from "../../core/format";
import type { TimeBucket, TimeWidget } from "../../core/types";
import { CommonDisplay } from "./display";
import { ColumnSelect, MeasureFields, SERIES_COLUMNS, type FieldProps } from "./shared";

export function TimeData({ widget, columns, frame, set }: FieldProps<TimeWidget>) {
  const isTimeOfDay = frame.columns.get(widget.dateColumn)?.type === "time";
  // Sub-day units need a time part in the data; date-only columns are aggregated by day.
  const noTimePart = useMemo(() => !!widget.dateColumn && !columnHasTime(frame, widget.dateColumn), [frame, widget.dateColumn]);
  // Over the whole data (filters are not applied here), so the hint can differ slightly from the chart.
  const coarsened = useMemo(() => {
    if (widget.bucket === "auto" || !widget.dateColumn) return null;
    const ext = extent(frame, widget.dateColumn);
    if (!ext) return null;
    const k = isTimeOfDay ? 1000 : 1;
    const r = resolveBucketDetailed(isTimeOfDay && widget.bucket !== "second" && widget.bucket !== "minute" ? "hour" : widget.bucket, ext[0] * k, ext[1] * k, isTimeOfDay || !noTimePart);
    return r.requested ? r.bucket : null;
  }, [frame, widget.dateColumn, widget.bucket, isTimeOfDay, noTimePart]);
  return (
    <>
      <div className="field-row">
        <ColumnSelect
          label="日付・時刻の列"
          value={widget.dateColumn}
          columns={columns.filter((c) => c.type === "date" || c.type === "time")}
          onChange={(dateColumn) => set({ dateColumn, ...(columns.find((c) => c.key === dateColumn)?.type === "time" && !["auto", "minute", "second", "hour"].includes(widget.bucket) ? { bucket: "hour" } : {}) })}
        />
        <label className="field">
          <span className="field-label">集計の単位</span>
          <select className="select" value={widget.bucket} onChange={(e) => set({ bucket: e.target.value as TimeBucket })}>
            {(isTimeOfDay ? (["auto", "second", "minute", "hour"] as const) : (["auto", "second", "minute", "hour", "day", "week", "month", "quarter", "year"] as const)).map((b) => (
              <option key={b} value={b}>
                {BUCKET_LABEL[b]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {coarsened && <span className="field-hint">点が多すぎるため「{BUCKET_LABEL[coarsened]}」単位で表示します</span>}
      {noTimePart && ["second", "minute", "hour"].includes(widget.bucket) && <span className="field-hint">この列には時刻が含まれていないため、日単位で集計します</span>}
      <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
      <label className="field">
        <span className="field-label">系列</span>
        <select
          className="select"
          value={widget.series?.length ? SERIES_COLUMNS : (widget.split ?? "")}
          onChange={(e) => {
            const v = e.target.value;
            if (v === SERIES_COLUMNS) {
              const first = widget.measure.column ?? columns.find((c) => isContinuousType(c.type))?.key;
              set({ split: null, series: first ? [first] : [] });
            } else set({ split: v || null, series: null });
          }}
        >
          <option value="">分けない</option>
          <option value={SERIES_COLUMNS}>複数の数値列を並べる</option>
          {columns
            .filter((c) => c.type === "category" || c.type === "boolean")
            .map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
        </select>
        {widget.split && <span className="field-hint">上位 7 系列を表示し、残りは「その他」にまとめます</span>}
      </label>
      {!!widget.series && (
        <fieldset className="field fieldset">
          <legend className="field-label">並べる列（最大 8 列）</legend>
          <div className="check-list">
            {columns
              .filter((c) => isContinuousType(c.type))
              .map((c) => {
                const on = widget.series!.includes(c.key);
                return (
                  <label key={c.key} className="checkbox">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!on && widget.series!.length >= 8}
                      onChange={() => set({ series: on ? widget.series!.filter((k) => k !== c.key) : [...widget.series!, c.key] })}
                    />
                    {c.label}
                  </label>
                );
              })}
          </div>
          <span className="field-hint">集計方法は上の設定を使います。色で見分けられるのは 8 列までです</span>
        </fieldset>
      )}
    </>
  );
}

const AVERAGE_WINDOWS = [3, 7, 12];

export function TimeDisplay({ widget, set }: FieldProps<TimeWidget>) {
  const additive = widget.measure.agg === "count" || widget.measure.agg === "sum";
  const single = !widget.split && !widget.series?.length;
  const line = widget.mark === "line";
  return (
    <>
      <div className="field">
        <span className="field-label" id="mark-label">
          グラフの形
        </span>
        <div className="segmented" role="group" aria-labelledby="mark-label">
          <button type="button" aria-pressed={widget.mark === "line"} onClick={() => set({ mark: "line" })}>
            <ChartLineIcon size={16} aria-hidden />
            折れ線
          </button>
          <button type="button" aria-pressed={widget.mark === "column"} onClick={() => set({ mark: "column" })}>
            <ChartBarIcon size={16} aria-hidden />
            縦棒
          </button>
        </div>
        {widget.mark === "column" && widget.split && widget.measure.agg !== "sum" && widget.measure.agg !== "count" && (
          <span className="field-hint">平均などは積み上げられないため、系列ごとに並べて表示します</span>
        )}
      </div>
      {single && (
        <label className="field">
          <span className="field-label">移動平均の線</span>
          <select className="select" value={widget.movingAverage ?? ""} onChange={(e) => set({ movingAverage: e.target.value ? Number(e.target.value) : null })}>
            <option value="">なし</option>
            {AVERAGE_WINDOWS.map((n) => (
              <option key={n} value={n}>
                直近 {n} 点の平均
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="check-list">
        {additive && (
          <label className="checkbox">
            <input type="checkbox" checked={!!widget.cumulative} onChange={(e) => set({ cumulative: e.target.checked })} />
            累積で表示する
          </label>
        )}
        {line && (
          <label className="checkbox">
            <input type="checkbox" checked={!!widget.showPoints} onChange={(e) => set({ showPoints: e.target.checked })} />
            各点に印を付ける
          </label>
        )}
        {line && (
          <label className="checkbox">
            <input type="checkbox" checked={widget.yFromZero !== false} onChange={(e) => set({ yFromZero: e.target.checked })} />
            縦軸を 0 から始める
          </label>
        )}
        {single && line && (
          <label className="checkbox">
            <input type="checkbox" checked={widget.showValues !== false} onChange={(e) => set({ showValues: e.target.checked })} />
            最新の値を表示する
          </label>
        )}
      </div>
      <CommonDisplay widget={widget} set={set} />
    </>
  );
}
