import type { ReactNode } from "react";
import { widgetTitle } from "../core/format";
import type { Filter, Frame, Widget } from "../core/types";
import { WidgetBody } from "./WidgetBody";

interface Props {
  widget: Widget;
  frame: Frame;
  rows: Uint32Array;
  filters: Filter[];
  onToggleValue?: (column: string, value: string) => void;
  onFix?: () => void;
  /** Edit controls rendered in the header (app only). */
  actions?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  innerRef?: (el: HTMLElement | null) => void;
}

export function WidgetCard({ widget, frame, rows, filters, onToggleValue, onFix, actions, className = "", style, innerRef }: Props) {
  const title = widgetTitle(widget, frame.meta);
  return (
    <section ref={innerRef} className={`widget widget-${widget.kind} span-${widget.span} ${className}`} style={style} aria-label={title}>
      <header className="widget-head">
        <div className="widget-titles">
          <h2 className="widget-title">{title}</h2>
          {widget.subtitle?.trim() && <p className="widget-sub">{widget.subtitle}</p>}
        </div>
        {actions}
      </header>
      <WidgetBody widget={widget} frame={frame} rows={rows} filters={filters} onToggleValue={onToggleValue} onFix={onFix} />
    </section>
  );
}
