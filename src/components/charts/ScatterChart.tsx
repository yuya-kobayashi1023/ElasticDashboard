import { useId, useState } from "react";
import type { ScatterPoint } from "../../core/aggregate";
import { linearRegression } from "../../core/stats";
import { useChartFont } from "../ThemeScope";
import { OTHER_COLOR, SERIES_COLORS, clampTooltip, linear, niceTicks, textWidth, useChartHeight, useWidth } from "./util";
import { markerPath, SeriesSwatch } from "./Texture";

interface Props {
  points: ScatterPoint[];
  groups: string[];
  formatX: (v: number) => string;
  formatY: (v: number) => string;
  xLabel: string;
  yLabel: string;
  color: string;
  /** undefined = "m" */
  pointSize?: "s" | "m" | "l";
  /** Least-squares line with the correlation coefficient in the corner. */
  trendLine?: boolean;
}

const RADIUS = { s: 3, m: 4, l: 6 };

const M = { top: 22, right: 12, bottom: 40 };

export function ScatterChart({ points, groups, formatX, formatY, xLabel, yLabel, color, pointSize = "m", trendLine }: Props) {
  const clipId = useId();
  const [ref, width] = useWidth<HTMLDivElement>();
  const fs = useChartFont();
  const auto = useChartHeight(0.32, 220, 420);
  const height = width > 0 ? Math.min(auto, Math.max(220, Math.round(width * 0.62))) : auto;
  const [hover, setHover] = useState<number | null>(null);

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  // Axes follow the data range: a scatter plot compares positions, not lengths from zero.
  const xt = niceTicks(x0, x1, 5);
  const yt = niceTicks(y0, y1, 5);
  const left = Math.max(...yt.map((t) => textWidth(formatY(t), fs))) + 12;
  const innerW = Math.max(10, width - left - M.right);
  const plotH = height - M.top - M.bottom;
  const x = linear(xt[0], xt[xt.length - 1], left, left + innerW);
  const y = linear(yt[0], yt[yt.length - 1], M.top + plotH, M.top);
  const reg = trendLine ? linearRegression(points.map((p) => p.x), points.map((p) => p.y)) : null;
  const colorOf = (g: number) => (groups.length === 0 ? color : g >= 3 ? OTHER_COLOR : SERIES_COLORS[g]);
  const labelEvery = Math.max(1, Math.ceil(xt.length / Math.max(2, Math.floor(innerW / 70))));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    let best = -1;
    let bestD = 16 * 16;
    points.forEach((p, i) => {
      const d = (x(p.x) - px) ** 2 + (y(p.y) - py) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    });
    setHover(best >= 0 ? best : null);
  };

  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="chart">
      {groups.length > 1 && (
        <div className="legend" role="list" aria-label="凡例">
          {groups.map((g, i) => (
            <span className="legend-item" role="listitem" key={g}>
              <SeriesSwatch color={colorOf(i)} index={i} kind="point" />
              {g}
            </span>
          ))}
        </div>
      )}
      <div ref={ref} style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={`散布図。横軸 ${xLabel}、縦軸 ${yLabel}、${points.length} 点。`} onMouseMove={onMove}>
            {yt.map((t) => (
              <g key={`y${t}`}>
                <line className={t === 0 ? "base-line" : "grid-line"} x1={left} x2={left + innerW} y1={y(t)} y2={y(t)} />
                <text className="tick-num" x={left - 8} y={y(t)} dy="0.35em" textAnchor="end">
                  {formatY(t)}
                </text>
              </g>
            ))}
            {xt.map((t, i) => (
              <g key={`x${t}`}>
                <line className={t === 0 ? "base-line" : "grid-line"} x1={x(t)} x2={x(t)} y1={M.top} y2={M.top + plotH} />
                {i % labelEvery === 0 && (
                  <text className="tick-num" x={x(t)} y={M.top + plotH + 16} textAnchor="middle">
                    {formatX(t)}
                  </text>
                )}
              </g>
            ))}
            <text x={left + innerW} y={height - 4} textAnchor="end">
              {xLabel}
            </text>
            <text x={left - 8} y={M.top - 10}>
              {yLabel}
            </text>
            {points.map((p, i) => (
              <path key={i} d={markerPath(x(p.x), y(p.y), RADIUS[pointSize], groups.length ? p.group : 0)} fill={colorOf(p.group)} fillOpacity={0.75} stroke="var(--surface)" strokeWidth={1} />
            ))}
            {reg && (
              <>
                <clipPath id={clipId}>
                  <rect x={left} y={M.top} width={innerW} height={plotH} />
                </clipPath>
                <line
                  clipPath={`url(#${clipId})`}
                  x1={x(x0)}
                  x2={x(x1)}
                  y1={y(reg.slope * x0 + reg.intercept)}
                  y2={y(reg.slope * x1 + reg.intercept)}
                  stroke="var(--text-primary)"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  opacity={0.7}
                  pointerEvents="none"
                />
                <text className="value-label" x={left + innerW - 4} y={M.top + 12} textAnchor="end">
                  相関係数 r = {reg.r.toFixed(2)}
                </text>
              </>
            )}
            {hp && <path d={markerPath(x(hp.x), y(hp.y), RADIUS[pointSize] + 2, groups.length ? hp.group : 0)} fill={colorOf(hp.group)} stroke="var(--surface)" strokeWidth={2} pointerEvents="none" />}
          </svg>
        )}
        {hp && (
          <div className="chart-tooltip" style={{ left: clampTooltip(x(hp.x), width), top: Math.max(0, y(hp.y) - 70) }}>
            {groups.length > 0 && <div className="tt-title">{groups[hp.group] ?? ""}</div>}
            <div className="tt-row">
              <span className="tt-label">{xLabel}</span>
              <span className="tt-value">{formatX(hp.x)}</span>
            </div>
            <div className="tt-row">
              <span className="tt-label">{yLabel}</span>
              <span className="tt-value">{formatY(hp.y)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
