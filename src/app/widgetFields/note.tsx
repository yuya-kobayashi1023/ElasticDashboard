import type { NoteWidget } from "../../core/types";
import type { FieldProps } from "./shared";

export function NoteData({ widget, set }: FieldProps<NoteWidget>) {
  return (
    <label className="field">
      <span className="field-label">メモの内容</span>
      <textarea className="textarea" rows={8} value={widget.text} onChange={(e) => set({ text: e.target.value }, `text:${widget.id}`)} />
      <span className="field-hint">「# 」で大見出し、「## 」で小見出し、「- 」で箇条書き、**太字**、空行で段落を分けられます</span>
    </label>
  );
}
