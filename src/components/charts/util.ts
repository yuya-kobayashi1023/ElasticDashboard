import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { niceStep } from "../../core/aggregate";

export const SERIES_COLORS = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
/** De-emphasis gray for the "Other" bucket. */
export const OTHER_COLOR = "var(--other)";

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Chart height that follows the viewport height: `ratio` of the window, clamped to [min, max]. */
export function useChartHeight(ratio: number, min: number, max: number): number {
  const calc = () => Math.round(Math.min(max, Math.max(min, (typeof window === "undefined" ? 800 : window.innerHeight) * ratio)));
  const [h, setH] = useState(calc);
  useEffect(() => {
    const onResize = () => setH(calc());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio, min, max]);
  return h;
}

/** Approximate rendered width of 12px UI text. */
export function textWidth(s: string, size = 12): number {
  let w = 0;
  for (const ch of s) w += /[\u0000-ÿ]/.test(ch) ? size * 0.6 : size;
  return w;
}

export function truncate(s: string, maxWidth: number, size = 12): string {
  if (textWidth(s, size) <= maxWidth) return s;
  let out = "";
  for (const ch of s) {
    if (textWidth(out + ch + "…", size) > maxWidth) break;
    out += ch;
  }
  return out + "…";
}

export function niceTicks(min: number, max: number, target = 5): number[] {
  if (min === max) {
    if (min === 0) return [0, 1];
    [min, max] = min > 0 ? [0, max] : [min, 0];
  }
  const step = niceStep(max - min, target);
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

export function linear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * k;
}

/** Horizontal bar: square at the baseline (x0), 4px rounded at the data end (x1). */
export function hBarPath(x0: number, x1: number, y: number, h: number): string {
  const w = Math.abs(x1 - x0);
  const r = Math.min(4, w, h / 2);
  if (w < 0.5) return "";
  if (x1 >= x0) {
    return `M${x0},${y}H${x1 - r}A${r},${r} 0 0 1 ${x1},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x1 - r},${y + h}H${x0}Z`;
  }
  return `M${x0},${y}H${x1 + r}A${r},${r} 0 0 0 ${x1},${y + r}V${y + h - r}A${r},${r} 0 0 0 ${x1 + r},${y + h}H${x0}Z`;
}

/** Vertical column: square at the baseline (y0), rounded at the top (y1) when `round`. */
export function vBarPath(x: number, w: number, y0: number, y1: number, round = true): string {
  const h = Math.abs(y0 - y1);
  if (h < 0.5) return "";
  const r = round ? Math.min(4, h, w / 2) : 0;
  if (y1 <= y0) {
    return `M${x},${y0}V${y1 + r}A${r},${r} 0 0 1 ${x + r},${y1}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y1 + r}V${y0}Z`;
  }
  return `M${x},${y0}V${y1 - r}A${r},${r} 0 0 0 ${x + r},${y1}H${x + w - r}A${r},${r} 0 0 0 ${x + w},${y1 - r}V${y0}Z`;
}

export function clampTooltip(x: number, width: number, tipWidth = 220): number {
  return Math.max(0, Math.min(x + 14, width - tipWidth));
}
