import { useState } from "react";
import type { Bar } from "../../core/aggregate";
import { OTHER_COLOR, clampTooltip, hBarPath, linear, niceTicks, textWidth, truncate, useChartHeight, useWidth, vBarPath } from "./util";
import { useChartFont } from "../ThemeScope";

interface Props {
  bars: Bar[];
  format: (v: number) => string;
  /** Share of total is meaningful for sums and counts only. */
  showShare: boolean;
  selected: string[];
  onToggle?: (label: string) => void;
  color?: string;
  /** Caption saying what the bar length means, with unit. */
  valueTitle?: string;
  /** undefined = horizontal */
  orientation?: "horizontal" | "vertical";
  /** Value labels at the bar ends; undefined = shown. */
  showValues?: boolean;
  /** Denominator for the share; defaults to the sum of the shown bars (differs when the rest is not shown). */
  shareTotal?: number;
  /** Tick labels of the vertical value axis; defaults to `format`. */
  formatAxis?: (v: number) => string;
}

const ROW = 32;
const BAR_H = 20;

export function BarChart(props: Props) {
  return props.orientation === "vertical" ? <ColumnChart {...props} /> : <HBarChart {...props} />;
}

function barKeyDown(toggle: (() => void) | undefined) {
  return toggle
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }
    : undefined;
}

function BarTooltip({ bar, format, share, selected, interactive, style }: { bar: Bar; format: (v: number) => string; share: number | null; selected: boolean; interactive: boolean; style: React.CSSProperties }) {
  return (
    <div className="chart-tooltip" style={style}>
      <div className="tt-title">{bar.label}</div>
      <div className="tt-row">
        <span className="tt-label">値</span>
        <span className="tt-value">{format(bar.value)}</span>
      </div>
      {share !== null && (
        <div className="tt-row">
          <span className="tt-label">構成比</span>
          <span className="tt-value">{share.toFixed(1)}%</span>
        </div>
      )}
      {interactive && (
        <div className="tt-title" style={{ marginTop: 4 }}>
          {selected ? "クリックで絞り込みを解除" : "クリックで絞り込み"}
        </div>
      )}
    </div>
  );
}

function HBarChart({ bars, format, showShare, shareTotal, selected, onToggle, color = "var(--series-1)", valueTitle, showValues = true }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const fs = useChartFont();
  const [hover, setHover] = useState<number | null>(null);
  const valid = bars.filter((b) => !Number.isNaN(b.value));
  const total = shareTotal ?? valid.reduce((a, b) => a + b.value, 0);
  const min = Math.min(0, ...valid.map((b) => b.value));
  const max = Math.max(0, ...valid.map((b) => b.value));
  const labelW = Math.min(Math.max(...bars.map((b) => textWidth(b.label, fs)), 40) + 8, width * 0.36);
  const valueW = showValues ? Math.max(...bars.map((b) => textWidth(format(b.value), fs))) + 10 : 10;
  const plotL = labelW + 4;
  const plotR = Math.max(plotL + 20, width - valueW);
  const x = linear(min, max === min ? 1 : max, plotL, plotR);
  const height = bars.length * ROW;
  const sel = new Set(selected);

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      {valueTitle && <div className="axis-title">{valueTitle}</div>}
      {width > 0 && (
        <svg width={width} height={height} role="group" aria-label="棒グラフ">
          <line className="base-line" x1={x(0)} x2={x(0)} y1={0} y2={height} />
          {bars.map((b, i) => {
            const y = i * ROW + (ROW - BAR_H) / 2;
            const v = Number.isNaN(b.value) ? 0 : b.value;
            const dim = sel.size > 0 && !sel.has(b.label);
            const interactive = onToggle && !b.isOther;
            const valueText = format(b.value);
            return (
              <g
                key={b.label}
                className={interactive ? "bar-hit" : undefined}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-pressed={interactive ? sel.has(b.label) : undefined}
                aria-label={`${b.label}: ${valueText}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={interactive ? () => onToggle(b.label) : undefined}
                onKeyDown={barKeyDown(interactive ? () => onToggle(b.label) : undefined)}
              >
                <rect x={0} y={i * ROW} width={width} height={ROW} fill="transparent" />
                <rect className="bar-focus" x={1} y={i * ROW + 1} width={width - 2} height={ROW - 2} rx={6} fill="none" />
                <text x={labelW} y={i * ROW + ROW / 2} dy="0.35em" textAnchor="end">
                  {truncate(b.label, labelW - 8, fs)}
                </text>
                <path
                  d={hBarPath(x(0), x(v), y, BAR_H)}
                  fill={b.isOther ? OTHER_COLOR : color}
                  className={dim ? "is-dim" : undefined}
                />
                {showValues && (
                  <text className="value-label" x={(v >= 0 ? Math.max(x(v), x(0)) : x(0)) + 6} y={i * ROW + ROW / 2} dy="0.35em">
                    {valueText}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && bars[hover] && (
        <BarTooltip
          bar={bars[hover]}
          format={format}
          share={showShare && total > 0 ? (bars[hover].value / total) * 100 : null}
          selected={sel.has(bars[hover].label)}
          interactive={!!onToggle && !bars[hover].isOther}
          style={{ left: clampTooltip(x(Math.max(0, bars[hover].value || 0)) - 40, width), top: hover * ROW + ROW }}
        />
      )}
    </div>
  );
}

const TICK_LABEL_W = 84;

/** Vertical bars: labels run along the bottom and are tilted and truncated when they do not fit. */
function ColumnChart({ bars, format, formatAxis, showShare, shareTotal, selected, onToggle, color = "var(--series-1)", valueTitle, showValues = true }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const fs = useChartFont();
  const auto = useChartHeight(0.3, 200, 340);
  const height = width > 0 ? Math.min(auto, Math.max(200, Math.round(width * 0.55))) : auto;
  const [hover, setHover] = useState<number | null>(null);
  const valid = bars.filter((b) => !Number.isNaN(b.value));
  const total = shareTotal ?? valid.reduce((a, b) => a + b.value, 0);
  const fmtAxis = formatAxis ?? format;
  const ticks = niceTicks(Math.min(0, ...valid.map((b) => b.value)), Math.max(0, ...valid.map((b) => b.value)), 4);
  const left = Math.max(...ticks.map((t) => textWidth(fmtAxis(t), fs))) + 12;
  const innerW = Math.max(10, width - left - 8);
  const band = innerW / Math.max(1, bars.length);
  const tilt = Math.max(...bars.map((b) => textWidth(b.label, fs))) + 4 > band;
  const labelH = tilt ? Math.round(TICK_LABEL_W * 0.6) + 14 : 24;
  const valueTexts = bars.map((b) => format(b.value));
  const labelsFit = showValues && Math.max(...valueTexts.map((t) => textWidth(t, fs))) + 4 <= band;
  const top = labelsFit ? 22 : 10;
  const plotH = Math.max(40, height - top - labelH);
  const y = linear(ticks[0], ticks[ticks.length - 1], top + plotH, top);
  const bw = Math.max(1, Math.min(48, band * 0.7));
  const xc = (i: number) => left + band * (i + 0.5);
  const sel = new Set(selected);

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      {valueTitle && <div className="axis-title">{valueTitle}</div>}
      {width > 0 && (
        <svg width={width} height={top + plotH + labelH} role="group" aria-label="棒グラフ">
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? "base-line" : "grid-line"} x1={left} x2={left + innerW} y1={y(t)} y2={y(t)} />
              <text className="tick-num" x={left - 8} y={y(t)} dy="0.35em" textAnchor="end">
                {fmtAxis(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const v = Number.isNaN(b.value) ? 0 : b.value;
            const dim = sel.size > 0 && !sel.has(b.label);
            const interactive = onToggle && !b.isOther;
            const labelY = top + plotH + 14;
            return (
              <g
                key={b.label}
                className={interactive ? "bar-hit" : undefined}
                role={interactive ? "button" : undefined}
                tabIndex={interactive ? 0 : undefined}
                aria-pressed={interactive ? sel.has(b.label) : undefined}
                aria-label={`${b.label}: ${valueTexts[i]}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={interactive ? () => onToggle(b.label) : undefined}
                onKeyDown={barKeyDown(interactive ? () => onToggle(b.label) : undefined)}
              >
                <rect x={left + band * i} y={0} width={band} height={top + plotH + labelH} fill="transparent" />
                <rect className="bar-focus" x={left + band * i + 1} y={1} width={band - 2} height={top + plotH + labelH - 2} rx={6} fill="none" />
                <path d={vBarPath(xc(i) - bw / 2, bw, y(0), y(v))} fill={b.isOther ? OTHER_COLOR : color} className={dim ? "is-dim" : undefined} />
                {labelsFit && (
                  <text className="value-label" x={xc(i)} y={v >= 0 ? y(v) - 6 : y(v) + 14} textAnchor="middle">
                    {valueTexts[i]}
                  </text>
                )}
                {tilt ? (
                  <text x={xc(i) + 4} y={labelY} textAnchor="end" transform={`rotate(-35 ${xc(i) + 4} ${labelY})`}>
                    {truncate(b.label, TICK_LABEL_W, fs)}
                  </text>
                ) : (
                  <text x={xc(i)} y={labelY} textAnchor="middle">
                    {truncate(b.label, band - 4, fs)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && bars[hover] && (
        <BarTooltip
          bar={bars[hover]}
          format={format}
          share={showShare && total > 0 ? (bars[hover].value / total) * 100 : null}
          selected={sel.has(bars[hover].label)}
          interactive={!!onToggle && !bars[hover].isOther}
          style={{ left: clampTooltip(xc(hover) - 40, width), top: Math.max(0, y(Math.max(0, bars[hover].value || 0)) - 10) }}
        />
      )}
    </div>
  );
}
