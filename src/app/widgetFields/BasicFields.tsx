import { ChartBarHorizontalIcon, ChartBarIcon, ChartLineIcon, ChartScatterIcon, GaugeIcon, GridNineIcon, TableIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { widgetTitle } from "../../core/format";
import type { ColumnMeta, Span, Widget, WidgetKind } from "../../core/types";
import type { SetWidget } from "./shared";

const KINDS: { kind: WidgetKind; label: string; icon: ReactNode }[] = [
  { kind: "kpi", label: "数値", icon: <GaugeIcon size={18} aria-hidden /> },
  { kind: "bar", label: "棒グラフ", icon: <ChartBarHorizontalIcon size={18} aria-hidden /> },
  { kind: "time", label: "推移", icon: <ChartLineIcon size={18} aria-hidden /> },
  { kind: "histogram", label: "分布", icon: <ChartBarIcon size={18} aria-hidden /> },
  { kind: "scatter", label: "散布図", icon: <ChartScatterIcon size={18} aria-hidden /> },
  { kind: "pivot", label: "クロス集計", icon: <GridNineIcon size={18} aria-hidden /> },
  { kind: "table", label: "表", icon: <TableIcon size={18} aria-hidden /> },
];

const SPANS: { span: Span; label: string }[] = [
  { span: 1, label: "1/4" },
  { span: 2, label: "1/2" },
  { span: 3, label: "3/4" },
  { span: 4, label: "全幅" },
];

interface Props {
  widget: Widget;
  columns: ColumnMeta[];
  set: SetWidget;
  onChangeKind: (kind: WidgetKind) => void;
}

export function BasicFields({ widget, columns, set, onChangeKind }: Props) {
  return (
    <>
      <div className="field">
        <span className="field-label" id="kind-label">
          種類
        </span>
        <div className="kind-grid" role="group" aria-labelledby="kind-label">
          {KINDS.map((k) => (
            <button type="button" key={k.kind} className="kind-option" aria-pressed={widget.kind === k.kind} onClick={() => onChangeKind(k.kind)}>
              {k.icon}
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="widget-title">
          タイトル
        </label>
        <input
          id="widget-title"
          aria-describedby="widget-title-hint"
          className="input"
          value={widget.title}
          placeholder={widgetTitle({ ...widget, title: "" }, columns)}
          onChange={(e) => set({ title: e.target.value }, `title:${widget.id}`)}
        />
        <span className="field-hint" id="widget-title-hint">
          空欄のときは設定内容から自動で付けます
        </span>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="widget-subtitle">
          説明文
        </label>
        <input
          id="widget-subtitle"
          className="input"
          value={widget.subtitle ?? ""}
          placeholder="例: 税込、返品を除く"
          onChange={(e) => set({ subtitle: e.target.value || undefined }, `subtitle:${widget.id}`)}
        />
      </div>

      <div className="field">
        <span className="field-label" id="span-label">
          幅
        </span>
        <div className="segmented" role="group" aria-labelledby="span-label">
          {SPANS.map((s) => (
            <button type="button" key={s.span} aria-pressed={widget.span === s.span} onClick={() => set({ span: s.span })}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
