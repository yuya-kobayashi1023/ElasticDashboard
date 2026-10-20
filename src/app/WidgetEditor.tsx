import { ChartBarHorizontalIcon, ChartBarIcon, ChartLineIcon, ChartScatterIcon, CheckIcon, GaugeIcon, GridNineIcon, TableIcon, TrashIcon } from "@phosphor-icons/react";
import { usePalette } from "../components/ThemeScope";
import type { ReactNode } from "react";
import { defaultWidget } from "../core/autoDashboard";
import { AGG_LABEL, BUCKET_LABEL, TYPE_LABEL, widgetTitle } from "../core/format";
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
              <CompareFields widget={widget} columns={columns} onChange={(compare) => set({ compare })} />
            </>
          )}

          {widget.kind === "bar" && (
            <>
              <ColumnSelect
                label="分類する列"
                value={widget.dimension}
                columns={columns.filter((c) => c.type === "category" || c.type === "text")}
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
                <ColumnSelect label="日付の列" value={widget.dateColumn} columns={columns.filter((c) => c.type === "date")} onChange={(dateColumn) => set({ dateColumn })} />
                <label className="field">
                  <span className="field-label">集計の単位</span>
                  <select className="select" value={widget.bucket} onChange={(e) => set({ bucket: e.target.value as TimeBucket })}>
                    {(["auto", "day", "week", "month", "quarter", "year"] as const).map((b) => (
                      <option key={b} value={b}>
                        {BUCKET_LABEL[b]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
              <label className="field">
                <span className="field-label">系列に分ける列</span>
                <select className="select" value={widget.split ?? ""} onChange={(e) => set({ split: e.target.value || null })}>
                  <option value="">分けない</option>
                  {columns
                    .filter((c) => c.type === "category")
                    .map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                </select>
                {widget.split && <span className="field-hint">上位 7 系列を表示し、残りは「その他」にまとめます</span>}
              </label>
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
            <ColumnSelect label="数値の列" value={widget.column} columns={columns.filter((c) => c.type === "number")} onChange={(column) => set({ column })} />
          )}

          {widget.kind === "scatter" && (
            <>
              <div className="field-row">
                <ColumnSelect label="横軸" value={widget.x} columns={columns.filter((c) => c.type === "number")} onChange={(x) => set({ x })} />
                <ColumnSelect label="縦軸" value={widget.y} columns={columns.filter((c) => c.type === "number")} onChange={(y) => set({ y })} />
              </div>
              <label className="field">
                <span className="field-label">色分けする列</span>
                <select className="select" value={widget.colorBy ?? ""} onChange={(e) => set({ colorBy: e.target.value || null })}>
                  <option value="">色分けしない</option>
                  {columns
                    .filter((c) => c.type === "category")
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
                <ColumnSelect label="行" value={widget.rows} columns={columns.filter((c) => c.type === "category" || c.type === "text")} onChange={(rows) => set({ rows })} />
                <ColumnSelect label="列" value={widget.cols} columns={columns.filter((c) => c.type === "category" || c.type === "text")} onChange={(cols) => set({ cols })} />
              </div>
              <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
              <span className="field-hint">行は上位 20 件、列は上位 10 件を表示し、残りは「その他」にまとめます</span>
            </>
          )}

          {widget.kind === "table" && <TableFields widget={widget} columns={columns} onChange={set} />}

          {usesColor(widget) && <ColorField value={widget.color ?? 0} onChange={(color) => set({ color })} />}

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
            {c.label}（{TYPE_LABEL[c.type]}）{c.hidden ? " ・非表示" : ""}
          </option>
        ))}
      </select>
      {columns.length === 0 && <span className="field-error">該当する種類の列がありません。「列の設定」で種類を変更できます</span>}
    </label>
  );
}

const NUMERIC_AGGS: Agg[] = ["sum", "avg", "min", "max"];

function MeasureFields({ measure, columns, onChange }: { measure: Measure; columns: ColumnMeta[]; onChange: (m: Measure) => void }) {
  const numeric = columns.filter((c) => c.type === "number");
  const candidates = measure.agg === "distinct" ? columns : numeric;
  const setAgg = (agg: Agg) => {
    if (agg === "count") return onChange({ agg, column: null });
    const pool = agg === "distinct" ? columns : numeric;
    const column = pool.some((c) => c.key === measure.column) ? measure.column : (pool.find((c) => !c.idLike) ?? pool[0])?.key ?? null;
    onChange({ agg, column });
  };
  return (
    <div className="field-row">
      <label className="field">
        <span className="field-label">集計方法</span>
        <select className="select" value={measure.agg} onChange={(e) => setAgg(e.target.value as Agg)}>
          <option value="count">{AGG_LABEL.count}（行数）</option>
          {NUMERIC_AGGS.map((a) => (
            <option key={a} value={a} disabled={numeric.length === 0}>
              {AGG_LABEL[a]}
            </option>
          ))}
          <option value="distinct">{AGG_LABEL.distinct}</option>
        </select>
      </label>
      {measure.agg !== "count" && <ColumnSelect label="集計する列" value={measure.column ?? ""} columns={candidates} onChange={(column) => onChange({ ...measure, column })} />}
    </div>
  );
}

function TableFields({ widget, columns, onChange }: { widget: Extract<Widget, { kind: "table" }>; columns: ColumnMeta[]; onChange: (p: Partial<Widget>) => void }) {
  const visible = columns.filter((c) => !c.hidden);
  const selected = new Set(widget.columns ?? visible.map((c) => c.key));
  const toggle = (key: string) => {
    const next = visible.map((c) => c.key).filter((k) => (k === key ? !selected.has(k) : selected.has(k)));
    onChange({ columns: next.length === visible.length ? null : next });
  };
  return (
    <>
      <fieldset className="field fieldset">
        <legend className="field-label">表示する列</legend>
        <div className="check-list">
          {visible.map((c) => (
            <label key={c.key} className="checkbox">
              <input type="checkbox" checked={selected.has(c.key)} onChange={() => toggle(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
        <span className="field-hint">ここにない列は「列の設定」で非表示になっています</span>
      </fieldset>
      <label className="field">
        <span className="field-label">1 ページの行数</span>
        <select className="select" value={widget.pageSize} onChange={(e) => onChange({ pageSize: Number(e.target.value) })}>
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} 行
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Widgets drawn in a single color (multi-series charts take colors from the palette order). */
function usesColor(w: Widget): boolean {
  if (w.kind === "bar" || w.kind === "histogram" || w.kind === "pivot") return true;
  if (w.kind === "time") return !w.split;
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
  ["day", "日"],
  ["week", "週"],
  ["month", "月"],
  ["quarter", "四半期"],
  ["year", "年"],
];

function CompareFields({ widget, columns, onChange }: { widget: KpiWidget; columns: ColumnMeta[]; onChange: (c: KpiWidget["compare"]) => void }) {
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
          <label className="checkbox">
            <input type="checkbox" checked={cmp.upIsGood} onChange={(e) => onChange({ ...cmp, upIsGood: e.target.checked })} />
            増えるほど良い指標（オフにすると、減少を良い変化として色付けします）
          </label>
        </>
      )}
    </fieldset>
  );
}
