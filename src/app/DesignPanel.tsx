import { ArrowCounterClockwiseIcon, CheckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { ACCENT_PRESETS, DEFAULT_THEME, PALETTES, SURFACES, accentIssue, isHex, paletteColors, paletteIssues, resolveTheme } from "../core/theme";
import type { PaletteName, SurfaceTheme, Theme } from "../core/types";
import { Dialog } from "./Dialog";
import { useApp } from "./store";

const SURFACE_OPTIONS: { id: SurfaceTheme; label: string }[] = [
  { id: "warm", label: "ウォーム" },
  { id: "white", label: "ホワイト" },
  { id: "dark", label: "ダーク" },
];

export function DesignPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dashboard = useApp((s) => s.dashboard);
  const update = useApp((s) => s.update);
  if (!dashboard) return null;
  const theme = resolveTheme(dashboard.theme);
  const surface = SURFACES[theme.surface];
  const surfaceHex = surface.vars["--surface"];
  const accent = theme.accent ?? surface.accent;
  const colors = paletteColors(theme);

  const set = (patch: Partial<Theme>, coalesce?: string) => update((d) => ({ ...d, theme: { ...resolveTheme(d.theme), ...patch } }), coalesce);

  const startCustom = () => set({ palette: "custom", customColors: theme.customColors.length === 8 ? theme.customColors : [...colors] });
  const setCustom = (i: number, c: string) => {
    const next = [...(theme.customColors.length === 8 ? theme.customColors : colors)];
    next[i] = c;
    set({ palette: "custom", customColors: next }, `custom:${i}`);
  };

  const accentWarning = accentIssue(accent, surfaceHex);
  const issues = theme.palette === "custom" ? paletteIssues(colors, surfaceHex) : [];
  const isDefault = JSON.stringify(theme) === JSON.stringify(DEFAULT_THEME);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="デザイン"
      variant="drawer"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => set({ ...DEFAULT_THEME })} disabled={isDefault}>
            <ArrowCounterClockwiseIcon size={18} aria-hidden />
            既定に戻す
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            完了
          </button>
        </>
      }
    >
      <div className="form-stack">
        <div className="field">
          <span className="field-label" id="surface-label">
            背景
          </span>
          <div className="surface-grid" role="radiogroup" aria-labelledby="surface-label">
            {SURFACE_OPTIONS.map((o) => {
              const v = SURFACES[o.id].vars;
              const selected = theme.surface === o.id;
              return (
                <button
                  type="button"
                  key={o.id}
                  role="radio"
                  aria-checked={selected}
                  className="surface-option"
                  onClick={() => set({ surface: o.id })}
                >
                  <span className="surface-preview" style={{ background: v["--bg-canvas"], borderColor: v["--border"] }}>
                    <span style={{ background: v["--surface"], borderColor: v["--border"] }}>
                      <i style={{ background: v["--text-secondary"] }} />
                      <i style={{ background: SURFACES[o.id].accent, width: "60%" }} />
                    </span>
                  </span>
                  <span className="surface-name">
                    {selected && <CheckIcon size={14} weight="bold" aria-hidden />}
                    {o.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <span className="field-label" id="accent-label">
            アクセント色
          </span>
          <div className="swatch-row" role="radiogroup" aria-labelledby="accent-label">
            <button
              type="button"
              role="radio"
              aria-checked={theme.accent === null}
              className="color-chip"
              title="背景に合わせた既定の色"
              onClick={() => set({ accent: null })}
            >
              <span className="color-dot" style={{ background: surface.accent }} />
              既定
            </button>
            {ACCENT_PRESETS.map((p) => (
              <button
                type="button"
                key={p.color}
                role="radio"
                aria-checked={theme.accent === p.color}
                aria-label={p.label}
                title={p.label}
                className="color-swatch-btn"
                style={{ background: p.color }}
                onClick={() => set({ accent: p.color })}
              >
                {theme.accent === p.color && <CheckIcon size={14} weight="bold" color="#fff" aria-hidden />}
              </button>
            ))}
            <label className="color-input" title="自由に選ぶ">
              <span className="visually-hidden">アクセント色を自由に選ぶ</span>
              <input type="color" value={isHex(accent) ? accent : "#9a5b45"} onChange={(e) => set({ accent: e.target.value }, "accent")} />
            </label>
          </div>
          <span className="field-hint">主なボタン、選択中の表示、タブの下線に使います</span>
          {accentWarning && <Warning text={accentWarning} />}
        </div>

        <div className="field">
          <span className="field-label" id="palette-label">
            グラフの配色
          </span>
          <div className="palette-list" role="radiogroup" aria-labelledby="palette-label">
            {(Object.keys(PALETTES) as Exclude<PaletteName, "custom">[]).map((id) => {
              const p = PALETTES[id];
              const cs = surface.dark ? p.dark : p.light;
              return (
                <button type="button" key={id} role="radio" aria-checked={theme.palette === id} className="palette-option" onClick={() => set({ palette: id })}>
                  <span className="palette-name">{p.label}</span>
                  <span className="palette-swatches" aria-hidden>
                    {cs.map((c) => (
                      <span key={c} style={{ background: c }} />
                    ))}
                  </span>
                </button>
              );
            })}
            <button type="button" role="radio" aria-checked={theme.palette === "custom"} className="palette-option" onClick={startCustom}>
              <span className="palette-name">カスタム</span>
              <span className="palette-swatches" aria-hidden>
                {(theme.customColors.length === 8 ? theme.customColors : colors).map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </span>
            </button>
          </div>
          <span className="field-hint">「落ち着いた色」と「はっきりした色」は、色の見え方に個人差があっても隣り合う色を見分けやすい組み合わせです</span>
          {theme.palette === "custom" && (
            <>
              <div className="custom-colors">
                {colors.map((c, i) => (
                  <label key={i} className="custom-color">
                    <input type="color" value={c} onChange={(e) => setCustom(i, e.target.value)} />
                    <span>{i + 1}</span>
                  </label>
                ))}
              </div>
              {issues.map((x) => (
                <Warning key={x.message} text={x.message} />
              ))}
            </>
          )}
        </div>

        <Segmented
          label="余白"
          value={theme.density}
          options={[
            ["comfortable", "ゆったり"],
            ["compact", "コンパクト"],
          ]}
          onChange={(density) => set({ density })}
        />
        <Segmented
          label="角の丸み"
          value={theme.radius}
          options={[
            ["standard", "標準"],
            ["small", "小さめ"],
            ["none", "なし"],
          ]}
          onChange={(radius) => set({ radius })}
        />
        <Segmented
          label="文字の大きさ"
          value={theme.fontSize}
          options={[
            ["standard", "標準"],
            ["large", "大きめ"],
          ]}
          onChange={(fontSize) => set({ fontSize })}
        />
        <div className="field">
          <span className="field-label">見分けやすさ</span>
          <label className="checkbox">
            <input type="checkbox" checked={!!theme.texture} onChange={(e) => set({ texture: e.target.checked })} />
            複数系列のグラフを模様と線の種類でも塗り分ける
          </label>
          <span className="field-hint">印刷するときは、この設定に関係なく模様を付けます</span>
        </div>
        <p className="field-hint">デザインは HTML の書き出しにも反映されます。各グラフの色は、ウィジェットの設定で変えられます。</p>
      </div>
    </Dialog>
  );
}

function Warning({ text }: { text: string }) {
  return (
    <p className="field-warning" role="status">
      <WarningCircleIcon size={16} aria-hidden />
      {text}
    </p>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const id = `seg-${label}`;
  return (
    <div className="field">
      <span className="field-label" id={id}>
        {label}
      </span>
      <div className="segmented" role="group" aria-labelledby={id}>
        {options.map(([v, l]) => (
          <button type="button" key={v} aria-pressed={value === v} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
