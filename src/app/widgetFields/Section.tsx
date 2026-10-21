import { CaretRightIcon } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

const KEY = "ed-widget-section:";

function readOpen(name: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(KEY + name);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

/** Collapsible group of settings; the open state is remembered per section name. */
export function Section({ name, title, defaultOpen = false, children }: { name: string; title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => readOpen(name, defaultOpen));
  return (
    <details
      className="editor-section"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        if (next === open) return;
        setOpen(next);
        try {
          localStorage.setItem(KEY + name, next ? "1" : "0");
        } catch {
          // storage unavailable: the state just is not remembered
        }
      }}
    >
      <summary>
        <CaretRightIcon size={14} weight="bold" className="editor-section-caret" aria-hidden />
        {title}
      </summary>
      <div className="form-stack editor-section-body">{children}</div>
    </details>
  );
}
