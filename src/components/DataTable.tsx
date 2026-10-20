import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, CaretUpIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { formatDate, formatNumber } from "../core/format";
import type { ColumnMeta, Frame } from "../core/types";

interface Props {
  frame: Frame;
  rows: Uint32Array;
  columns: ColumnMeta[];
  pageSize: number;
}

const collator = new Intl.Collator("ja", { numeric: true });
const count = new Intl.NumberFormat("ja-JP");

export function DataTable({ frame, rows, columns, pageSize }: Props) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = frame.columns.get(sort.key);
    if (!col) return rows;
    const idx = Array.from(rows);
    if (col.type === "number" || col.type === "date") {
      const v = col.values;
      idx.sort((a, b) => {
        if (Number.isNaN(v[a])) return 1;
        if (Number.isNaN(v[b])) return -1;
        return (v[a] - v[b]) * sort.dir;
      });
    } else {
      const v = col.values;
      idx.sort((a, b) => {
        if (v[a] === null) return 1;
        if (v[b] === null) return -1;
        return collator.compare(v[a]!, v[b]!) * sort.dir;
      });
    }
    return idx;
  }, [frame, rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = Array.from(sorted.slice(current * pageSize, (current + 1) * pageSize));

  const cell = (c: ColumnMeta, i: number) => {
    const col = frame.columns.get(c.key);
    if (!col) return null;
    if (col.type === "number") return Number.isNaN(col.values[i]) ? null : formatNumber(col.values[i], c);
    if (col.type === "date") return Number.isNaN(col.values[i]) ? null : formatDate(col.values[i], c.dateUnit === "year" ? "year" : "datetime");
    return col.values[i];
  };

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  };

  if (columns.length === 0) return <div className="widget-state">表示する列がありません。列の設定で表示を切り替えてください。</div>;

  return (
    <>
      <div className="table-wrap table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => {
                const numeric = c.type === "number";
                const active = sort?.key === c.key;
                return (
                  <th key={c.key} className={numeric ? "num" : undefined} aria-sort={active ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button type="button" className="sort-btn" onClick={() => toggleSort(c.key)}>
                      {c.label}
                      {active && (sort!.dir === 1 ? <CaretUpIcon size={12} weight="bold" aria-hidden /> : <CaretDownIcon size={12} weight="bold" aria-hidden />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slice.map((i) => (
              <tr key={i}>
                {columns.map((c) => {
                  const v = cell(c, i);
                  return (
                    <td key={c.key} className={c.type === "number" ? "num" : undefined} title={v ?? undefined}>
                      {v ?? <span className="blank">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span>
          {sorted.length === 0
            ? "0 行"
            : `${count.format(current * pageSize + 1)}–${count.format(Math.min(sorted.length, (current + 1) * pageSize))} / ${count.format(sorted.length)} 行`}
        </span>
        <span className="pager-buttons">
          <button type="button" className="icon-btn" aria-label="前のページ" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <CaretLeftIcon size={16} />
          </button>
          <span aria-live="polite">
            {current + 1} / {pages}
          </span>
          <button type="button" className="icon-btn" aria-label="次のページ" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            <CaretRightIcon size={16} />
          </button>
        </span>
      </div>
    </>
  );
}
