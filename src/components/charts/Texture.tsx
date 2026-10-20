/**
 * Backup channel for series identity when color is not enough (print, forced colors, or the theme's
 * "模様で塗り分ける" setting): diagonal line fills at 45° / 135° and dashed line styles.
 * The overlays are always rendered and shown by CSS, so printing works without a re-render.
 */

const SPACING = [4, 6, 8, 10];

/** Pattern definitions, rendered once per themed page. */
export function TexturePatterns() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        {Array.from({ length: 9 }, (_, i) => {
          const gap = SPACING[Math.floor(i / 2) % SPACING.length];
          return (
            <pattern key={i} id={`tex-${i}`} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${i % 2 === 0 ? 45 : 135})`}>
              <line x1="0" y1="0" x2="0" y2={gap} stroke="var(--tex-ink)" strokeWidth={1.5} />
            </pattern>
          );
        })}
      </defs>
    </svg>
  );
}

/** Pattern overlay for a filled mark. */
export function TexOverlay({ d, index }: { d: string; index: number }) {
  return <path className="tex" d={d} fill={`url(#tex-${index % 9})`} pointerEvents="none" />;
}

/** Legend swatch that carries the same pattern or line style as the mark. */
export function SeriesSwatch({ color, index, kind }: { color: string; index: number; kind: "fill" | "line" | "point" }) {
  if (kind === "line") {
    return (
      <svg className="swatch-svg" width="18" height="10" aria-hidden>
        <line className={`series-line s-${index % 8}`} x1="1" y1="5" x2="17" y2="5" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "point") {
    return (
      <svg className="swatch-svg" width="12" height="12" aria-hidden>
        <path d={markerPath(6, 6, 5, index)} fill={color} />
      </svg>
    );
  }
  return (
    <svg className="swatch-svg" width="12" height="12" aria-hidden>
      <rect width="12" height="12" rx="3" fill={color} />
      <rect className="tex" width="12" height="12" rx="3" fill={`url(#tex-${index % 9})`} />
    </svg>
  );
}

/** Marker shapes for scatter groups: circle, square, diamond, triangle. */
export function markerPath(cx: number, cy: number, r: number, shape: number): string {
  switch (shape % 4) {
    case 0:
      return `M${cx - r},${cy}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0Z`;
    case 1: {
      const s = r * 0.88;
      return `M${cx - s},${cy - s}H${cx + s}V${cy + s}H${cx - s}Z`;
    }
    case 2: {
      const s = r * 1.2;
      return `M${cx},${cy - s}L${cx + s},${cy}L${cx},${cy + s}L${cx - s},${cy}Z`;
    }
    default: {
      const s = r * 1.15;
      return `M${cx},${cy - s}L${cx + s},${cy + s * 0.8}H${cx - s}Z`;
    }
  }
}
