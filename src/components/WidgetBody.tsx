import { WarningCircleIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { aggregate, comparePeriods, filterRows, groupBy, histogram, measureIsValid, pivot, scatterPoints, timeSeries, timeSeriesColumns } from "../core/aggregate";
import { columnLabel, formatMeasure, formatNumber } from "../core/format";
import type { Filter, Frame, Widget } from "../core/types";
import { BarChart } from "./charts/BarChart";
import { Histogram } from "./charts/Histogram";
import { KpiCompare } from "./charts/KpiCompare";
import { PivotTable } from "./charts/PivotTable";
import { ScatterChart } from "./charts/ScatterChart";
import { TimeChart } from "./charts/TimeChart";
import { DataTable } from "./DataTable";

interface Props {
  widget: Widget;
  frame: Frame;
  rows: Uint32Array;
  filters: Filter[];
  onToggleValue?: (column: string, value: string) => void;
  /** Opens the widget settings (app only). */
  onFix?: () => void;
}

/** Explains why a widget cannot render, or null when its settings are valid. */
export function widgetProblem(w: Widget, frame: Frame): string | null {
  const missing = (key: string | null) => {
    if (!key || frame.columns.has(key)) return null;
    return frame.errors.get(key) ?? `「${columnLabel(frame.meta, key) || key}」列がデータにありません`;
  };
  const isNumber = (key: string) => frame.columns.get(key)?.type === "number";
  const isCategory = (key: string) => {
    const t = frame.columns.get(key)?.type;
    return t === "category" || t === "text";
  };
  const badMeasure = "集計方法が列の種類に合っていません";
  switch (w.kind) {
    case "kpi":
      if (w.compare) {
        if (missing(w.compare.dateColumn)) return missing(w.compare.dateColumn);
        if (frame.columns.get(w.compare.dateColumn)!.type !== "date") return "比較に使う日付の列を選んでください";
      }
      return missing(w.measure.column) ?? (measureIsValid(frame, w.measure) ? null : badMeasure);
    case "bar":
      if (!w.dimension) return "分類に使う列を選んでください";
      return missing(w.dimension) ?? missing(w.measure.column) ?? (measureIsValid(frame, w.measure) ? null : "集計方法が列の種類に合っていません");
    case "time":
      if (!w.dateColumn) return "日付の列がありません";
      if (missing(w.dateColumn)) return missing(w.dateColumn);
      if (frame.columns.get(w.dateColumn)!.type !== "date") return "日付の列を選んでください";
      if (w.series?.length) {
        const bad = w.series.map(missing).find(Boolean);
        if (bad) return bad;
        return w.series.every(isNumber) ? null : "並べる列には数値の列を選んでください";
      }
      return missing(w.split) ?? missing(w.measure.column) ?? (measureIsValid(frame, w.measure) ? null : "集計方法が列の種類に合っていません");
    case "histogram":
      if (!w.column) return "数値の列がありません";
      if (missing(w.column)) return missing(w.column);
      return frame.columns.get(w.column)!.type === "number" ? null : "数値の列を選んでください";
    case "scatter":
      if (!w.x || !w.y) return "数値の列が 2 つ必要です";
      if (missing(w.x) || missing(w.y)) return missing(w.x) ?? missing(w.y);
      if (!isNumber(w.x) || !isNumber(w.y)) return "横軸と縦軸には数値の列を選んでください";
      return missing(w.colorBy);
    case "pivot":
      if (!w.rows || !w.cols) return "行と列に使う分類の列を選んでください";
      if (missing(w.rows) || missing(w.cols)) return missing(w.rows) ?? missing(w.cols);
      if (!isCategory(w.rows) || !isCategory(w.cols)) return "行と列には分類（カテゴリ）の列を選んでください";
      return missing(w.measure.column) ?? (measureIsValid(frame, w.measure) ? null : badMeasure);
    case "table":
      return null;
  }
}

export function WidgetBody({ widget: w, frame, rows, filters, onToggleValue, onFix }: Props) {
  const problem = widgetProblem(w, frame);
  const content = useMemo(() => {
    if (problem) return null;
    const fmt = (m: Parameters<typeof formatMeasure>[1]) => (v: number) => formatMeasure(v, m, frame.meta);
    const fmtAxis = (m: Parameters<typeof formatMeasure>[1]) => (v: number) => formatMeasure(v, m, frame.meta, "compact");
    const color = `var(--series-${(w.color ?? 0) + 1})`;
    const additive = (m: { agg: string }) => m.agg === "count" || m.agg === "sum";
    switch (w.kind) {
      case "kpi": {
        if (w.compare) {
          const cmp = comparePeriods(frame, rows, w.measure, w.compare.dateColumn, w.compare.bucket);
          if (!cmp) return <Empty />;
          return <KpiCompare data={cmp} format={fmt(w.measure)} upIsGood={w.compare.upIsGood} color={color} />;
        }
        const v = aggregate(frame, rows, w.measure);
        const big = Math.abs(v) >= 1e8;
        return <div className="kpi-value">{formatMeasure(v, w.measure, frame.meta, big ? "compact" : "full")}</div>;
      }
      case "bar": {
        // A chart ignores the filter on its own dimension so other values stay selectable; selection is shown by emphasis.
        const filter = filters.find((f) => f.column === w.dimension && f.kind === "values");
        const own = filter && filter.kind === "values" && filter.values.length > 0 ? filterRows(frame, filters, filter.id) : rows;
        const { bars } = groupBy(frame, own, w.dimension, w.measure, w.limit, w.sort, frame.meta.get(w.dimension)?.order);
        if (bars.length === 0) return <Empty />;
        const sel = filter && filter.kind === "values" ? filter.values : [];
        return (
          <BarChart
            bars={bars}
            format={fmt(w.measure)}
            showShare={additive(w.measure)}
            selected={sel}
            color={color}
            onToggle={onToggleValue && frame.columns.get(w.dimension)?.type !== "number" ? (label) => onToggleValue(w.dimension, label) : undefined}
          />
        );
      }
      case "time": {
        const data = w.series?.length
          ? timeSeriesColumns(frame, rows, w.dateColumn, w.bucket, w.measure.agg, w.series, (k) => columnLabel(frame.meta, k))
          : timeSeries(frame, rows, w.dateColumn, w.bucket, w.measure, w.split);
        if (data.buckets.length === 0) return <Empty />;
        return (
          <TimeChart
            data={data}
            mark={w.mark}
            stackable={additive(w.measure)}
            format={fmt(w.series?.length ? { agg: w.measure.agg === "count" ? "sum" : w.measure.agg, column: w.series[0] } : w.measure)}
            formatAxis={fmtAxis(w.series?.length ? { agg: w.measure.agg === "count" ? "sum" : w.measure.agg, column: w.series[0] } : w.measure)}
            color={color}
          />
        );
      }
      case "histogram": {
        const bins = histogram(frame, rows, w.column);
        if (bins.length === 0) return <Empty />;
        const meta = frame.meta.get(w.column);
        return <Histogram bins={bins} formatX={(v) => formatNumber(v, meta, "compact")} color={color} />;
      }
      case "scatter": {
        const { points, groups } = scatterPoints(frame, rows, w.x, w.y, w.colorBy);
        if (points.length === 0) return <Empty />;
        const xm = frame.meta.get(w.x);
        const ym = frame.meta.get(w.y);
        return (
          <ScatterChart
            points={points}
            groups={groups}
            formatX={(v) => formatNumber(v, xm, "compact")}
            formatY={(v) => formatNumber(v, ym, "compact")}
            xLabel={xm?.label ?? w.x}
            yLabel={ym?.label ?? w.y}
            color={color}
          />
        );
      }
      case "pivot": {
        const data = pivot(frame, rows, w.rows, w.cols, w.measure);
        if (data.rowLabels.length === 0) return <Empty />;
        return (
          <PivotTable
            data={data}
            rowLabel={columnLabel(frame.meta, w.rows)}
            colLabel={columnLabel(frame.meta, w.cols)}
            format={fmt(w.measure)}
            showTotals={additive(w.measure) || w.measure.agg === "min" || w.measure.agg === "max" || w.measure.agg === "avg"}
            color={color}
          />
        );
      }
      case "table": {
        const cols = (w.columns ?? [...frame.meta.keys()]).map((k) => frame.meta.get(k)).filter((c) => c && !c.hidden && frame.columns.has(c.key));
        return <DataTable frame={frame} rows={rows} columns={cols as NonNullable<(typeof cols)[number]>[]} pageSize={w.pageSize} />;
      }
    }
  }, [w, frame, rows, filters, onToggleValue, problem]);

  if (problem) {
    return (
      <div className="widget-state" role="alert">
        <WarningCircleIcon size={24} aria-hidden />
        <span>{problem}</span>
        {onFix && (
          <button type="button" className="btn btn-sm" onClick={onFix}>
            設定を開く
          </button>
        )}
      </div>
    );
  }
  return content;
}

function Empty() {
  return <div className="widget-state">条件に一致するデータがありません</div>;
}
