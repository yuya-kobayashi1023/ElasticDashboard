import { textWidth, useWidth } from "./util";
import { useChartFont } from "../ThemeScope";

interface Props {
  value: number;
  target: number;
  /** Value at the left end; the target is the right end. */
  min: number;
  format: (v: number) => string;
  color: string;
}

const STROKE = 18;

/** Point on the arc; `t` runs 0 (left end) to 1 (right end) along the upper half. */
function polar(cx: number, cy: number, r: number, t: number): [number, number] {
  const a = Math.PI * (1 - t);
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}

function arc(cx: number, cy: number, r: number, t0: number, t1: number): string {
  const [x0, y0] = polar(cx, cy, r, t0);
  const [x1, y1] = polar(cx, cy, r, t1);
  return `M${x0},${y0}A${r},${r} 0 0 1 ${x1},${y1}`;
}

/** Semicircle gauge: neutral track, the achieved part in the widget color, value and percent of target inside. */
export function GaugeChart({ value, target, min, format, color }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const fs = useChartFont();
  const span = target - min;
  const ratio = Number.isNaN(value) || span <= 0 ? 0 : (value - min) / span;
  const t = Math.max(0, Math.min(1, ratio));
  const pct = ratio * 100;
  const pctText = `${pct.toFixed(pct >= 100 || Number.isInteger(pct) ? 0 : 1)}%`;
  const size = Math.max(0, Math.min(width, 360));
  const r = Math.max(10, size / 2 - STROKE / 2 - 2);
  const cx = width / 2;
  const cy = r + STROKE / 2 + 2;
  const valueText = format(value);
  const bigSize = Math.max(14, Math.min(34, (r * 1.5) / Math.max(1, valueText.length * 0.6)));
  const height = cy + fs + 10;
  const label = `目標 ${format(target)} に対して ${pctText}（${valueText}）`;
  return (
    <div className="chart gauge" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="meter" aria-label={label} aria-valuemin={min} aria-valuemax={target} aria-valuenow={Number.isNaN(value) ? undefined : value} aria-valuetext={label}>
          <path d={arc(cx, cy, r, 0, 1)} fill="none" stroke="var(--border)" strokeWidth={STROKE} strokeLinecap="round" />
          {t > 0 && <path d={arc(cx, cy, r, 0, t)} fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />}
          <text x={cx} y={cy - r * 0.32} textAnchor="middle" style={{ fontSize: bigSize, fontWeight: 600, fill: "var(--text-primary)" }}>
            {valueText}
          </text>
          <text x={cx} y={cy - r * 0.32 + bigSize * 0.2 + 14} textAnchor="middle" style={{ fill: "var(--text-secondary)" }}>
            目標の {pctText}
          </text>
          {width > textWidth(format(min), fs) + textWidth(format(target), fs) + 40 && (
            <>
              <text className="tick-num" x={cx - r - STROKE / 2} y={cy + fs + 4} textAnchor="start">
                {format(min)}
              </text>
              <text className="tick-num" x={cx + r + STROKE / 2} y={cy + fs + 4} textAnchor="end">
                {format(target)}
              </text>
            </>
          )}
        </svg>
      )}
    </div>
  );
}
