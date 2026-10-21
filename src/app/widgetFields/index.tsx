import { BarData, BarDisplay } from "./bar";
import { DonutData, DonutDisplay } from "./donut";
import { GaugeData, GaugeDisplay } from "./gauge";
import { HeatmapData, HeatmapDisplay } from "./heatmap";
import { HistogramData, HistogramDisplay } from "./histogram";
import { KpiData, KpiDisplay } from "./kpi";
import { NoteData } from "./note";
import { PivotData, PivotDisplay } from "./pivot";
import { ScatterData, ScatterDisplay } from "./scatter";
import type { FieldProps } from "./shared";
import { TableData, TableDisplay } from "./table";
import { TimeData, TimeDisplay } from "./time";

export { BasicFields } from "./BasicFields";
export { hasNumberFormat, NumberFormatFields } from "./numberFormat";
export { Section } from "./Section";
export type { SetWidget } from "./shared";

/** Fields of the データ section: which columns and how they are aggregated. */
export function DataFields({ widget, ...rest }: FieldProps) {
  switch (widget.kind) {
    case "kpi":
      return <KpiData widget={widget} {...rest} />;
    case "bar":
      return <BarData widget={widget} {...rest} />;
    case "time":
      return <TimeData widget={widget} {...rest} />;
    case "histogram":
      return <HistogramData widget={widget} {...rest} />;
    case "scatter":
      return <ScatterData widget={widget} {...rest} />;
    case "pivot":
      return <PivotData widget={widget} {...rest} />;
    case "table":
      return <TableData widget={widget} {...rest} />;
    case "donut":
      return <DonutData widget={widget} {...rest} />;
    case "heatmap":
      return <HeatmapData widget={widget} {...rest} />;
    case "gauge":
      return <GaugeData widget={widget} {...rest} />;
    case "note":
      return <NoteData widget={widget} {...rest} />;
  }
}

/** Fields of the 表示 section: how the data is drawn. */
export function DisplayFields({ widget, ...rest }: FieldProps) {
  switch (widget.kind) {
    case "kpi":
      return <KpiDisplay widget={widget} {...rest} />;
    case "bar":
      return <BarDisplay widget={widget} {...rest} />;
    case "time":
      return <TimeDisplay widget={widget} {...rest} />;
    case "histogram":
      return <HistogramDisplay widget={widget} {...rest} />;
    case "scatter":
      return <ScatterDisplay widget={widget} {...rest} />;
    case "pivot":
      return <PivotDisplay widget={widget} {...rest} />;
    case "table":
      return <TableDisplay widget={widget} {...rest} />;
    case "donut":
      return <DonutDisplay widget={widget} {...rest} />;
    case "heatmap":
      return <HeatmapDisplay widget={widget} {...rest} />;
    case "gauge":
      return <GaugeDisplay widget={widget} {...rest} />;
    case "note":
      return null;
  }
}
