import { useState } from "react";
import type { HeatmapResult } from "../../core/aggregate";
import { useChartFont } from "../ThemeScope";
import { clampTooltip, textWidth, truncate, useWidth } from "./util";

interface Props {
  data: HeatmapResult;
  format: (v: number) => string;
  /** Axis names for the tooltip and the screen reader text. */
  xName: string;
  yName: string;
  color: string;
  /** Caption saying what the shade means, with unit. */
  valueTitle?: string;
}

const CELL_H = 28;
const GAP = 2;

/** Sequential single-hue shade: light = small, dark = large. */
function shade(color: string, v: number, min: number, max: number): string {
  const p = max === min ? 55 : Math.round(8 + ((v - min) / (max - min)) * 82);
  return `color-mix(in oklab, ${color} ${p}%, var(--surface))`;
}

export function HeatmapChart({ data, format, xName, yName, color, valueTitle }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const fs = useChartFont();
  // Keyboard users get one tab stop and move between cells with the arrow keys.
  const [active, setActive] = useState<{ r: number; c: number } | null>(null);
  const [focused, setFocused] = useState(false);
  const { xLabels, yLabels, cells, min, max } = data;
  const nx = xLabels.length;
  const ny = yLabels.length;
  const left = Math.min(Math.max(...yLabels.map((l) => textWidth(l, fs)), 24) + 10, width * 0.3);
  const cw = Math.max(1, (width - left) / Math.max(1, nx));
  const top = 4;
  // Skip x labels when they do not fit side by side.
  const labelW = Math.max(...xLabels.map((l) => textWidth(l, fs)), 1) + 6;
  const every = Math.max(1, Math.ceil(labelW / cw));
  const plotH = ny * CELL_H;
  const height = top + plotH + fs + 14;

  const describe = (r: number, c: number) => {
    const v = cells[r][c];
    return `${yName} ${yLabels[r]}、${xName} ${xLabels[c]}: ${v === null ? "データなし" : format(v)}`;
  };
  const move = (dr: number, dc: number) =>
    setActive((a) => {
      const cur = a ?? { r: 0, c: 0 };
      return { r: Math.max(0, Math.min(ny - 1, cur.r + dr)), c: Math.max(0, Math.min(nx - 1, cur.c + dc)) };
    });
  const onKeyDown = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowRight") move(0, 1);
    else if (k === "ArrowLeft") move(0, -1);
    else if (k === "ArrowDown") move(1, 0);
    else if (k === "ArrowUp") move(-1, 0);
    else if (k === "Home") setActive((a) => ({ r: a?.r ?? 0, c: 0 }));
    else if (k === "End") setActive((a) => ({ r: a?.r ?? 0, c: nx - 1 }));
    else return;
    e.preventDefault();
  };
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const shown = hover ?? (focused ? active : null);

  return (
    <div className="chart heatmap" ref={ref} onMouseLeave={() => setHover(null)}>
      {valueTitle && <div className="axis-title">{valueTitle}</div>}
      {width > 0 && nx > 0 && ny > 0 && (
        <svg width={width} height={height} role="group" aria-label="ヒートマップ">
          <g
            tabIndex={0}
            role="application"
            aria-label={focused && active ? describe(active.r, active.c) : `ヒートマップ。矢印キーでセルを移動します`}
            className="heat-grid"
            onKeyDown={onKeyDown}
            onFocus={() => {
              setFocused(true);
              setActive((a) => a ?? { r: 0, c: 0 });
            }}
            onBlur={() => setFocused(false)}
          >
            {yLabels.map((l, r) => (
              <text key={`y${r}`} x={left - 8} y={top + r * CELL_H + CELL_H / 2} dy="0.35em" textAnchor="end">
                {truncate(l, left - 10, fs)}
              </text>
            ))}
            {xLabels.map((l, c) =>
              c % every === 0 ? (
                <text key={`x${c}`} x={left + cw * (c + 0.5)} y={top + plotH + fs + 4} textAnchor="middle">
                  {truncate(l, cw * every, fs)}
                </text>
              ) : null,
            )}
            {cells.map((row, r) =>
              row.map((v, c) => (
                <g key={`${r}-${c}`} onMouseEnter={() => setHover({ r, c })}>
                  <rect x={left + cw * c} y={top + r * CELL_H} width={cw} height={CELL_H} fill="transparent" />
                  {v !== null && (
                    <rect
                      x={left + cw * c + GAP / 2}
                      y={top + r * CELL_H + GAP / 2}
                      width={Math.max(1, cw - GAP)}
                      height={CELL_H - GAP}
                      rx={3}
                      style={{ fill: shade(color, v, min, max) }}
                    />
                  )}
                </g>
              )),
            )}
            {focused && active && (
              <rect
                className="heat-focus"
                x={left + cw * active.c + 1}
                y={top + active.r * CELL_H + 1}
                width={Math.max(1, cw - 2)}
                height={CELL_H - 2}
                rx={4}
                fill="none"
                stroke="var(--action)"
                strokeWidth={2}
                pointerEvents="none"
              />
            )}
          </g>
        </svg>
      )}
      {nx > 0 && ny > 0 && (
        <div className="heat-legend" aria-label="色の凡例">
          <span className="heat-legend-num">{format(min)}</span>
          <span className="heat-legend-bar" style={{ background: `linear-gradient(to right, ${shade(color, min, min, max + (max === min ? 1 : 0))}, ${shade(color, max, min, max)})` }} aria-hidden />
          <span className="heat-legend-num">{format(max)}</span>
        </div>
      )}
      {shown && cells[shown.r]?.[shown.c] !== undefined && (
        <div
          className="chart-tooltip"
          style={{ left: clampTooltip(left + cw * (shown.c + 0.5) - 40, width), top: top + (shown.r + 1) * CELL_H + (valueTitle ? 22 : 0) }}
        >
          <div className="tt-title">
            {yName} {yLabels[shown.r]} × {xName} {xLabels[shown.c]}
          </div>
          <div className="tt-row">
            <span className="tt-label">値</span>
            <span className="tt-value">{cells[shown.r][shown.c] === null ? "データなし" : format(cells[shown.r][shown.c]!)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
