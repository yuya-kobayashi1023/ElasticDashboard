import { createContext, useContext, useMemo, type ReactNode } from "react";
import { setNumberStyle } from "../core/format";
import { chartFontSize, paletteColors, resolveTheme, SURFACES, themeVars } from "../core/theme";
import type { NumberStyle, Theme } from "../core/types";
import { TexturePatterns } from "./charts/Texture";

const ChartFontContext = createContext(12);
const NumberStyleContext = createContext<NumberStyle>("en");
const PaletteContext = createContext<string[]>([]);

export const useChartFont = () => useContext(ChartFontContext);
/** Current number style; consumers that memoize formatted output list it as a dependency. */
export const useNumberStyle = () => useContext(NumberStyleContext);
/** Resolved hex colors of the current palette (for swatches). */
export const usePalette = () => useContext(PaletteContext);

export function ThemeScope({ theme, children, className = "" }: { theme: Theme | undefined; children: ReactNode; className?: string }) {
  const t = resolveTheme(theme);
  // Set during render so charts below format with the right style on their first paint.
  setNumberStyle(t.numberStyle);
  const vars = useMemo(() => themeVars(t), [JSON.stringify(t)]); // eslint-disable-line react-hooks/exhaustive-deps
  const palette = useMemo(() => paletteColors(t), [JSON.stringify(t)]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ChartFontContext.Provider value={chartFontSize(t)}>
      <NumberStyleContext.Provider value={t.numberStyle ?? "en"}>
        <PaletteContext.Provider value={palette}>
          <div className={`theme-root${SURFACES[t.surface].dark ? " is-dark" : ""}${t.texture ? " use-texture" : ""} ${className}`} style={vars as React.CSSProperties}>
            <TexturePatterns />
            {children}
          </div>
        </PaletteContext.Provider>
      </NumberStyleContext.Provider>
    </ChartFontContext.Provider>
  );
}
