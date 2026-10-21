import { useState } from "react";
import type { GaugeWidget } from "../../core/types";
import { CommonDisplay } from "./display";
import { MeasureFields, NumberInput, type FieldProps } from "./shared";

function parse(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** The target is required, so clearing the field keeps the last number in the widget and shows the error here. */
function TargetInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(Number.isFinite(value) ? String(value) : "");
  const empty = parse(text) === null;
  return (
    <label className="field">
      <span className="field-label">目標値</span>
      <input
        className="input"
        inputMode="decimal"
        value={text}
        placeholder="例: 1200000"
        aria-invalid={empty}
        onChange={(e) => {
          setText(e.target.value);
          const n = parse(e.target.value);
          if (n !== null) onChange(n);
        }}
      />
      {empty && <span className="field-error">目標値を入力してください</span>}
    </label>
  );
}

export function GaugeData({ widget, columns, set }: FieldProps<GaugeWidget>) {
  return (
    <>
      <MeasureFields measure={widget.measure} columns={columns} onChange={(measure) => set({ measure })} />
      <div className="field-row">
        <TargetInput value={widget.target} onChange={(target) => set({ target }, `target:${widget.id}`)} />
        <NumberInput label="最小値" value={widget.min} placeholder="0" onChange={(min) => set({ min: min ?? undefined }, `min:${widget.id}`)} />
      </div>
      <span className="field-hint">最小値から目標値までを半円で表します。空欄の最小値は 0 として扱います</span>
    </>
  );
}

export function GaugeDisplay({ widget, set }: FieldProps<GaugeWidget>) {
  return <CommonDisplay widget={widget} set={set} />;
}
