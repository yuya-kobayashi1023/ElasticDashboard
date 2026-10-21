import { CaretDownIcon, CaretLeftIcon, CaretRightIcon, CaretUpIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isContinuousType, isFloatColumn } from "../core/columnTypes";
import { formatValue } from "../core/format";
import { applyColumnFilters, parseColumnFilter, type ColumnFilter } from "../core/tableFilter";
import type { ColumnMeta, Frame } from "../core/types";

type Sort = { key: string; dir: 1 | -1 } | null;

interface Props {
  frame: Frame;
  rows: Uint32Array;
  columns: ColumnMeta[];
  pageSize: number;
  initialSort?: Sort;
  filterRow?: boolean;
  rowNumbers?: boolean;
  wrap?: boolean;
  /** The widget itself has no column selected (as opposed to every column being hidden in the column settings). */
  noneSelected?: boolean;
}

const collator = new Intl.Collator("ja", { numeric: true });
const count = new Intl.NumberFormat("ja-JP");

export function DataTable({ frame, rows, columns, pageSize, initialSort = null, filterRow = true, rowNumbers = false, wrap = false, noneSelected = false }: Props) {
  const [sort, setSort] = useState<Sort>(initialSort);
  const [page, setPage] = useState(0);
  // Committed (debounced) filter text per column key, and a counter that remounts the inputs when cleared.
  const [filterText, setFilterText] = useState<Record<string, string>>({});
  const [clearGen, setClearGen] = useState(0);

  // The editor setting is only the default: follow it when it changes, otherwise keep the viewer's own clicks.
  const sortKey = initialSort ? `${initialSort.key}:${initialSort.dir}` : "";
  const lastSortKey = useRef(sortKey);
  useEffect(() => {
    if (lastSortKey.current === sortKey) return;
    lastSortKey.current = sortKey;
    setSort(initialSort);
    setPage(0);
  }, [sortKey, initialSort]);

  const compiled = useMemo(() => {
    const m = new Map<string, ColumnFilter>();
    if (!filterRow) return m;
    for (const c of columns) m.set(c.key, parseColumnFilter(filterText[c.key] ?? "", c.type));
    return m;
  }, [columns, filterText, filterRow]);
  const active = useMemo(() => [...compiled.values()].some((f) => f.kind !== "none" && f.kind !== "invalid"), [compiled]);

  const filtered = useMemo(() => applyColumnFilters(frame, rows, compiled), [frame, rows, compiled]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = frame.columns.get(sort.key);
    if (!col) return filtered;
    const idx = Array.from(filtered);
    const dir = sort.dir;
    // Blanks always go last, whichever direction is chosen.
    if (isFloatColumn(col)) {
      const v = col.values;
      idx.sort((a, b) => {
        const x = v[a];
        const y = v[b];
        const nx = Number.isNaN(x);
        const ny = Number.isNaN(y);
        if (nx || ny) return nx === ny ? 0 : nx ? 1 : -1;
        return (x - y) * dir;
      });
    } else {
      const v = col.values;
      idx.sort((a, b) => {
        const x = v[a];
        const y = v[b];
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
        return collator.compare(x, y) * dir;
      });
    }
    return idx;
  }, [frame, filtered, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const slice = Array.from(sorted.slice(current * pageSize, (current + 1) * pageSize));

  const cell = (c: ColumnMeta, i: number) => {
    const col = frame.columns.get(c.key);
    if (!col) return null;
    if (isFloatColumn(col)) return Number.isNaN(col.values[i]) ? null : formatValue(col.values[i], c);
    return col.values[i];
  };

  const toggleSort = (key: string) => {
    setPage(0);
    setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  };

  const commitFilter = (key: string, text: string) => {
    setPage(0);
    setFilterText((f) => (f[key] === text ? f : { ...f, [key]: text }));
  };
  const clearFilters = () => {
    setPage(0);
    setFilterText({});
    setClearGen((g) => g + 1);
  };

  if (columns.length === 0) {
    return <div className="widget-state">{noneSelected ? "表示する列が選ばれていません。ウィジェットの設定で列を選んでください。" : "表示する列がありません。列の設定で表示を切り替えてください。"}</div>;
  }

  return (
    <>
      <div className="table-wrap table-scroll">
        <table className={`data-table${wrap ? " is-wrap" : ""}`}>
          <thead>
            <tr>
              {rowNumbers && <th className="num row-no" scope="col" aria-label="行番号" />}
              {columns.map((c) => {
                const numeric = isContinuousType(c.type);
                const isActive = sort?.key === c.key;
                return (
                  <th key={c.key} className={numeric ? "num" : undefined} aria-sort={isActive ? (sort!.dir === 1 ? "ascending" : "descending") : "none"}>
                    <button type="button" className="sort-btn" onClick={() => toggleSort(c.key)}>
                      {c.label}
                      {isActive && (sort!.dir === 1 ? <CaretUpIcon size={12} weight="bold" aria-hidden /> : <CaretDownIcon size={12} weight="bold" aria-hidden />)}
                    </button>
                  </th>
                );
              })}
            </tr>
            {filterRow && (
              <tr className="filter-row">
                {rowNumbers && <td className="row-no" />}
                {columns.map((c) => (
                  <td key={c.key}>
                    <FilterInput
                      key={clearGen}
                      label={c.label}
                      type={c.type}
                      invalid={compiled.get(c.key)?.kind === "invalid"}
                      debounce={rows.length > 5000 ? 150 : 0}
                      onCommit={(text) => commitFilter(c.key, text)}
                    />
                  </td>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {slice.map((i, k) => (
              <tr key={i}>
                {rowNumbers && <td className="num row-no">{count.format(current * pageSize + k + 1)}</td>}
                {columns.map((c) => {
                  const v = cell(c, i);
                  return (
                    <td key={c.key} className={isContinuousType(c.type) ? "num" : undefined} title={v ?? undefined}>
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
          {active ? (
            <>
              {count.format(sorted.length)} / {count.format(rows.length)} 行{" "}
              <button type="button" className="link-btn" onClick={clearFilters}>
                絞り込みを解除
              </button>
            </>
          ) : sorted.length === 0 ? (
            "0 行"
          ) : (
            `${count.format(current * pageSize + 1)}–${count.format(Math.min(sorted.length, (current + 1) * pageSize))} / ${count.format(sorted.length)} 行`
          )}
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

function FilterInput({ label, type, invalid, debounce, onCommit }: { label: string; type: ColumnMeta["type"]; invalid: boolean; debounce: number; onCommit: (text: string) => void }) {
  const [text, setText] = useState("");
  const timer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const change = (value: string) => {
    setText(value);
    window.clearTimeout(timer.current);
    if (debounce === 0) onCommit(value);
    else timer.current = window.setTimeout(() => onCommit(value), debounce);
  };
  if (type === "boolean") {
    return (
      <select className="filter-input" value={text} aria-label={`${label}で絞り込み`} onChange={(e) => change(e.target.value)}>
        <option value="">すべて</option>
        <option value="true">はい</option>
        <option value="false">いいえ</option>
        <option value="blank">空欄</option>
      </select>
    );
  }
  const numeric = isContinuousType(type) || type === "date";
  return (
    <input
      type="text"
      className={`filter-input${numeric ? " num" : ""}`}
      value={text}
      placeholder={numeric ? ">100  1..5" : "含む"}
      aria-label={`${label}で絞り込み`}
      aria-invalid={invalid || undefined}
      title={invalid ? "式を解釈できません。例: >100、>=100、<5、100..200、=3" : undefined}
      onChange={(e) => change(e.target.value)}
    />
  );
}
