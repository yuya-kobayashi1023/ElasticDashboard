import type { WidgetNumberFormat, Widget } from "../../core/types";
import type { SetWidget } from "./shared";

/** Kinds whose values are numbers on screen (a table follows the column settings, a note has none). */
export function hasNumberFormat(w: Widget): boolean {
  return w.kind !== "table" && w.kind !== "note";
}

const STYLES: { value: NonNullable<WidgetNumberFormat["style"]>; label: string }[] = [
  { value: "auto", label: "ダッシュボードの設定に合わせる" },
  { value: "en", label: "1.2M（k, M, B）" },
  { value: "ja", label: "123万（万, 億）" },
  { value: "full", label: "省略せず全桁" },
];

export function NumberFormatFields({ widget, set }: { widget: Widget; set: SetWidget }) {
  const nf = widget.numberFormat ?? {};
  const change = (patch: Partial<WidgetNumberFormat>, coalesce?: string) => {
    const next: WidgetNumberFormat = { ...nf, ...patch };
    // Keep the saved object minimal: unset fields mean "follow the column / dashboard".
    if (!next.style || next.style === "auto") delete next.style;
    if (typeof next.decimals !== "number") delete next.decimals;
    if (!next.prefix) delete next.prefix;
    if (!next.suffix) delete next.suffix;
    set({ numberFormat: Object.keys(next).length ? next : undefined }, coalesce);
  };
  return (
    <>
      <div className="field-row">
        <label className="field">
          <span className="field-label">大きな数の表記</span>
          <select className="select" value={nf.style ?? "auto"} onChange={(e) => change({ style: e.target.value as WidgetNumberFormat["style"] })}>
            {STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">小数点以下の桁数</span>
          <select className="select" value={typeof nf.decimals === "number" ? nf.decimals : ""} onChange={(e) => change({ decimals: e.target.value === "" ? null : Number(e.target.value) })}>
            <option value="">列の設定に合わせる</option>
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n} 桁
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span className="field-label">数値の前に付ける文字</span>
          <input className="input" value={nf.prefix ?? ""} placeholder="例: ¥" onChange={(e) => change({ prefix: e.target.value }, `nf-prefix:${widget.id}`)} />
        </label>
        <label className="field">
          <span className="field-label">数値の後ろに付ける文字</span>
          <input className="input" value={nf.suffix ?? ""} placeholder="例: 円" onChange={(e) => change({ suffix: e.target.value }, `nf-suffix:${widget.id}`)} />
        </label>
      </div>
      <span className="field-hint">このウィジェットの値だけに適用します。空欄の項目は列の設定に従います</span>
    </>
  );
}
