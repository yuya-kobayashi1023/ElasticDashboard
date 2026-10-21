import { CaretDownIcon, FunnelSimpleIcon, MagnifyingGlassIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { extent, filterRows, valueCounts } from "../core/aggregate";
import { formatDate, formatValue } from "../core/format";
import { clearFilter, DATE_PRESETS, isFilterActive, presetRange } from "../core/filters";
import { newId } from "../core/id";
import type { ColumnMeta, DatePreset, Filter, Frame } from "../core/types";
import { Popover } from "./Popover";
import { TypeIcon } from "./TypeIcon";

interface Props {
  frame: Frame;
  filters: Filter[];
  filteredCount: number;
  onChange: (filters: Filter[]) => void;
}

const DAY = 86400000;
const count = new Intl.NumberFormat("ja-JP");

export const isActive = isFilterActive;

export function FilterBar({ frame, filters, filteredCount, onChange }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const shown = filters.filter((f) => frame.columns.has(f.column));
  const anyActive = shown.some(isActive);
  const replace = (f: Filter) => onChange(filters.map((x) => (x.id === f.id ? f : x)));

  const candidates = [...frame.meta.values()].filter(
    (c) => !c.hidden && c.type !== "text" && !filters.some((f) => f.column === c.key),
  );

  return (
    <div className="filter-bar" role="region" aria-label="フィルタ">
      <FunnelSimpleIcon size={18} className="muted" aria-hidden />
      {shown.map((f) => (
        <FilterChip
          key={f.id}
          filter={f}
          frame={frame}
          filters={filters}
          open={openId === f.id}
          setOpen={(o) => setOpenId(o ? f.id : null)}
          onChange={replace}
          onRemove={() => onChange(filters.filter((x) => x.id !== f.id))}
        />
      ))}
      <Popover
        open={openId === "__add"}
        onClose={() => setOpenId(null)}
        label="フィルタに使う列"
        width={260}
        trigger={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpenId(openId === "__add" ? null : "__add")} aria-expanded={openId === "__add"} disabled={candidates.length === 0}>
            <PlusIcon size={16} aria-hidden />
            フィルタを追加
          </button>
        }
      >
        <div className="popover-list" style={{ margin: 0 }}>
          {candidates.map((c) => (
            <button
              type="button"
              key={c.key}
              className="popover-option"
              onClick={() => {
                const f: Filter =
                  c.type === "category" || c.type === "boolean"
                    ? { id: newId(), column: c.key, kind: "values", values: [] }
                    : { id: newId(), column: c.key, kind: "range", min: null, max: null };
                onChange([...filters, f]);
                setOpenId(f.id);
              }}
            >
              <TypeIcon type={c.type} />
              <span className="opt-label">{c.label}</span>
            </button>
          ))}
        </div>
      </Popover>
      {anyActive && (
        <button
          type="button"
          className="link-btn"
          style={{ fontSize: 13 }}
          onClick={() => onChange(filters.map(clearFilter))}
        >
          条件をクリア
        </button>
      )}
      <span className="row-count" aria-live="polite">
        {anyActive ? `${count.format(filteredCount)} / ${count.format(frame.rowCount)} 行` : `${count.format(frame.rowCount)} 行`}
      </span>
    </div>
  );
}

function summary(f: Filter, meta: ColumnMeta | undefined): string {
  if (f.kind === "values") {
    if (f.values.length === 0) return "すべて";
    return f.values.length === 1 ? f.values[0] : `${f.values[0]} ほか${f.values.length - 1}件`;
  }
  if (f.preset) return DATE_PRESETS.find((p) => p.id === f.preset)?.label ?? "すべて";
  if (f.min === null && f.max === null) return "すべて";
  const fmt = (v: number) => (meta?.type === "date" ? formatDate(v, meta.dateUnit === "year" ? "year" : "day") : formatValue(v, meta));
  if (f.min !== null && f.max !== null) return `${fmt(f.min)} 〜 ${fmt(f.max)}`;
  return f.min !== null ? `${fmt(f.min)} 以降` : `${fmt(f.max!)} まで`;
}

interface ChipProps {
  filter: Filter;
  frame: Frame;
  filters: Filter[];
  open: boolean;
  setOpen: (o: boolean) => void;
  onChange: (f: Filter) => void;
  onRemove: () => void;
}

function FilterChip({ filter, frame, filters, open, setOpen, onChange, onRemove }: ChipProps) {
  const meta = frame.meta.get(filter.column);
  const name = meta?.label ?? filter.column;
  const active = isActive(filter);
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      label={`${name}で絞り込み`}
      trigger={
        <span className={`filter-chip${active ? " is-active" : ""}`}>
          <button type="button" className="filter-chip-main" onClick={() => setOpen(!open)} aria-expanded={open} title={`${name}: ${summary(filter, meta)}`}>
            <span className="chip-name">{name}</span>
            <span className="chip-value">{summary(filter, meta)}</span>
            <CaretDownIcon size={12} aria-hidden />
          </button>
          <button type="button" className="filter-chip-x" aria-label={`${name}のフィルタを削除`} onClick={onRemove}>
            <XIcon size={14} />
          </button>
        </span>
      }
    >
      {filter.kind === "values" ? (
        <ValuesPicker filter={filter} frame={frame} filters={filters} onChange={onChange} onDone={() => setOpen(false)} />
      ) : (
        <RangePicker filter={filter} frame={frame} meta={meta} onChange={onChange} onDone={() => setOpen(false)} />
      )}
    </Popover>
  );
}

function ValuesPicker({
  filter,
  frame,
  filters,
  onChange,
  onDone,
}: {
  filter: Extract<Filter, { kind: "values" }>;
  frame: Frame;
  filters: Filter[];
  onChange: (f: Filter) => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  // Counts reflect the other active filters, so users see what each choice would return.
  const options = useMemo(() => valueCounts(frame, filterRows(frame, filters, filter.id), filter.column), [frame, filters, filter.id, filter.column]);
  const selected = new Set(filter.values);
  const q = query.trim().toLowerCase();
  const visible = (q ? options.filter((o) => o.value.toLowerCase().includes(q)) : options).slice(0, 300);
  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange({ ...filter, values: [...next] });
  };
  return (
    <>
      {options.length > 8 && (
        <label className="field" style={{ position: "relative" }}>
          <span className="visually-hidden">値を検索</span>
          <MagnifyingGlassIcon size={16} className="muted" style={{ position: "absolute", left: 10, top: 9 }} aria-hidden />
          <input className="input input-sm" style={{ paddingLeft: 32 }} placeholder="値を検索" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      )}
      <div className="popover-list" role="group" aria-label="値">
        {visible.length === 0 && <div className="muted" style={{ padding: 6 }}>一致する値がありません</div>}
        {visible.map((o) => (
          <label key={o.value} className="popover-option">
            <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} style={{ accentColor: "var(--action)", width: 16, height: 16 }} />
            <span className="opt-label">{o.value}</span>
            <span className="opt-count">{count.format(o.count)}</span>
          </label>
        ))}
        {options.length > visible.length && !q && <div className="muted" style={{ padding: 6, fontSize: 12 }}>上位 300 件を表示中。検索で絞り込めます</div>}
      </div>
      <div className="popover-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange({ ...filter, values: [] })} disabled={selected.size === 0}>
          選択を解除
        </button>
        <button type="button" className="btn btn-sm" onClick={onDone}>
          閉じる
        </button>
      </div>
    </>
  );
}

const toInputDate = (t: number | null) => (t === null ? "" : new Date(t).toISOString().slice(0, 10));
const fromInputDate = (s: string, endOfDay: boolean) => {
  if (!s) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(t) ? null : endOfDay ? t + DAY - 1 : t;
};

function RangePicker({
  filter,
  frame,
  meta,
  onChange,
  onDone,
}: {
  filter: Extract<Filter, { kind: "range" }>;
  frame: Frame;
  meta: ColumnMeta | undefined;
  onChange: (f: Filter) => void;
  onDone: () => void;
}) {
  const ext = useMemo(() => extent(frame, filter.column), [frame, filter.column]);
  const isDate = meta?.type === "date";
  if (!ext) return <div className="muted">値がありません</div>;
  const [lo, hi] = ext;

  // Presets are stored by name and recomputed from the latest date, so they follow new data.
  const presets: { label: string; preset: DatePreset | null }[] = isDate ? [{ label: "全期間", preset: null }, ...DATE_PRESETS.map((p) => ({ label: p.label, preset: p.id }))] : [];
  const presetSelected = (p: DatePreset | null) => (p === null ? !filter.preset && filter.min === null && filter.max === null : filter.preset === p);
  const shown = filter.preset ? presetRange(filter.preset, hi) : null;

  return (
    <>
      {isDate && (
        <>
          <div className="field-label">データの期間 {formatDate(lo)} 〜 {formatDate(hi)}</div>
          <div className="preset-row" style={{ marginTop: 6 }}>
            {presets.map((p) => (
              <button
                type="button"
                key={p.label}
                className="btn btn-sm"
                aria-pressed={presetSelected(p.preset)}
                style={presetSelected(p.preset) ? { borderColor: "var(--action)", background: "var(--action-soft)" } : undefined}
                onClick={() => onChange({ ...filter, min: null, max: null, preset: p.preset })}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="range-grid">
        <label className="field">
          <span className="field-label">{isDate ? "開始日" : "最小"}</span>
          {isDate ? (
            <input
              type="date"
              className="input input-sm"
              value={toInputDate(shown ? shown[0] : filter.min)}
              min={toInputDate(lo)}
              max={toInputDate(hi)}
              onChange={(e) => onChange({ ...filter, preset: null, max: shown ? shown[1] : filter.max, min: fromInputDate(e.target.value, false) })}
            />
          ) : (
            <input type="number" className="input input-sm" value={filter.min ?? ""} placeholder={String(lo)} onChange={(e) => onChange({ ...filter, min: e.target.value === "" ? null : Number(e.target.value) })} />
          )}
        </label>
        <label className="field">
          <span className="field-label">{isDate ? "終了日" : "最大"}</span>
          {isDate ? (
            <input
              type="date"
              className="input input-sm"
              value={toInputDate(shown ? shown[1] - DAY + 1 : filter.max === null ? null : filter.max - DAY + 1)}
              min={toInputDate(lo)}
              max={toInputDate(hi)}
              onChange={(e) => onChange({ ...filter, preset: null, min: shown ? shown[0] : filter.min, max: fromInputDate(e.target.value, true) })}
            />
          ) : (
            <input type="number" className="input input-sm" value={filter.max ?? ""} placeholder={String(hi)} onChange={(e) => onChange({ ...filter, max: e.target.value === "" ? null : Number(e.target.value) })} />
          )}
        </label>
      </div>
      <div className="popover-foot">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(clearFilter(filter))} disabled={!isFilterActive(filter)}>
          解除
        </button>
        <button type="button" className="btn btn-sm" onClick={onDone}>
          閉じる
        </button>
      </div>
    </>
  );
}
