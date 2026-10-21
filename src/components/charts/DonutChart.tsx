import { useState } from "react";
import type { DonutSlice } from "../../core/aggregate";
import { useChartFont } from "../ThemeScope";
import { SeriesSwatch, TexOverlay } from "./Texture";
import { OTHER_COLOR, clampTooltip, textWidth, truncate, useWidth } from "./util";

interface Props {
  slices: DonutSlice[];
  total: number;
  format: (v: number) => string;
  /** Center total; defaults to `format` (tooltips keep `format`). */
  formatLabel?: (v: number) => string;
  /** Percent next to each legend entry; the tooltip always shows it. */
  showPercent: boolean;
  selected: string[];
  onToggle?: (label: string) => void;
  /** Caption of the center total. */
  totalLabel?: string;
}

const MAX_SIZE = 240;
const SIDE_MIN_WIDTH = 460;

const colorOf = (s: DonutSlice, i: number) => (s.isOther ? OTHER_COLOR : `var(--series-${(i % 8) + 1})`);

/** Annular sector from angle a0 to a1 (radians, clockwise from 12 o'clock). */
function sector(cx: number, cy: number, ro: number, ri: number, a0: number, a1: number): string {
  const pt = (r: number, a: number) => `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)}`;
  // A full turn cannot be one arc, so split it in halves.
  if (a1 - a0 >= Math.PI * 2 - 1e-6) {
    const m = a0 + Math.PI;
    return `M${pt(ro, a0)}A${ro},${ro} 0 1 1 ${pt(ro, m)}A${ro},${ro} 0 1 1 ${pt(ro, a0)}ZM${pt(ri, a0)}A${ri},${ri} 0 1 0 ${pt(ri, m)}A${ri},${ri} 0 1 0 ${pt(ri, a0)}Z`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${pt(ro, a0)}A${ro},${ro} 0 ${large} 1 ${pt(ro, a1)}L${pt(ri, a1)}A${ri},${ri} 0 ${large} 0 ${pt(ri, a0)}Z`;
}

export function DonutChart({ slices, total, format, formatLabel, showPercent, selected, onToggle, totalLabel = "合計" }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const fs = useChartFont();
  const [hover, setHover] = useState<number | null>(null);
  const side = width >= SIDE_MIN_WIDTH;
  const size = Math.max(0, Math.min(MAX_SIZE, side ? width * 0.45 : width));
  const cx = size / 2;
  const ro = Math.max(10, size / 2 - 4);
  const ri = ro * 0.62;
  const sel = new Set(selected);
  const pctOf = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const pctText = (v: number) => `${pctOf(v).toFixed(1)}%`;

  let acc = 0;
  const arcs = slices.map((s) => {
    const a0 = (acc / total) * Math.PI * 2;
    acc += s.value;
    return { a0, a1: (acc / total) * Math.PI * 2 };
  });
  const interactive = (s: DonutSlice) => !!onToggle && !s.isOther;
  const toggle = (s: DonutSlice) => interactive(s) && onToggle!(s.label);

  const totalText = (formatLabel ?? format)(total);
  const totalSize = Math.max(11, Math.min(26, (ri * 1.7) / Math.max(1, totalText.length * 0.6)));
  const legendW = side ? width - size - 24 : width;

  let tip: React.CSSProperties | null = null;
  if (hover !== null && arcs[hover]) {
    const mid = (arcs[hover].a0 + arcs[hover].a1) / 2;
    const px = cx + ((ro + ri) / 2) * Math.sin(mid);
    const py = cx - ((ro + ri) / 2) * Math.cos(mid);
    tip = { left: clampTooltip(px - 40 + (side ? 0 : (width - size) / 2), width), top: py + 12 };
  }

  return (
    <div className="chart donut" ref={ref} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <div className={`donut-layout${side ? " is-side" : ""}`}>
          <svg width={size} height={size} role="group" aria-label="ドーナツグラフ" style={{ flex: "none" }}>
            {slices.map((s, i) => {
              const d = sector(cx, cx, ro, ri, arcs[i].a0, arcs[i].a1);
              const dim = sel.size > 0 && !sel.has(s.label);
              const can = interactive(s);
              return (
                <g
                  key={s.label}
                  className={can ? "bar-hit donut-slice" : "donut-slice"}
                  role={can ? "button" : undefined}
                  tabIndex={can ? 0 : undefined}
                  aria-pressed={can ? sel.has(s.label) : undefined}
                  aria-label={`${s.label}: ${format(s.value)}（${pctText(s.value)}）`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  onClick={can ? () => toggle(s) : undefined}
                  onKeyDown={
                    can
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggle(s);
                          }
                        }
                      : undefined
                  }
                >
                  <path className={`slice-shape${dim ? " is-dim" : ""}`} d={d} fill={colorOf(s, i)} fillRule="evenodd" stroke="var(--surface)" strokeWidth={slices.length > 1 ? 2 : 0} />
                  {!s.isOther && <TexOverlay d={d} index={i} />}
                  <path className="bar-focus" d={d} fill="none" />
                </g>
              );
            })}
            <text x={cx} y={cx} textAnchor="middle" style={{ fontSize: totalSize, fontWeight: 600, fill: "var(--text-primary)" }}>
              {totalText}
            </text>
            <text x={cx} y={cx + totalSize * 0.5 + 12} textAnchor="middle" style={{ fill: "var(--text-secondary)" }}>
              {totalLabel}
            </text>
          </svg>
          <div className="legend donut-legend" role="list" aria-label="凡例">
            {slices.map((s, i) => (
              <span
                className={`legend-item${hover === i ? " is-active" : ""}`}
                role="listitem"
                key={s.label}
                onMouseEnter={() => setHover(i)}
              >
                <SeriesSwatch color={colorOf(s, i)} index={i} kind="fill" />
                <span className="legend-label">{truncate(s.label, Math.max(60, legendW - (showPercent ? textWidth("100.0%", fs) + 40 : 20)), fs)}</span>
                {showPercent && <span className="legend-pct">{pctText(s.value)}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
      {tip && hover !== null && (
        <div className="chart-tooltip" style={tip}>
          <div className="tt-title">{slices[hover].label}</div>
          <div className="tt-row">
            <span className="tt-label">値</span>
            <span className="tt-value">{format(slices[hover].value)}</span>
          </div>
          <div className="tt-row">
            <span className="tt-label">構成比</span>
            <span className="tt-value">{pctText(slices[hover].value)}</span>
          </div>
          {interactive(slices[hover]) && (
            <div className="tt-title" style={{ marginTop: 4 }}>
              {sel.has(slices[hover].label) ? "クリックで絞り込みを解除" : "クリックで絞り込み"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
