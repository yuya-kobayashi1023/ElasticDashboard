import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CaretDownIcon,
  CaretUpIcon,
  ChartBarHorizontalIcon,
  ChartBarIcon,
  ChartLineIcon,
  ChartScatterIcon,
  CheckIcon,
  DotsSixVerticalIcon,
  GaugeIcon,
  GridNineIcon,
  TableIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { usePalette } from "../components/ThemeScope";
import { useMemo, type ReactNode } from "react";
import { columnHasTime } from "../core/aggregate";
import { defaultWidget } from "../core/autoDashboard";
import { aggsFor, isContinuousType, isDimensionType } from "../core/columnTypes";
import { AGG_LABEL, BUCKET_LABEL, TYPE_SHORT_LABEL, widgetTitle } from "../core/format";
import { orderedTableKeys } from "../core/tableFilter";
import type { Agg, BarSort, ColumnMeta, CompareBucket, Frame, KpiWidget, Measure, Span, TimeBucket, Widget, WidgetKind } from "../core/types";
import { Dialog } from "./Dialog";
import { useApp, useToasts } from "./store";

const KINDS: { kind: WidgetKind; label: string; icon: ReactNode }[] = [
  { kind: "kpi", label: "数値", icon: <GaugeIcon size={18} aria-hidden /> },
  { kind: "bar", label: "棒グラフ", icon: <ChartBarHorizontalIcon size={18} aria-hidden /> },
  { kind: "time", label: "推移", icon: <ChartLineIcon size={18} aria-hidden /> },
  { kind: "histogram", label: "分布", icon: <ChartBarIcon size={18} aria-hidden /> },
  { kind: "scatter", label: "散布図", icon: <ChartScatterIcon size={18} aria-hidden /> },
  { kind: "pivot", label: "クロス集計", icon: <GridNineIcon size={18} aria-hidden /> },
  { kind: "table", label: "表", icon: <TableIcon size={18} aria-hidden /> },
];

const SPANS: { span: Span; label: string }[] = [
  { span: 1, label: "1/4" },
  { span: 2, label: "1/2" },
  { span: 3, label: "3/4" },
  { span: 4, label: "全幅" },
];

interface Props {
  widgetId: string | null;
  frame: Frame;
  onClose: () => void;
}

export function WidgetEditor({ widgetId, frame, onClose }: Props) {
  const dashboard = useApp((s) => s.dashboard);
  const update = useApp((s) => s.update);
  const widget = dashboard?.widgets.find((w) => w.id === widgetId) ?? null;
  const columns = (dashboard?.columns ?? []).filter((c) => frame.columns.has(c.key));
  const axisKey = widget?.kind === "time" ? widget.dateColumn : widget?.kind === "kpi" ? (widget.compare?.dateColumn ?? null) : null;
  const isTimeOfDay = !!axisKey && frame.columns.get(axisKey)?.type === "time";
  // Sub-day units need a time part in the data; date-only columns are aggregated by day.
  const noTimePart = useMemo(() => !!axisKey && !columnHasTime(frame, axisKey), [frame, axisKey]);

  const set = (patch: Partial<Widget>, coalesce?: string) => {
    if (!widget) return;
    update((d) => ({ ...d, widgets: d.widgets.map((w) => (w.id === widget.id ? ({ ...w, ...patch } as Widget) : w)) }), coalesce);
  };

  const changeKind = (kind: WidgetKind) => {
    if (!widget || widget.kind === kind || !dashboard) return;
    const next = { ...defaultWidget(kind, dashboard.columns, frame, widget.id), title: widget.title };
    update((d) => ({ ...d, widgets: d.widgets.map((w) => (w.id === widget.id ? next : w)) }));
  };

  const remove = () => {
    if (!widget || !dashboard) return;
    const title = widgetTitle(widget, dashboard.columns);
    update((d) => ({ ...d, widgets: d.widgets.filter((w) => w.id !== widget.id) }));
    onClose();
    useToasts.getState().push({ tone: "info", message: `「${title}」を削除しました`, action: { label: "元に戻す", run: () => useApp.getState().undo() } });
  };

  return (
    <Dialog
      open={!!widget}
      onClose={onClose}
      title="ウィジェットの設定"
      variant="drawer"
      footer={
        <>
          <button type="button" className="btn btn-ghost danger-text" onClick={remove}>
            <TrashIcon size={18} aria-hidden />
            削除
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            完了
          </button>
        </>
      }
    >
      {widget && dashboard && (
        <div className="form-stack">
          <div className="field">
            <span className="field-label" id="kind-label">
              種類
            </span>
            <div className="kind-grid" role="group" aria-labelledby="kind-label">
              {KINDS.map((k) => (
                <button type="button" key={k.kind} className="kind-option" aria-pressed={widget.kind === k.kind} onClick={() => changeKind(k.kind)}>
                  {k.icon}
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="widget-title">
              タイトル
            </label>
            <input
              id="widget-title"
              aria-describedby="widget-title-hint"
              className="input"
              value={widget.title}
              placeholder={widgetTitle({ ...widget, title: "" }, dashboard.columns)}
              onChange={(e) => set({ title: e.target.value }, `title:${widget.id}`)}
            />
            <span className="field-hint" id="widget-title-hint">
              空欄のときは設定内容から自動で付けます
            </span>
          </div>

          {widget.kind === "kpi" && (
            <>
              <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
              <CompareFields widget={widget} columns={columns} noTimePart={noTimePart} onChange={(compare) => set({ compare })} />
            </>
          )}

          {widget.kind === "bar" && (
            <>
              <ColumnSelect
                label="分類する列"
                value={widget.dimension}
                columns={columns.filter((c) => isDimensionType(c.type))}
                onChange={(dimension) => set(columns.find((c) => c.key === dimension)?.order ? { dimension, sort: "label" } : { dimension })}
              />
              <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
              <div className="field-row">
                <label className="field">
                  <span className="field-label">表示件数</span>
                  <select className="select" value={widget.limit} onChange={(e) => set({ limit: Number(e.target.value) })}>
                    {[5, 10, 15, 20, 30, 50].map((n) => (
                      <option key={n} value={n}>
                        上位 {n} 件
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">並び順</span>
                  <select className="select" value={widget.sort} onChange={(e) => set({ sort: e.target.value as BarSort })}>
                    <option value="value-desc">値が大きい順</option>
                    <option value="value-asc">値が小さい順</option>
                    <option value="label">名前順</option>
                  </select>
                </label>
              </div>
            </>
          )}

          {widget.kind === "time" && (
            <>
              <div className="field-row">
                <ColumnSelect
                  label="日付・時刻の列"
                  value={widget.dateColumn}
                  columns={columns.filter((c) => c.type === "date" || c.type === "time")}
                  onChange={(dateColumn) => set({ dateColumn, ...(columns.find((c) => c.key === dateColumn)?.type === "time" && !["auto", "minute", "second", "hour"].includes(widget.bucket) ? { bucket: "hour" } : {}) })}
                />
                <label className="field">
                  <span className="field-label">集計の単位</span>
                  <select className="select" value={widget.bucket} onChange={(e) => set({ bucket: e.target.value as TimeBucket })}>
                    {(isTimeOfDay ? (["auto", "second", "minute", "hour"] as const) : (["auto", "second", "minute", "hour", "day", "week", "month", "quarter", "year"] as const)).map((b) => (
                      <option key={b} value={b}>
                        {BUCKET_LABEL[b]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {noTimePart && ["second", "minute", "hour"].includes(widget.bucket) && <span className="field-hint">この列には時刻が含まれていないため、日単位で集計します</span>}
              <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
              <label className="field">
                <span className="field-label">系列</span>
                <select
                  className="select"
                  value={widget.series?.length ? SERIES_COLUMNS : (widget.split ?? "")}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === SERIES_COLUMNS) {
                      const first = widget.measure.column ?? columns.find((c) => isContinuousType(c.type))?.key;
                      set({ split: null, series: first ? [first] : [] });
                    } else set({ split: v || null, series: null });
                  }}
                >
                  <option value="">分けない</option>
                  <option value={SERIES_COLUMNS}>複数の数値列を並べる</option>
                  {columns
                    .filter((c) => c.type === "category" || c.type === "boolean")
                    .map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                </select>
                {widget.split && <span className="field-hint">上位 7 系列を表示し、残りは「その他」にまとめます</span>}
              </label>
              {!!widget.series && (
                <fieldset className="field fieldset">
                  <legend className="field-label">並べる列（最大 8 列）</legend>
                  <div className="check-list">
                    {columns
                      .filter((c) => isContinuousType(c.type))
                      .map((c) => {
                        const on = widget.series!.includes(c.key);
                        return (
                          <label key={c.key} className="checkbox">
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={!on && widget.series!.length >= 8}
                              onChange={() => set({ series: on ? widget.series!.filter((k) => k !== c.key) : [...widget.series!, c.key] })}
                            />
                            {c.label}
                          </label>
                        );
                      })}
                  </div>
                  <span className="field-hint">集計方法は上の設定を使います。色で見分けられるのは 8 列までです</span>
                </fieldset>
              )}
              <div className="field">
                <span className="field-label" id="mark-label">
                  表示
                </span>
                <div className="segmented" role="group" aria-labelledby="mark-label">
                  <button type="button" aria-pressed={widget.mark === "line"} onClick={() => set({ mark: "line" })}>
                    <ChartLineIcon size={16} aria-hidden />
                    折れ線
                  </button>
                  <button type="button" aria-pressed={widget.mark === "column"} onClick={() => set({ mark: "column" })}>
                    <ChartBarIcon size={16} aria-hidden />
                    縦棒
                  </button>
                </div>
                {widget.mark === "column" && widget.split && widget.measure.agg !== "sum" && widget.measure.agg !== "count" && (
                  <span className="field-hint">平均などは積み上げられないため、系列ごとに並べて表示します</span>
                )}
              </div>
            </>
          )}

          {widget.kind === "histogram" && (
            <ColumnSelect label="数値の列" value={widget.column} columns={columns.filter((c) => isContinuousType(c.type))} onChange={(column) => set({ column })} />
          )}

          {widget.kind === "scatter" && (
            <>
              <div className="field-row">
                <ColumnSelect label="横軸" value={widget.x} columns={columns.filter((c) => isContinuousType(c.type))} onChange={(x) => set({ x })} />
                <ColumnSelect label="縦軸" value={widget.y} columns={columns.filter((c) => isContinuousType(c.type))} onChange={(y) => set({ y })} />
              </div>
              <label className="field">
                <span className="field-label">色分けする列</span>
                <select className="select" value={widget.colorBy ?? ""} onChange={(e) => set({ colorBy: e.target.value || null })}>
                  <option value="">色分けしない</option>
                  {columns
                    .filter((c) => c.type === "category" || c.type === "boolean")
                    .map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                </select>
                {widget.colorBy && <span className="field-hint">点が多い上位 3 分類を色分けし、残りは「その他」にまとめます</span>}
              </label>
            </>
          )}

          {widget.kind === "pivot" && (
            <>
              <div className="field-row">
                <ColumnSelect label="行" value={widget.rows} columns={columns.filter((c) => isDimensionType(c.type))} onChange={(rows) => set({ rows })} />
                <ColumnSelect label="列" value={widget.cols} columns={columns.filter((c) => isDimensionType(c.type))} onChange={(cols) => set({ cols })} />
              </div>
              <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
              <span className="field-hint">行は上位 20 件、列は上位 10 件を表示し、残りは「その他」にまとめます</span>
            </>
          )}

          {widget.kind === "table" && <TableFields widget={widget} columns={columns} onChange={set} />}

          {usesColor(widget) && <ColorField value={widget.color ?? 0} onChange={(color) => set({ color })} />}

          {(widget.kind === "bar" || widget.kind === "time" || widget.kind === "histogram" || widget.kind === "scatter") && (
            <label className="checkbox">
              <input type="checkbox" checked={widget.axisTitles !== false} onChange={(e) => set({ axisTitles: e.target.checked })} />
              軸のタイトルと単位を表示する
            </label>
          )}

          <div className="field">
            <span className="field-label" id="span-label">
              幅
            </span>
            <div className="segmented" role="group" aria-labelledby="span-label">
              {SPANS.map((s) => (
                <button type="button" key={s.span} aria-pressed={widget.span === s.span} onClick={() => set({ span: s.span })}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ColumnSelect({ label, value, columns, onChange }: { label: string; value: string; columns: ColumnMeta[]; onChange: (key: string) => void }) {
  const known = columns.some((c) => c.key === value);
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select className="select" value={known ? value : ""} onChange={(e) => onChange(e.target.value)}>
        {!known && <option value="">選択してください</option>}
        {columns.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}（{TYPE_SHORT_LABEL[c.type]}）{c.hidden ? " ・非表示" : ""}
          </option>
        ))}
      </select>
      {columns.length === 0 && <span className="field-error">該当する種類の列がありません。「列の設定」で種類を変更できます</span>}
    </label>
  );
}

const COLUMN_AGGS: Agg[] = ["sum", "avg", "min", "max", "distinct"];

function MeasureFields({ measure, columns, onChange }: { measure: Measure; columns: ColumnMeta[]; onChange: (m: Measure) => void }) {
  // Columns a given aggregation makes sense for (a sum needs numbers, a distinct count takes anything).
  const poolFor = (agg: Agg) => columns.filter((c) => aggsFor(c.type).includes(agg));
  const candidates = poolFor(measure.agg);
  const setAgg = (agg: Agg) => {
    if (agg === "count") return onChange({ agg, column: null });
    const pool = poolFor(agg);
    const column = pool.some((c) => c.key === measure.column) ? measure.column : (pool.find((c) => !c.idLike) ?? pool[0])?.key ?? null;
    onChange({ agg, column });
  };
  return (
    <div className="field-row">
      <label className="field">
        <span className="field-label">集計方法</span>
        <select className="select" value={measure.agg} onChange={(e) => setAgg(e.target.value as Agg)}>
          <option value="count">{AGG_LABEL.count}（行数）</option>
          {COLUMN_AGGS.map((a) => (
            <option key={a} value={a} disabled={poolFor(a).length === 0}>
              {AGG_LABEL[a]}
            </option>
          ))}
        </select>
      </label>
      {measure.agg !== "count" && <ColumnSelect label="集計する列" value={measure.column ?? ""} columns={candidates} onChange={(column) => onChange({ ...measure, column })} />}
    </div>
  );
}

type TableWidgetT = Extract<Widget, { kind: "table" }>;

function TableFields({ widget, columns, onChange }: { widget: TableWidgetT; columns: ColumnMeta[]; onChange: (p: Partial<Widget>) => void }) {
  const visible = columns.filter((c) => !c.hidden);
  const byKey = new Map(visible.map((c) => [c.key, c]));
  const keys = orderedTableKeys(widget, visible.map((c) => c.key));
  const selected = new Set(widget.columns ?? keys);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // `order` holds every key (checked or not); `columns` holds the checked ones, null while all are checked.
  const commit = (order: string[], checked: Set<string>) => {
    const on = order.filter((k) => checked.has(k));
    onChange({ order, columns: on.length === order.length ? null : on });
  };
  const toggle = (key: string) => {
    const next = new Set(selected);
    if (!next.delete(key)) next.add(key);
    commit(keys, next);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= keys.length) return;
    commit(arrayMove(keys, from, to), selected);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(keys.indexOf(String(active.id)), keys.indexOf(String(over.id)));
  };
  const setAll = (on: boolean) => onChange({ order: keys, columns: on ? null : [] });

  return (
    <>
      <fieldset className="field fieldset">
        <legend className="field-label">表示する列</legend>
        <div className="col-pick-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(true)}>
            すべて表示
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(false)}>
            すべて外す
          </button>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={keys} strategy={verticalListSortingStrategy}>
            <ul className="col-order-list">
              {keys.map((k, i) => (
                <ColumnRow key={k} id={k} label={byKey.get(k)!.label} checked={selected.has(k)} first={i === 0} last={i === keys.length - 1} onToggle={() => toggle(k)} onMove={(d) => move(i, i + d)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        <span className="field-hint">ここにない列は「列の設定」で非表示になっています</span>
      </fieldset>
      <div className="field">
        <span className="field-label" id="table-sort-label">
          最初の並び順
        </span>
        <div className="sort-setting" role="group" aria-labelledby="table-sort-label">
          <select
            className="select"
            aria-label="並べ替える列"
            value={widget.sort && byKey.has(widget.sort.key) ? widget.sort.key : ""}
            onChange={(e) => onChange({ sort: e.target.value ? { key: e.target.value, dir: widget.sort?.dir ?? 1 } : null })}
          >
            <option value="">指定しない</option>
            {keys.map((k) => (
              <option key={k} value={k}>
                {byKey.get(k)!.label}
              </option>
            ))}
          </select>
          <div className="segmented" role="group" aria-label="並べ替えの向き">
            {([1, -1] as const).map((d) => (
              <button type="button" key={d} disabled={!widget.sort} aria-pressed={widget.sort?.dir === d} onClick={() => widget.sort && onChange({ sort: { ...widget.sort, dir: d } })}>
                {d === 1 ? "昇順" : "降順"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="check-list">
        <label className="checkbox">
          <input type="checkbox" checked={widget.filterRow !== false} onChange={(e) => onChange({ filterRow: e.target.checked })} />
          列ごとの絞り込み欄を表示
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={!!widget.rowNumbers} onChange={(e) => onChange({ rowNumbers: e.target.checked })} />
          行番号を表示
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={!!widget.wrap} onChange={(e) => onChange({ wrap: e.target.checked })} />
          長い文字を折り返す
        </label>
      </div>
      <label className="field">
        <span className="field-label">1 ページの行数</span>
        <select className="select" value={widget.pageSize} onChange={(e) => onChange({ pageSize: Number(e.target.value) })}>
          {[10, 20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n} 行
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function ColumnRow({ id, label, checked, first, last, onToggle, onMove }: { id: string; label: string; checked: boolean; first: boolean; last: boolean; onToggle: () => void; onMove: (delta: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} className={`col-order-row${isDragging ? " is-dragging" : ""}`} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <button type="button" ref={setActivatorNodeRef} className="icon-btn drag-handle" aria-label={`「${label}」を並べ替え`} title="ドラッグで並べ替え" {...attributes} {...listeners}>
        <DotsSixVerticalIcon size={16} weight="bold" />
      </button>
      <label className="checkbox">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span>{label}</span>
      </label>
      <button type="button" className="icon-btn" aria-label="上へ" title="上へ" disabled={first} onClick={() => onMove(-1)}>
        <CaretUpIcon size={14} weight="bold" />
      </button>
      <button type="button" className="icon-btn" aria-label="下へ" title="下へ" disabled={last} onClick={() => onMove(1)}>
        <CaretDownIcon size={14} weight="bold" />
      </button>
    </li>
  );
}

/** Widgets drawn in a single color (multi-series charts take colors from the palette order). */
const SERIES_COLUMNS = "__series_columns";

function usesColor(w: Widget): boolean {
  if (w.kind === "bar" || w.kind === "histogram" || w.kind === "pivot") return true;
  if (w.kind === "time") return !w.split && !w.series?.length;
  if (w.kind === "scatter") return !w.colorBy;
  if (w.kind === "kpi") return !!w.compare;
  return false;
}

function ColorField({ value, onChange }: { value: number; onChange: (i: number) => void }) {
  const palette = usePalette();
  return (
    <div className="field">
      <span className="field-label" id="color-label">
        色
      </span>
      <div className="color-slots" role="radiogroup" aria-labelledby="color-label">
        {palette.map((c, i) => (
          <button
            type="button"
            key={i}
            role="radio"
            aria-checked={value === i}
            aria-label={`配色の ${i + 1} 番目`}
            className="color-swatch-btn"
            style={{ background: c }}
            onClick={() => onChange(i)}
          >
            {value === i && <CheckIcon size={14} weight="bold" color="#fff" aria-hidden />}
          </button>
        ))}
      </div>
      <span className="field-hint">配色そのものは「デザイン」で変えられます</span>
    </div>
  );
}

const COMPARE_BUCKETS: [CompareBucket, string][] = [
  ["hour", "時"],
  ["day", "日"],
  ["week", "週"],
  ["month", "月"],
  ["quarter", "四半期"],
  ["year", "年"],
];

function CompareFields({ widget, columns, noTimePart, onChange }: { widget: KpiWidget; columns: ColumnMeta[]; noTimePart: boolean; onChange: (c: KpiWidget["compare"]) => void }) {
  const dates = columns.filter((c) => c.type === "date");
  const cmp = widget.compare ?? null;
  return (
    <fieldset className="field fieldset">
      <legend className="field-label">前の期間との比較</legend>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={!!cmp}
          disabled={dates.length === 0}
          onChange={(e) => onChange(e.target.checked ? { dateColumn: dates[0].key, bucket: "month", upIsGood: true } : null)}
        />
        最新の期間の値と、前の期間からの増減を表示する
      </label>
      {dates.length === 0 && <span className="field-hint">日付の列がないため使えません</span>}
      {cmp && (
        <>
          <div className="field-row" style={{ marginTop: 6 }}>
            <ColumnSelect label="日付の列" value={cmp.dateColumn} columns={dates} onChange={(dateColumn) => onChange({ ...cmp, dateColumn })} />
            <label className="field">
              <span className="field-label">期間の単位</span>
              <select className="select" value={cmp.bucket} onChange={(e) => onChange({ ...cmp, bucket: e.target.value as CompareBucket })}>
                {COMPARE_BUCKETS.map(([b, l]) => (
                  <option key={b} value={b}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {noTimePart && cmp.bucket === "hour" && <span className="field-hint">この列には時刻が含まれていないため、日単位で集計します</span>}
          <label className="checkbox">
            <input type="checkbox" checked={cmp.upIsGood} onChange={(e) => onChange({ ...cmp, upIsGood: e.target.checked })} />
            増えるほど良い指標（オフにすると、減少を良い変化として色付けします）
          </label>
        </>
      )}
    </fieldset>
  );
}
