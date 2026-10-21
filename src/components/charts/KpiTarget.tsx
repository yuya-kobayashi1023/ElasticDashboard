interface Props {
  value: number;
  target: number;
  format: (v: number) => string;
  color: string;
}

/** Achievement against a goal: "目標 1.2M に対して 85%" with a thin progress bar. */
export function KpiTarget({ value, target, format, color }: Props) {
  if (Number.isNaN(value) || !Number.isFinite(target) || target === 0) return null;
  const pct = (value / target) * 100;
  return (
    <div className="kpi-target">
      <div className="kpi-target-text">
        目標 {format(target)} に対して <strong>{pct.toFixed(pct >= 100 || Number.isInteger(pct) ? 0 : 1)}%</strong>
      </div>
      <div className="kpi-target-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(0, Math.min(100, pct)))} aria-label="目標の達成率">
        <span style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </div>
    </div>
  );
}
