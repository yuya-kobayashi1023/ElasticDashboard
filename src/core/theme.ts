import type { PaletteName, SurfaceTheme, Theme } from "./types";

export const DEFAULT_THEME: Theme = {
  surface: "warm",
  accent: null,
  palette: "calm",
  customColors: [],
  density: "comfortable",
  radius: "standard",
  fontSize: "standard",
  texture: false,
  numberStyle: "en",
};

export function resolveTheme(t: Theme | undefined): Theme {
  const r = { ...DEFAULT_THEME, ...t };
  if (!r.numberStyle) r.numberStyle = "en";
  return r;
}

interface SurfaceTokens {
  dark: boolean;
  accent: string;
  vars: Record<string, string>;
}

/** Surface token sets. Text/surface pairs keep WCAG AA contrast. */
export const SURFACES: Record<SurfaceTheme, SurfaceTokens> = {
  warm: {
    dark: false,
    accent: "#9a5b45",
    vars: {
      "--bg-canvas": "#f7f4ef",
      "--bg-subtle": "#f1ece4",
      "--surface": "#fffcf7",
      "--surface-glass": "rgba(255, 252, 247, 0.78)",
      "--text-primary": "#2b2926",
      "--text-secondary": "#6f685f",
      "--border": "#ded6cb",
      "--border-strong": "#c9bfb3",
      "--grid": "#ebe4da",
      "--baseline": "#c9bfb3",
      "--zebra": "rgba(241, 236, 228, 0.45)",
      "--other": "#a89e92",
    },
  },
  white: {
    dark: false,
    accent: "#3e5c8a",
    vars: {
      "--bg-canvas": "#f4f5f7",
      "--bg-subtle": "#eceef1",
      "--surface": "#ffffff",
      "--surface-glass": "rgba(255, 255, 255, 0.8)",
      "--text-primary": "#22252a",
      "--text-secondary": "#5d636c",
      "--border": "#dcdfe4",
      "--border-strong": "#c4c9d0",
      "--grid": "#e8ebef",
      "--baseline": "#c4c9d0",
      "--zebra": "rgba(236, 238, 241, 0.5)",
      "--other": "#a3a8b0",
    },
  },
  dark: {
    dark: true,
    accent: "#d08a6e",
    vars: {
      "--bg-canvas": "#1a1816",
      "--bg-subtle": "#2a2622",
      "--surface": "#23201d",
      "--surface-glass": "rgba(35, 32, 29, 0.85)",
      "--text-primary": "#eeeae4",
      "--text-secondary": "#b3aba1",
      "--border": "#3a3530",
      "--border-strong": "#544d46",
      "--grid": "#322e2a",
      "--baseline": "#544d46",
      "--zebra": "rgba(255, 255, 255, 0.03)",
      "--other": "#7d756c",
      "--success-fg": "#8fc29b",
      "--success-bg": "#22302a",
      "--warning-fg": "#e0b071",
      "--warning-bg": "#352b1d",
      "--danger-fg": "#e8968f",
      "--danger-bg": "#3a2523",
      "--info-fg": "#9db9c6",
      "--info-bg": "#1f2c32",
    },
  },
};

/**
 * Categorical palettes. Every light/dark set passed the dataviz validator (lightness band, chroma,
 * adjacent CVD and normal-vision separation) on its surface; the first three also pass all-pairs.
 */
export const PALETTES: Record<Exclude<PaletteName, "custom">, { label: string; light: string[]; dark: string[] }> = {
  calm: {
    label: "落ち着いた色",
    light: ["#b4583a", "#4a6fc0", "#12907a", "#c98a0e", "#a9529a", "#6e8f1e", "#7e6bc4", "#946620"],
    dark: ["#c8694b", "#5e80cf", "#1e9c82", "#be8a1c", "#b5609f", "#779630", "#8673cf", "#a77a35"],
  },
  vivid: {
    label: "はっきりした色",
    light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
    dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
  },
};

export const ACCENT_PRESETS = [
  { label: "テラコッタ", color: "#9a5b45" },
  { label: "ネイビー", color: "#3e5c8a" },
  { label: "グリーン", color: "#4f7a5a" },
  { label: "プラム", color: "#7a4f78" },
  { label: "チャコール", color: "#4a4744" },
];

export function paletteColors(t: Theme): string[] {
  const dark = SURFACES[t.surface].dark;
  if (t.palette === "custom" && t.customColors.length === 8) return t.customColors;
  const p = PALETTES[t.palette === "custom" ? "calm" : t.palette];
  return dark ? p.dark : p.light;
}

// ---------- Color math ----------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => {
  const v = Math.max(0, Math.min(1, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};

function rgbToHex([r, g, b]: number[]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function oklab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Perceptual distance in OKLab ×100 (same scale as the dataviz validator). */
export function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}

/** Mixes two colors in linear RGB. t = 0 → a, 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a).map(toLinear);
  const cb = hexToRgb(b).map(toLinear);
  return rgbToHex(ca.map((v, i) => toSrgb(v + (cb[i] - v) * t)));
}

export function isHex(s: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(s);
}

export interface PaletteIssue {
  message: string;
}

/** Plain checks users can act on: neighbours that look alike and colors that fade into the surface. */
export function paletteIssues(colors: string[], surface: string): PaletteIssue[] {
  const issues: PaletteIssue[] = [];
  colors.forEach((c, i) => {
    if (!isHex(c)) return;
    if (contrastRatio(c, surface) < 3) issues.push({ message: `${i + 1} 番目の色は背景との差が小さく、見えにくくなります` });
  });
  for (let i = 0; i + 1 < colors.length; i++) {
    if (isHex(colors[i]) && isHex(colors[i + 1]) && deltaE(colors[i], colors[i + 1]) < 15) {
      issues.push({ message: `${i + 1} 番目と ${i + 2} 番目の色が似ていて、見分けにくくなります` });
    }
  }
  return issues;
}

export function accentIssue(accent: string, surface: string): string | null {
  return contrastRatio(accent, surface) < 3 ? "背景との差が小さく、ボタンや選択中の表示が見えにくくなります" : null;
}

const RADIUS = { standard: ["10px", "12px"], small: ["6px", "8px"], none: ["0px", "0px"] } as const;

/** CSS custom properties for a dashboard theme. Applied on the dashboard's root element. */
export function themeVars(theme: Theme): Record<string, string> {
  const t = resolveTheme(theme);
  const s = SURFACES[t.surface];
  const surface = s.vars["--surface"];
  const accent = t.accent && isHex(t.accent) ? t.accent : s.accent;
  const onAccent = contrastRatio("#ffffff", accent) >= contrastRatio("#1d1b19", accent) ? "#ffffff" : "#1d1b19";
  const vars: Record<string, string> = {
    ...s.vars,
    "--action": accent,
    "--action-hover": s.dark ? mix(accent, "#ffffff", 0.12) : mix(accent, "#000000", 0.14),
    "--action-soft": mix(surface, accent, s.dark ? 0.22 : 0.16),
    "--text-inverse": onAccent,
    "--radius-control": RADIUS[t.radius][0],
    "--radius-card": RADIUS[t.radius][1],
    "--gap": t.density === "compact" ? "12px" : "18px",
    "--widget-pad": t.density === "compact" ? "14px" : "18px",
    "--fs-chart": t.fontSize === "large" ? "13px" : "12px",
    "--fs-widget-title": t.fontSize === "large" ? "16px" : "15px",
    "--fs-table": t.fontSize === "large" ? "14px" : "13px",
    "--fs-kpi": t.fontSize === "large" ? "34px" : "30px",
    "--tex-ink": s.dark ? "rgba(255, 255, 255, 0.45)" : "rgba(30, 25, 20, 0.4)",
  };
  paletteColors(t).forEach((c, i) => (vars[`--series-${i + 1}`] = c));
  return vars;
}

export function chartFontSize(theme: Theme | undefined): number {
  return resolveTheme(theme).fontSize === "large" ? 13 : 12;
}
