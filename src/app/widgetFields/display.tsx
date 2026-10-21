import { CheckIcon } from "@phosphor-icons/react";
import { usePalette } from "../../components/ThemeScope";
import type { Widget } from "../../core/types";
import type { SetWidget } from "./shared";

/** Widgets drawn in a single color (multi-series charts take colors from the palette order). */
export function usesColor(w: Widget): boolean {
  if (w.kind === "bar" || w.kind === "histogram" || w.kind === "pivot" || w.kind === "heatmap" || w.kind === "gauge") return true;
  if (w.kind === "time") return !w.split && !w.series?.length;
  if (w.kind === "scatter") return !w.colorBy;
  if (w.kind === "kpi") return !!w.compare;
  return false;
}

/** Color and axis-title fields that end the display section of most kinds. */
export function CommonDisplay({ widget, set }: { widget: Widget; set: SetWidget }) {
  const hasAxes = widget.kind === "bar" || widget.kind === "time" || widget.kind === "histogram" || widget.kind === "scatter";
  return (
    <>
      {hasAxes && (
        <label className="checkbox">
          <input type="checkbox" checked={widget.axisTitles !== false} onChange={(e) => set({ axisTitles: e.target.checked })} />
          軸のタイトルと単位を表示する
        </label>
      )}
      {usesColor(widget) && <ColorField value={widget.color ?? 0} onChange={(color) => set({ color })} />}
    </>
  );
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
