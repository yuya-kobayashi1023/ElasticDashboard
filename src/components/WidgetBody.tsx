import { WarningCircleIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import { aggregate, comparePeriods, donutSlices, filterRows, groupBy, heatmapGrid, histogram, measureIsValid, pivot, scatterPoints, timeSeries, timeSeriesColumns } from "../core/aggregate";
import { isContinuousType, isDimensionType } from "../core/columnTypes";
import { columnAxisTitle, columnLabel, formatMeasure, formatValue, HEAT_UNIT_LABEL, measureAxisTitle } from "../core/format";
import type { Filter, Frame, HeatAxis, Widget } from "../core/types";
import { BarChart } from "./charts/BarChart";
import { DonutChart } from "./charts/DonutChart";
import { GaugeChart } from "./charts/GaugeChart";
import { HeatmapChart } from "./charts/HeatmapChart";
import { Histogram } from "./charts/Histogram";
import { NoteBlock } from "./charts/NoteBlock";
import { KpiCompare } from "./charts/KpiCompare";
import { KpiTarget } from "./charts/KpiTarget";
import { PivotTable } from "./charts/PivotTable";
import { ScatterChart } from "./charts/ScatterChart";
import { TimeChart } from "./charts/TimeChart";
import { cumulative, movingAverage } from "../core/stats";
import { orderedTableKeys } from "../core/tableFilter";
import { DataTable } from "./DataTable";
import { useNumberStyle } from "./ThemeScope";

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
  const isNumber = (key: string) => {
    const t = frame.columns.get(key)?.type;
    return t !== undefined && isContinuousType(t);
  };
  const isCategory = (key: string) => {
    const t = frame.columns.get(key)?.type;
    return t !== undefined && isDimensionType(t);
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
      if (!["date", "time"].includes(frame.columns.get(w.dateColumn)!.type)) return "日付・時刻の列を選んでください";
      if (w.series?.length) {
        const bad = w.series.map(missing).find(Boolean);
        if (bad) return bad;
        return w.series.every(isNumber) ? null : "並べる列には数値の列を選んでください";
      }
      return missing(w.split) ?? missing(w.measure.column) ?? (measureIsValid(frame, w.measure) ? null : "集計方法が列の種類に合っていません");
    case "histogram":
      if (!w.column) return "数値の列がありません";
      if (missing(w.column)) return missing(w.column);
      return isNumber(w.column) ? null : "数値の列を選んでください";
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
    case "note":
      return null;
    case "donut":
      if (!w.dimension) return "分類に使う列を選んでください";
      if (missing(w.dimension)) return missing(w.dimension);
      if (!isCategory(w.dimension)) return "分類には分類（カテゴリ）の列を選んでください";
      if (w.measure.agg !== "count" && w.measure.agg !== "sum") return "ドーナツグラフの集計方法は合計か件数にしてください";
      return missing(w.measure.column) ?? (measureIsValid(frame, w.measure) ? null : badMeasure);
    case "heatmap": {
      const axisProblem = (a: HeatAxis, name: string) => {
        if (!a.column) return `${name}に使う列を選んでください`;
        if (missing(a.column)) return missing(a.column);
        const type = frame.columns.get(a.column)!.type;
        if (!a.unit) return isCategory(a.column) ? null : `${name}には分類の列か、日付・時刻の単位を選んでください`;
        if (type === "date") return null;
        return type === "time" && a.unit === "hour" ? null : `${name}の単位が列の種類に合っていません`;
      };
      return axisProblem(w.x, "横軸") ?? axisProblem(w.y, "縦軸") ?? missing(w.measure.column) ?? (measureIsValid(frame, w.measure) ? null : badMeasure);
    }
    case "gauge":
      if (!Number.isFinite(w.target)) return "目標値を入力してください";
      if (w.target <= (w.min ?? 0)) return "目標値は最小値より大きくしてください";
      return missing(w.measure.column) ?? (measureIsValid(frame, w.measure) ? null : badMeasure);
  }
}

export function WidgetBody({ widget: w, frame, rows, filters, onToggleValue, onFix }: Props) {
  const problem = widgetProblem(w, frame);
  const numberStyle = useNumberStyle();
  const content = useMemo(() => {
    if (problem) return null;
    const nf = w.numberFormat;
    const fmt = (m: Parameters<typeof formatMeasure>[1]) => (v: number) => formatMeasure(v, m, frame.meta, "full", nf);
    const fmtAxis = (m: Parameters<typeof formatMeasure>[1]) => (v: number) => formatMeasure(v, m, frame.meta, "compact", nf);
    // In-chart labels use the compact number style; durations stay in full ("1時間23分") because compact would round them.
    const isDuration = (m: Parameters<typeof formatMeasure>[1]) => !!m.column && m.agg !== "count" && m.agg !== "distinct" && frame.meta.get(m.column)?.type === "duration";
    const fmtLabel = (m: Parameters<typeof formatMeasure>[1]) => (isDuration(m) ? fmt(m) : fmtAxis(m));
    const titles = w.axisTitles !== false;
    const color = `var(--series-${(w.color ?? 0) + 1})`;
    const additive = (m: { agg: string }) => m.agg === "count" || m.agg === "sum";
    switch (w.kind) {
      case "kpi": {
        if (w.compare) {
          const cmp = comparePeriods(frame, rows, w.measure, w.compare.dateColumn, w.compare.bucket);
          if (!cmp) return <Empty />;
          return (
            <>
              <KpiCompare data={cmp} format={fmt(w.measure)} upIsGood={w.compare.upIsGood} color={color} showSparkline={w.showSparkline !== false} />
              {typeof w.target === "number" && <KpiTarget value={cmp.current} target={w.target} format={fmt(w.measure)} color={color} />}
            </>
          );
        }
        const v = aggregate(frame, rows, w.measure);
        const big = Math.abs(v) >= 1e8;
        return (
          <>
            <div className="kpi-value">{formatMeasure(v, w.measure, frame.meta, big ? "compact" : "full", nf)}</div>
            {typeof w.target === "number" && <KpiTarget value={v} target={w.target} format={fmt(w.measure)} color={color} />}
          </>
        );
      }
      case "bar": {
        // A chart ignores the filter on its own dimension so other values stay selectable; selection is shown by emphasis.
        const filter = filters.find((f) => f.column === w.dimension && f.kind === "values");
        const own = filter && filter.kind === "values" && filter.values.length > 0 ? filterRows(frame, filters, filter.id) : rows;
        const { bars, sum } = groupBy(frame, own, w.dimension, w.measure, w.limit, w.sort, frame.meta.get(w.dimension)?.order, w.otherBucket !== false);
        if (bars.length === 0) return <Empty />;
        const sel = filter && filter.kind === "values" ? filter.values : [];
        return (
          <BarChart
            bars={bars}
            format={fmt(w.measure)}
            formatLabel={fmtLabel(w.measure)}
            showShare={w.showShare ?? additive(w.measure)}
            shareTotal={sum}
            orientation={w.orientation}
            showValues={w.showValues !== false}
            formatAxis={fmtAxis(w.measure)}
            selected={sel}
            color={color}
            valueTitle={titles ? measureAxisTitle(w.measure, frame.meta) : undefined}
            onToggle={onToggleValue && frame.columns.get(w.dimension)?.type !== "number" ? (label) => onToggleValue(w.dimension, label) : undefined}
          />
        );
      }
      case "time": {
        let data = w.series?.length
          ? timeSeriesColumns(frame, rows, w.dateColumn, w.bucket, w.measure.agg, w.series, (k) => columnLabel(frame.meta, k))
          : timeSeries(frame, rows, w.dateColumn, w.bucket, w.measure, w.split);
        if (data.buckets.length === 0) return <Empty />;
        const accumulate = !!w.cumulative && additive(w.measure);
        if (accumulate) data = { ...data, series: data.series.map((s) => ({ ...s, values: cumulative(s.values) })) };
        const trend =
          w.movingAverage && data.series.length === 1 ? { label: `${w.movingAverage}点移動平均`, values: movingAverage(data.series[0].values, w.movingAverage) } : undefined;
        const timeMeasure = w.series?.length ? { agg: w.measure.agg === "count" ? "sum" : w.measure.agg, column: w.series[0] } : w.measure;
        return (
          <TimeChart
            data={data}
            mark={w.mark}
            stackable={additive(w.measure)}
            format={fmt(timeMeasure)}
            formatAxis={fmtAxis(timeMeasure)}
            formatLabel={fmtLabel(timeMeasure)}
            yDuration={isDuration(timeMeasure)}
            yTitle={titles ? `${accumulate ? "累積 " : ""}${w.series?.length ? columnAxisTitle(frame.meta.get(w.series[0]), "") : measureAxisTitle(w.measure, frame.meta)}` : undefined}
            color={color}
            trend={trend}
            showPoints={w.showPoints}
            yFromZero={w.yFromZero}
            showValues={w.showValues !== false}
          />
        );
      }
      case "histogram": {
        const bins = histogram(frame, rows, w.column, w.bins);
        if (bins.length === 0) return <Empty />;
        const meta = frame.meta.get(w.column);
        return <Histogram bins={bins} formatX={(v) => formatValue(v, meta, "compact", w.numberFormat)} xTitle={titles ? columnAxisTitle(meta, w.column) : undefined} color={color} />;
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
            formatX={(v) => formatValue(v, xm, "compact", nf)}
            formatY={(v) => formatValue(v, ym, "compact", nf)}
            xLabel={titles ? columnAxisTitle(xm, w.x) : (xm?.label ?? w.x)}
            yLabel={titles ? columnAxisTitle(ym, w.y) : (ym?.label ?? w.y)}
            xDuration={xm?.type === "duration"}
            yDuration={ym?.type === "duration"}
            color={color}
            pointSize={w.pointSize}
            trendLine={w.trendLine}
          />
        );
      }
      case "pivot": {
        const data = pivot(frame, rows, w.rows, w.cols, w.measure, w.rowLimit, w.colLimit);
        if (data.rowLabels.length === 0) return <Empty />;
        return (
          <PivotTable
            data={data}
            rowLabel={columnLabel(frame.meta, w.rows)}
            colLabel={columnLabel(frame.meta, w.cols)}
            format={fmt(w.measure)}
            showTotals={w.showTotals ?? (additive(w.measure) || w.measure.agg === "min" || w.measure.agg === "max" || w.measure.agg === "avg")}
            color={color}
            heatmap={w.heatmap !== false}
          />
        );
      }
      case "donut": {
        // Like the bar chart, ignore the filter on its own dimension so other slices stay selectable.
        const filter = filters.find((f) => f.column === w.dimension && f.kind === "values");
        const own = filter && filter.kind === "values" && filter.values.length > 0 ? filterRows(frame, filters, filter.id) : rows;
        const { slices, total } = donutSlices(frame, own, w.dimension, w.measure, w.limit);
        if (slices.length === 0) return <Empty />;
        return (
          <DonutChart
            slices={slices}
            total={total}
            format={fmt(w.measure)}
            formatLabel={fmtLabel(w.measure)}
            showPercent={w.showPercent !== false}
            selected={filter && filter.kind === "values" ? filter.values : []}
            onToggle={onToggleValue && frame.columns.get(w.dimension)?.type !== "number" ? (label) => onToggleValue(w.dimension, label) : undefined}
          />
        );
      }
      case "heatmap": {
        const data = heatmapGrid(frame, rows, w.x, w.y, w.measure);
        if (data.xLabels.length === 0 || data.yLabels.length === 0 || data.cells.every((r) => r.every((v) => v === null))) return <Empty />;
        const axisName = (a: HeatAxis) => (a.unit ? HEAT_UNIT_LABEL[a.unit] : columnLabel(frame.meta, a.column));
        return <HeatmapChart data={data} format={fmt(w.measure)} formatLabel={fmtLabel(w.measure)} xName={axisName(w.x)} yName={axisName(w.y)} color={color} valueTitle={titles ? measureAxisTitle(w.measure, frame.meta) : undefined} />;
      }
      case "note":
        return <NoteBlock text={w.text} />;
      case "gauge":
        return <GaugeChart value={aggregate(frame, rows, w.measure)} target={w.target} min={w.min ?? 0} format={fmt(w.measure)} formatLabel={fmtLabel(w.measure)} color={color} />;
      case "table": {
        const avail = [...frame.meta.values()].filter((c) => !c.hidden && frame.columns.has(c.key)).map((c) => c.key);
        const shown = w.columns ? new Set(w.columns) : null;
        const cols = orderedTableKeys(w, avail)
          .filter((k) => !shown || shown.has(k))
          .map((k) => frame.meta.get(k)!);
        return (
          <DataTable
            frame={frame}
            rows={rows}
            columns={cols}
            pageSize={w.pageSize}
            initialSort={w.sort ?? null}
            filterRow={w.filterRow !== false}
            rowNumbers={!!w.rowNumbers}
            wrap={!!w.wrap}
            noneSelected={!!w.columns && w.columns.length === 0}
          />
        );
      }
    }
  }, [w, frame, rows, filters, onToggleValue, problem, numberStyle]);

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
