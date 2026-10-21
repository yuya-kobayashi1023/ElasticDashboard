import { CalendarBlankIcon, ClockIcon, HashIcon, TagIcon, TextAaIcon, TimerIcon, ToggleLeftIcon } from "@phosphor-icons/react";
import type { ColumnType } from "../core/types";

const ICONS = { number: HashIcon, date: CalendarBlankIcon, time: ClockIcon, duration: TimerIcon, boolean: ToggleLeftIcon, category: TagIcon, text: TextAaIcon } as const;

export function TypeIcon({ type, size = 16 }: { type: ColumnType; size?: number }) {
  const Icon = ICONS[type];
  return <Icon size={size} className="muted" aria-hidden style={{ flex: "none" }} />;
}
