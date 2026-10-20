import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
  label: string;
  width?: number;
}

/** Click-triggered popover anchored below its trigger. Closes on Escape or outside click. */
export function Popover({ open, onClose, trigger, children, align = "left", label, width }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        ref.current?.querySelector<HTMLElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    const first = panelRef.current?.querySelector<HTMLElement>("input, button, select");
    first?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div className="popover-anchor" ref={ref}>
      {trigger}
      {open && (
        <div ref={panelRef} className={`popover${align === "right" ? " align-right" : ""}`} role="dialog" aria-label={label} style={width ? { width } : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}
