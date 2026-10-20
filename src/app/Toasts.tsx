import { CheckCircleIcon, InfoIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useToasts } from "./store";

const ICON = { success: CheckCircleIcon, info: InfoIcon, error: WarningCircleIcon } as const;

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <Icon size={20} weight={t.tone === "error" ? "fill" : "regular"} aria-hidden className="toast-icon" />
            <span className="toast-msg">{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="icon-btn" aria-label="通知を閉じる" onClick={() => dismiss(t.id)}>
              <XIcon size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
