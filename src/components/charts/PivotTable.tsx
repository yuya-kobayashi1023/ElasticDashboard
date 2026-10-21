import type { PivotResult } from "../../core/aggregate";

interface Props {
  data: PivotResult;
  rowLabel: string;
  colLabel: string;
  format: (v: number) => string;
  /** Totals are meaningful for additive measures only. */
  showTotals: boolean;
  color: string;
  /** Shade cells by value; undefined = on. */
  heatmap?: boolean;
}

/** Cross table with a single-hue sequential shade (darker = larger). Values stay in text, so color is never the only cue. */
export function PivotTable({ data, rowLabel, colLabel, format, showTotals, color, heatmap = true }: Props) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const row of data.cells) for (const v of row) {
    if (Number.isNaN(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const shade = (v: number) => {
    if (!heatmap || Number.isNaN(v) || hi === lo) return undefined;
    const p = Math.round(6 + ((v - lo) / (hi - lo)) * 49);
    return `color-mix(in oklab, ${color} ${p}%, var(--surface))`;
  };
  return (
    <div className="table-wrap table-scroll">
      <table className="data-table pivot-table">
        <thead>
          <tr>
            <th scope="col">
              {rowLabel} ＼ {colLabel}
            </th>
            {data.colLabels.map((c) => (
              <th key={c} scope="col" className="num">
                {c}
              </th>
            ))}
            {showTotals && (
              <th scope="col" className="num pivot-total">
                合計
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.rowLabels.map((r, ri) => (
            <tr key={r}>
              <th scope="row">{r}</th>
              {data.cells[ri].map((v, ci) => (
                <td key={ci} className="num" style={{ background: shade(v) }}>
                  {Number.isNaN(v) ? <span className="blank">—</span> : format(v)}
                </td>
              ))}
              {showTotals && <td className="num pivot-total">{format(data.rowTotals[ri])}</td>}
            </tr>
          ))}
        </tbody>
        {showTotals && (
          <tfoot>
            <tr>
              <th scope="row">合計</th>
              {data.colTotals.map((v, i) => (
                <td key={i} className="num pivot-total">
                  {format(v)}
                </td>
              ))}
              <td className="num pivot-total">{format(data.grand)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
