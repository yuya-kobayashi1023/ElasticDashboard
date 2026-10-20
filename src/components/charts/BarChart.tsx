import { useState } from "react";
import type { Bar } from "../../core/aggregate";
import { OTHER_COLOR, clampTooltip, hBarPath, linear, textWidth, truncate, useWidth } from "./util";
import { useChartFont } from "../ThemeScope";

interface Props {
  bars: Bar[];
  format: (v: number) => string;
  /** Share of total is meaningful for sums and counts only. */
  showShare: boolean;
  selected: string[];
  onToggle?: (label: string) => void;
  color?: string;
}

const ROW = 32;
const BAR_H = 20;

export function BarChart({ bars, format, showShare, selected, onToggle, color = "var(--series-1)" }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const fs = useChartFont();
  const [hover, setHover] = useState<number | null>(null);
  const valid = bars.filter((b) => !Number.isNaN(b.value));
  const total = valid.reduce((a, b) => a + b.value, 0);
  const min = Math.min(0, ...valid.map((b) => b.value));
  const max = Math.max(0, ...valid.map((b) => b.value));
  const labelW = Math.min(Math.max(...bars.map((b) => textWidth(b.label, fs)), 40) + 8, width * 0.36);
  const valueW = Math.max(...bars.map((b) => textWidth(format(b.value), fs))) + 10;
  const plotL = labelW + 4;
  const plotR = Math.max(plotL + 20, width - valueW);
  const x = linear(min, max === min ? 1 : max, plotL, plotR);
  const height = bars.length * ROW;
  const sel = new Set(selected);

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
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
                onKeyDown={
                  interactive
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onToggle(b.label);
                        }
                      }
                    : undefined
                }
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
                <text className="value-label" x={(v >= 0 ? Math.max(x(v), x(0)) : x(0)) + 6} y={i * ROW + ROW / 2} dy="0.35em">
                  {valueText}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && bars[hover] && (
        <div className="chart-tooltip" style={{ left: clampTooltip(x(Math.max(0, bars[hover].value || 0)) - 40, width), top: hover * ROW + ROW }}>
          <div className="tt-title">{bars[hover].label}</div>
          <div className="tt-row">
            <span className="tt-label">値</span>
            <span className="tt-value">{format(bars[hover].value)}</span>
          </div>
          {showShare && total > 0 && (
            <div className="tt-row">
              <span className="tt-label">構成比</span>
              <span className="tt-value">{((bars[hover].value / total) * 100).toFixed(1)}%</span>
            </div>
          )}
          {onToggle && !bars[hover].isOther && (
            <div className="tt-title" style={{ marginTop: 4 }}>
              {sel.has(bars[hover].label) ? "クリックで絞り込みを解除" : "クリックで絞り込み"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
