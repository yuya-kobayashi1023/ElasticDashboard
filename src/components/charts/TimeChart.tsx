import { useState } from "react";
import type { TimeSeriesResult } from "../../core/aggregate";
import { BUCKET_LABEL, formatDate, formatTick, tickLabels } from "../../core/format";
import { OTHER_COLOR, SERIES_COLORS, clampTooltip, linear, niceTicks, textWidth, truncate, useChartHeight, useWidth, vBarPath } from "./util";
import { SeriesSwatch, TexOverlay } from "./Texture";
import { useChartFont } from "../ThemeScope";

interface Props {
  data: TimeSeriesResult;
  mark: "line" | "column";
  /** Columns stack only when values are additive (sum / count). */
  stackable: boolean;
  format: (v: number) => string;
  formatAxis: (v: number) => string;
  /** In-chart value label (the latest value); defaults to `format`. */
  formatLabel?: (v: number) => string;
  /** The value axis is in seconds: ticks fall on round time steps. */
  yDuration?: boolean;
  /** Fixed height; follows the viewport height when omitted. */
  height?: number;
  /** Color for a single series. */
  color?: string;
  /** Value-axis title (measure and unit), drawn above the plot. */
  yTitle?: string;
  /** Moving average drawn as a dashed line (single series only). */
  trend?: { label: string; values: number[] };
  showPoints?: boolean;
  /** Lines start the value axis at 0; undefined = true. Columns always do. */
  yFromZero?: boolean;
  /** Label the last value of a single series; undefined = shown. */
  showValues?: boolean;
}

const M = { top: 10, right: 14, bottom: 28 };


export function TimeChart({ data, mark, stackable, format, formatAxis, formatLabel, yDuration, height: fixedHeight, color, yTitle, trend, showPoints, yFromZero, showValues = true }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const fs = useChartFont();
  const autoHeight = useChartHeight(0.32, 200, 440);
  // Keep a landscape aspect in narrow windows.
  const height = fixedHeight ?? (width > 0 ? Math.min(autoHeight, Math.max(200, Math.round(width * 0.45))) : autoHeight);
  const [hover, setHover] = useState<number | null>(null);
  const { buckets, series, bucket, timeOfDay, requestedBucket } = data;
  const seriesColor = (label: string, i: number): string =>
    label.startsWith("その他") ? OTHER_COLOR : series.length === 1 && color ? color : SERIES_COLORS[i % SERIES_COLORS.length];
  const n = buckets.length;
  const stacked = mark === "column" && stackable && series.length > 1;
  const useColumns = mark === "column" && (stackable || series.length === 1);

  // Value domain
  const fromZero = yFromZero !== false || useColumns;
  let lo = fromZero ? 0 : Infinity;
  let hi = fromZero ? 0 : -Infinity;
  for (const v of trend?.values ?? []) {
    if (Number.isNaN(v)) continue;
    hi = Math.max(hi, v);
    lo = Math.min(lo, v);
  }
  for (let b = 0; b < n; b++) {
    if (stacked) {
      let pos = 0;
      let neg = 0;
      for (const s of series) {
        const v = s.values[b];
        if (Number.isNaN(v)) continue;
        if (v >= 0) pos += v;
        else neg += v;
      }
      hi = Math.max(hi, pos);
      lo = Math.min(lo, neg);
    } else {
      for (const s of series) {
        const v = s.values[b];
        if (Number.isNaN(v)) continue;
        hi = Math.max(hi, v);
        lo = Math.min(lo, v);
      }
    }
  }
  if (lo === Infinity) lo = hi = 0;
  const ticks = niceTicks(lo, hi, 5, yDuration);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const left = Math.max(...ticks.map((t) => textWidth(formatAxis(t), fs))) + 12;
  const single = series.length === 1 && !useColumns;
  const showEnd = single && showValues;
  const endLabel = showEnd && n > 0 ? (formatLabel ?? format)(series[0].values[n - 1]) : "";
  const right = M.right + (showEnd ? textWidth(endLabel, fs) + 8 : 0);
  const innerW = Math.max(10, width - left - right);
  const top = M.top + (yTitle ? 16 : 0);
  const plotH = height - top - M.bottom;
  const y = linear(yMin, yMax, top + plotH, top);

  const band = innerW / Math.max(1, n);
  const xCenter = (i: number) => (useColumns ? left + band * (i + 0.5) : n === 1 ? left + innerW / 2 : left + (innerW * i) / (n - 1));
  const colW = Math.max(1, Math.min(24, band * (series.length > 1 && !stacked ? 0.8 / series.length : 0.7)));

  const subDay = bucket === "hour" || bucket === "minute" || bucket === "second";
  const multiDay = n > 1 && !timeOfDay && subDay && Math.floor(buckets[0] / 86400000) !== Math.floor(buckets[n - 1] / 86400000);
  const labelW = textWidth(formatTick(buckets[0] ?? 0, bucket, timeOfDay), fs) + (multiDay ? textWidth("12/31 ", fs) : 0);
  const maxLabels = Math.max(2, Math.floor(innerW / Math.max(56, labelW + 16)));
  const tickEvery = Math.max(1, Math.ceil(n / maxLabels));
  const tickIdx = buckets.map((_, i) => i).filter((i) => i % tickEvery === 0);
  const tickText = tickLabels(tickIdx.map((i) => buckets[i]), bucket, timeOfDay);

  const onMove = (clientX: number, rectLeft: number) => {
    if (n === 0) return;
    const px = clientX - rectLeft;
    const i = useColumns ? Math.floor((px - left) / band) : Math.round(((px - left) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const linePath = (values: number[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (Number.isNaN(v)) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${xCenter(i)},${y(v)}`;
      pen = true;
    });
    return d;
  };

  const hoverRows =
    hover === null
      ? []
      : series
          .map((s, i) => ({ label: s.label, value: s.values[hover], color: seriesColor(s.label, i), index: i }))
          .filter((r) => !Number.isNaN(r.value));
  const hoverTotal = hoverRows.reduce((a, r) => a + r.value, 0);

  return (
    <div className="chart">
      {series.length > 1 && (
        <div className="legend" role="list" aria-label="凡例">
          {series.map((s, i) => (
            <span className="legend-item" role="listitem" key={s.label}>
              <SeriesSwatch color={seriesColor(s.label, i)} index={i} kind={useColumns ? "fill" : "line"} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      {trend && series.length === 1 && (
        <div className="legend" role="list" aria-label="凡例">
          <span className="legend-item" role="listitem">
            <svg width={16} height={8} aria-hidden>
              <line x1={0} x2={16} y1={4} y2={4} stroke={seriesColor(series[0].label, 0)} strokeWidth={2} />
            </svg>
            {series[0].label === "" ? "実績" : series[0].label}
          </span>
          <span className="legend-item" role="listitem">
            <svg width={16} height={8} aria-hidden>
              <line x1={0} x2={16} y1={4} y2={4} stroke={seriesColor(series[0].label, 0)} strokeWidth={1.5} strokeDasharray="4 3" />
            </svg>
            {trend.label}
          </span>
        </div>
      )}
      <div ref={ref} style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg
            width={width}
            height={height}
            role="img"
            tabIndex={0}
            aria-label={`時系列グラフ。${n} 期間。左右の矢印キーで値を確認できます。`}
            onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect().left)}
            onFocus={() => setHover((h) => h ?? n - 1)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") setHover((h) => Math.min(n - 1, (h ?? -1) + 1));
              else if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? n) - 1));
              else return;
              e.preventDefault();
            }}
          >
            {yTitle && (
              <text className="axis-title-text" x={left - 8} y={M.top + 4} textAnchor="start">
                {truncate(yTitle, Math.max(40, width - left), fs)}
              </text>
            )}
            {ticks.map((t) => (
              <g key={t}>
                <line className={t === 0 ? "base-line" : "grid-line"} x1={left} x2={left + innerW} y1={y(t)} y2={y(t)} />
                <text className="tick-num" x={left - 8} y={y(t)} dy="0.35em" textAnchor="end">
                  {formatAxis(t)}
                </text>
              </g>
            ))}
            {tickIdx.map((i, k) => (
              <text key={buckets[i]} x={xCenter(i)} y={height - 8} textAnchor="middle">
                {tickText[k]}
              </text>
            ))}

            {useColumns &&
              buckets.map((_, b) => {
                if (stacked) {
                  let pos = 0;
                  let neg = 0;
                  const segs = series.map((s, si) => {
                    const v = s.values[b];
                    if (Number.isNaN(v) || v === 0) return null;
                    const base = v >= 0 ? pos : neg;
                    const top = base + v;
                    if (v >= 0) pos = top;
                    else neg = top;
                    const isTop = si === series.length - 1 || series.slice(si + 1).every((o) => Number.isNaN(o.values[b]) || o.values[b] === 0 || Math.sign(o.values[b]) !== Math.sign(v));
                    // 2px surface gap between stacked segments.
                    const y0 = y(base) - (base === 0 ? 0 : v >= 0 ? 1 : -1);
                    const y1 = y(top) + (isTop ? 0 : v >= 0 ? 1 : -1);
                    const d = vBarPath(xCenter(b) - colW / 2, colW, y0, y1, isTop);
                    return (
                      <g key={s.label}>
                        <path d={d} fill={seriesColor(s.label, si)} />
                        <TexOverlay d={d} index={si} />
                      </g>
                    );
                  });
                  return <g key={b}>{segs}</g>;
                }
                return (
                  <g key={b}>
                    {series.map((s, si) => {
                      const v = s.values[b];
                      if (Number.isNaN(v)) return null;
                      const offset = (si - (series.length - 1) / 2) * (colW + 2);
                      const d = vBarPath(xCenter(b) + offset - colW / 2, colW, y(0), y(v));
                      return (
                        <g key={s.label}>
                          <path d={d} fill={seriesColor(s.label, si)} />
                          {series.length > 1 && <TexOverlay d={d} index={si} />}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

            {!useColumns &&
              series.map((s, si) => (
                <g key={s.label}>
                  {single && (
                    <path
                      d={`${linePath(s.values)}L${xCenter(n - 1)},${y(Math.max(0, yMin))}L${xCenter(0)},${y(Math.max(0, yMin))}Z`}
                      fill={seriesColor(s.label, si)}
                      opacity={0.1}
                    />
                  )}
                  <path
                    className={series.length > 1 ? `series-line s-${si % 8}` : undefined}
                    d={linePath(s.values)}
                    fill="none"
                    stroke={seriesColor(s.label, si)}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </g>
              ))}

            {trend && (
              <path
                d={linePath(trend.values)}
                fill="none"
                stroke={seriesColor(series[0].label, 0)}
                strokeWidth={1.5}
                strokeDasharray="6 4"
                strokeLinecap="round"
                opacity={0.85}
              />
            )}

            {showPoints &&
              !useColumns &&
              series.map((s, si) =>
                s.values.map((v, i) =>
                  Number.isNaN(v) ? null : <circle key={`${s.label}-${i}`} cx={xCenter(i)} cy={y(v)} r={3} fill={seriesColor(s.label, si)} stroke="var(--surface)" strokeWidth={1.5} />,
                ),
              )}

            {single && n > 0 && !Number.isNaN(series[0].values[n - 1]) && (
              <g>
                <circle cx={xCenter(n - 1)} cy={y(series[0].values[n - 1])} r={4} fill={seriesColor(series[0].label, 0)} stroke="var(--surface)" strokeWidth={2} />
                {showEnd && <text className="value-label" x={xCenter(n - 1) + 8} y={y(series[0].values[n - 1])} dy="0.35em">
                  {endLabel}
                </text>}
              </g>
            )}

            {hover !== null && (
              <g pointerEvents="none">
                <line className="crosshair" x1={xCenter(hover)} x2={xCenter(hover)} y1={top} y2={top + plotH} />
                {!useColumns &&
                  series.map((s, si) =>
                    Number.isNaN(s.values[hover]) ? null : (
                      <circle key={s.label} cx={xCenter(hover)} cy={y(s.values[hover])} r={4.5} fill={seriesColor(s.label, si)} stroke="var(--surface)" strokeWidth={2} />
                    ),
                  )}
              </g>
            )}
          </svg>
        )}
        {hover !== null && buckets[hover] !== undefined && (
          <div className="chart-tooltip" style={{ left: clampTooltip(xCenter(hover), width), top }} role="status">
            <div className="tt-title">{formatDate(buckets[hover], bucket, timeOfDay)}</div>
            {hoverRows.length === 0 && <div className="muted">データなし</div>}
            {[...hoverRows]
              .sort((a, b) => b.value - a.value)
              .map((r) => (
                <div className="tt-row" key={r.label}>
                  {series.length > 1 && <SeriesSwatch color={r.color} index={r.index} kind={useColumns ? "fill" : "line"} />}
                  <span className="tt-label">{series.length > 1 ? r.label : "値"}</span>
                  <span className="tt-value">{format(r.value)}</span>
                </div>
              ))}
            {trend && hover !== null && !Number.isNaN(trend.values[hover]) && (
              <div className="tt-row">
                <span className="tt-label">{trend.label}</span>
                <span className="tt-value">{format(trend.values[hover])}</span>
              </div>
            )}
            {stacked && hoverRows.length > 1 && (
              <div className="tt-row" style={{ borderTop: "1px solid var(--border)", marginTop: 2, paddingTop: 2 }}>
                <span className="tt-label">合計</span>
                <span className="tt-value">{format(hoverTotal)}</span>
              </div>
            )}
          </div>
        )}
      </div>
      {requestedBucket && <div className="muted chart-note">点が多すぎるため「{BUCKET_LABEL[bucket]}」単位で表示しています</div>}
    </div>
  );
}
