import { CalendarBlankIcon, HashIcon, TagIcon, TextAaIcon } from "@phosphor-icons/react";
import type { ColumnType } from "../core/types";

const ICONS = { number: HashIcon, date: CalendarBlankIcon, category: TagIcon, text: TextAaIcon } as const;

export function TypeIcon({ type, size = 16 }: { type: ColumnType; size?: number }) {
  const Icon = ICONS[type];
  return <Icon size={size} className="muted" aria-hidden style={{ flex: "none" }} />;
}
