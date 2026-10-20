import { useState } from "react";
import type { Bin } from "../../core/aggregate";
import { clampTooltip, linear, niceTicks, textWidth, useChartHeight, useWidth, vBarPath } from "./util";
import { useChartFont } from "../ThemeScope";

interface Props {
  bins: Bin[];
  formatX: (v: number) => string;
  height?: number;
  color?: string;
}

const M = { top: 10, right: 8, bottom: 28 };
const count = new Intl.NumberFormat("ja-JP");

export function Histogram({ bins, formatX, height: fixedHeight, color = "var(--series-1)" }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const fs = useChartFont();
  const autoHeight = useChartHeight(0.26, 180, 360);
  const height = fixedHeight ?? (width > 0 ? Math.min(autoHeight, Math.max(180, Math.round(width * 0.6))) : autoHeight);
  const [hover, setHover] = useState<number | null>(null);
  const ticks = niceTicks(0, Math.max(...bins.map((b) => b.count)), 4);
  const left = Math.max(...ticks.map((t) => textWidth(count.format(t), fs))) + 12;
  const innerW = Math.max(10, width - left - M.right);
  const plotH = height - M.top - M.bottom;
  const y = linear(0, ticks[ticks.length - 1], M.top + plotH, M.top);
  const band = innerW / bins.length;
  const labelEvery = Math.max(1, Math.ceil(bins.length / Math.max(2, Math.floor(innerW / 72))));

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`ヒストグラム。${bins.length} 区間。`}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? "base-line" : "grid-line"} x1={left} x2={left + innerW} y1={y(t)} y2={y(t)} />
              <text className="tick-num" x={left - 8} y={y(t)} dy="0.35em" textAnchor="end">
                {count.format(t)}
              </text>
            </g>
          ))}
          {bins.map((b, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={left + i * band} y={M.top} width={band} height={plotH} fill="transparent" />
              {/* 2px surface gap between touching columns */}
              <path d={vBarPath(left + i * band + 1, Math.max(1, band - 2), y(0), y(b.count))} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />
            </g>
          ))}
          {bins.map((b, i) =>
            i % labelEvery === 0 ? (
              <text key={`t${i}`} className="tick-num" x={left + i * band} y={height - 8} textAnchor={i === 0 ? "start" : "middle"}>
                {formatX(b.x0)}
              </text>
            ) : null,
          )}
        </svg>
      )}
      {hover !== null && bins[hover] && (
        <div className="chart-tooltip" style={{ left: clampTooltip(left + (hover + 0.5) * band, width), top: M.top }}>
          <div className="tt-title">
            {formatX(bins[hover].x0)} 〜 {formatX(bins[hover].x1)}
          </div>
          <div className="tt-row">
            <span className="tt-label">件数</span>
            <span className="tt-value">{count.format(bins[hover].count)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
