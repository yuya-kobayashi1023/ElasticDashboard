import { ArrowDownRightIcon, ArrowRightIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import type { PeriodComparison, ResolvedBucket } from "../../core/aggregate";
import { formatDate } from "../../core/format";
import { linear } from "./util";

const PREV_LABEL: Record<ResolvedBucket, string> = { second: "前秒比", minute: "前分比", hour: "前時間比", day: "前日比", week: "前週比", month: "前月比", quarter: "前四半期比", year: "前年比" };

interface Props {
  data: PeriodComparison;
  format: (v: number) => string;
  upIsGood: boolean;
  color: string;
}

export function KpiCompare({ data, format, upIsGood, color }: Props) {
  const { current, previous, spark } = data;
  const diff = current - previous;
  const comparable = !Number.isNaN(current) && !Number.isNaN(previous);
  const pct = comparable && previous !== 0 ? (diff / Math.abs(previous)) * 100 : null;
  const dir = !comparable || diff === 0 ? 0 : diff > 0 ? 1 : -1;
  const good = dir === 0 ? null : (dir > 0) === upIsGood;
  const Icon = dir > 0 ? ArrowUpRightIcon : dir < 0 ? ArrowDownRightIcon : ArrowRightIcon;
  const sign = diff > 0 ? "+" : diff < 0 ? "−" : "±";
  const deltaText = !comparable ? "前の期間のデータがありません" : pct !== null ? `${sign}${Math.abs(pct).toFixed(1)}%` : `${sign}${format(Math.abs(diff))}`;

  const W = 120;
  const H = 32;
  const vals = spark.filter((v) => !Number.isNaN(v));
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const sx = linear(0, Math.max(1, spark.length - 1), 2, W - 4);
  const sy = linear(lo, hi === lo ? lo + 1 : hi, H - 4, 4);
  let d = "";
  spark.forEach((v, i) => {
    if (!Number.isNaN(v)) d += `${d ? "L" : "M"}${sx(i)},${sy(v)}`;
  });

  return (
    <>
      <div className="kpi-value">{format(current)}</div>
      <div className="kpi-compare">
        <span className={`kpi-delta${good === null ? "" : good ? " is-good" : " is-bad"}`}>
          {comparable && <Icon size={14} weight="bold" aria-hidden />}
          {deltaText}
        </span>
        {comparable && <span className="muted">{PREV_LABEL[data.bucket]}</span>}
        {spark.length > 1 && (
          <svg className="sparkline" width={W} height={H} aria-hidden>
            <path d={d} fill="none" stroke="var(--other)" strokeWidth={1.5} strokeLinejoin="round" />
            {!Number.isNaN(current) && <circle cx={sx(spark.length - 1)} cy={sy(current)} r={3} fill={color} />}
          </svg>
        )}
      </div>
      <div className="kpi-meta">
        {formatDate(data.currentStart, data.bucket)}
        {data.partial ? "（期間の途中まで）" : ""}
      </div>
    </>
  );
}
