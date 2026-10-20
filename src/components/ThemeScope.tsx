import { createContext, useContext, useMemo, type ReactNode } from "react";
import { chartFontSize, paletteColors, resolveTheme, SURFACES, themeVars } from "../core/theme";
import type { Theme } from "../core/types";
import { TexturePatterns } from "./charts/Texture";

const ChartFontContext = createContext(12);
const PaletteContext = createContext<string[]>([]);

export const useChartFont = () => useContext(ChartFontContext);
/** Resolved hex colors of the current palette (for swatches). */
export const usePalette = () => useContext(PaletteContext);

export function ThemeScope({ theme, children, className = "" }: { theme: Theme | undefined; children: ReactNode; className?: string }) {
  const t = resolveTheme(theme);
  const vars = useMemo(() => themeVars(t), [JSON.stringify(t)]); // eslint-disable-line react-hooks/exhaustive-deps
  const palette = useMemo(() => paletteColors(t), [JSON.stringify(t)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ChartFontContext.Provider value={chartFontSize(t)}>
      <PaletteContext.Provider value={palette}>
        <div className={`theme-root${SURFACES[t.surface].dark ? " is-dark" : ""}${t.texture ? " use-texture" : ""} ${className}`} style={vars as React.CSSProperties}>
          <TexturePatterns />
          {children}
        </div>
      </PaletteContext.Provider>
    </ChartFontContext.Provider>
  );
}
