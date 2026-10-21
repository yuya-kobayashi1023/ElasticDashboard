import { useMemo, useState } from "react";
import { previewParse } from "../core/previewParse";
import { FALSE_WORDS, TRUE_WORDS } from "../core/parsers";
import type { ColumnMeta, ColumnParse, RawTable } from "../core/types";
import { Dialog } from "./Dialog";
import { useApp } from "./store";

const DATE_FORMATS: [NonNullable<ColumnParse["dateFormat"]>, string][] = [
  ["auto", "自動"],
  ["ymd", "年月日（2024/03/05）"],
  ["mdy", "月日年（03/05/2024）"],
  ["dmy", "日月年（05/03/2024）"],
  ["unix-s", "Unix 時間（秒）"],
  ["unix-ms", "Unix 時間（ミリ秒）"],
  ["excel", "Excel のシリアル値"],
  ["pattern", "パターンを指定"],
];
const TIME_FORMATS: [NonNullable<ColumnParse["timeFormat"]>, string][] = [
  ["auto", "自動"],
  ["hm", "時:分（秒は 00 とみなす）"],
  ["hms", "時:分:秒"],
  ["pattern", "パターンを指定"],
];
const DURATION_UNITS: [NonNullable<ColumnParse["durationUnit"]>, string][] = [
  ["ms", "ミリ秒"],
  ["s", "秒"],
  ["min", "分"],
  ["h", "時間"],
  ["d", "日"],
];
const PATTERN_HINT = "YYYY=年 MM=月 DD=日 hh=時 mm=分 ss=秒（M・D・h・m・s は 1 桁も可）。それ以外の文字はそのまま一致させます。";

const splitList = (s: string) =>
  s
    .split(/[,、，]/)
    .map((x) => x.trim())
    .filter(Boolean);

/** Comma-separated list input that keeps its own draft so typing a trailing comma works. */
function ListInput({ id, value, placeholder, onChange }: { id: string; value: string[] | undefined; placeholder: string; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState((value ?? []).join(", "));
  return (
    <input
      id={id}
      className="input"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(splitList(e.target.value));
      }}
    />
  );
}

interface Props {
  open: boolean;
  /** Key of the column being edited; the live column is read from the store. */
  columnKey: string | null;
  raw: RawTable;
  onClose: () => void;
}

/** Conversion options ("解釈") of one column, with a live preview of what they do to the data. */
export function ParseDialog({ open, columnKey, raw, onClose }: Props) {
  const column = useApp((s) => s.dashboard?.columns.find((c) => c.key === columnKey));
  return (
    <Dialog open={open} onClose={onClose} title={column ? `${column.label} の解釈` : "解釈"} width={520}>
      {column && <ParseForm column={column} raw={raw} />}
    </Dialog>
  );
}

function ParseForm({ column: c, raw }: { column: ColumnMeta; raw: RawTable }) {
  const update = useApp((s) => s.update);
  const p = c.parse ?? {};
  const set = (next: Partial<ColumnParse>, coalesce?: string) => {
    const merged: ColumnParse = { ...p, ...next };
    for (const k of Object.keys(merged) as (keyof ColumnParse)[]) if (merged[k] === undefined) delete merged[k];
    update((d) => ({ ...d, columns: d.columns.map((x) => (x.key === c.key ? { ...x, parse: Object.keys(merged).length ? merged : undefined } : x)) }), coalesce);
  };
  const reset = () => update((d) => ({ ...d, columns: d.columns.map((x) => (x.key === c.key ? { ...x, parse: x.inferredParse } : x)) }));
  const colIndex = raw.headers.indexOf(c.key);
  const preview = useMemo(() => previewParse(raw, colIndex, c), [raw, colIndex, c.type, c.parse, c.dateUnit, c.format]);
  const id = (n: string) => `parse-${n}-${c.key}`;
  const same = JSON.stringify(c.parse ?? null) === JSON.stringify(c.inferredParse ?? null);

  const scaleField = (hint: string) => (
    <div className="field">
      <label className="field-label" htmlFor={id("scale")}>
        倍率
      </label>
      <input
        id={id("scale")}
        className="input"
        type="number"
        inputMode="decimal"
        placeholder="1"
        value={p.scale ?? ""}
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Number(e.target.value);
          set({ scale: n !== undefined && Number.isFinite(n) && n !== 0 ? n : undefined }, `scale:${c.key}`);
        }}
      />
      <span className="field-hint">{hint}</span>
    </div>
  );

  const patternField = (value: string | undefined) => (
    <div className="field">
      <label className="field-label" htmlFor={id("pattern")}>
        パターン
      </label>
      <input id={id("pattern")} className="input" placeholder="YYYY/MM/DD hh:mm" value={value ?? ""} onChange={(e) => set({ pattern: e.target.value || undefined }, `pattern:${c.key}`)} />
      <span className="field-hint">{PATTERN_HINT}</span>
    </div>
  );

  const selectField = <T extends string>(name: string, label: string, value: T, options: [T, string][], onChange: (v: T) => void) => (
    <div className="field">
      <label className="field-label" htmlFor={id(name)}>
        {label}
      </label>
      <select id={id(name)} className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );

  let fields: React.ReactNode;
  switch (c.type) {
    case "number":
      fields = (
        <>
          <label className="checkbox">
            <input type="checkbox" checked={!!p.decimalComma} onChange={(e) => set({ decimalComma: e.target.checked || undefined })} />
            小数点にカンマを使う（1.234,5）
          </label>
          {scaleField("例: 1000 にすると、千円単位の値を円にします。")}
        </>
      );
      break;
    case "date": {
      const f = p.dateFormat ?? "auto";
      fields = (
        <>
          {selectField("datefmt", "日付の書き方", f, DATE_FORMATS, (v) => set({ dateFormat: v === "auto" ? undefined : v }))}
          {f === "pattern" && patternField(p.pattern)}
        </>
      );
      break;
    }
    case "time": {
      const f = p.timeFormat ?? "auto";
      fields = (
        <>
          {selectField("timefmt", "時刻の書き方", f, TIME_FORMATS, (v) => set({ timeFormat: v === "auto" ? undefined : v }))}
          {f === "pattern" && patternField(p.pattern)}
        </>
      );
      break;
    }
    case "duration":
      fields = (
        <>
          {selectField("unit", "数値だけの値の単位", p.durationUnit ?? "s", DURATION_UNITS, (v) => set({ durationUnit: v === "s" ? undefined : v }))}
          {selectField(
            "colon",
            "「12:34」の意味",
            p.durationColon ?? "hm",
            [
              ["hm", "時間:分"],
              ["ms", "分:秒"],
            ],
            (v) => set({ durationColon: v === "hm" ? undefined : v }),
          )}
          {scaleField("例: 2 にすると、読み取った時間を 2 倍にします。")}
        </>
      );
      break;
    case "boolean":
      fields = (
        <>
          <div className="field">
            <label className="field-label" htmlFor={id("true")}>
              「はい」とみなす値
            </label>
            <ListInput id={id("true")} value={p.trueValues} placeholder="例: 継続, OK" onChange={(v) => set({ trueValues: v.length ? v : undefined })} />
            <span className="field-hint">カンマ区切り。最初から対応: {[...TRUE_WORDS].join("、")}</span>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={id("false")}>
              「いいえ」とみなす値
            </label>
            <ListInput id={id("false")} value={p.falseValues} placeholder="例: 解約, NG" onChange={(v) => set({ falseValues: v.length ? v : undefined })} />
            <span className="field-hint">カンマ区切り。最初から対応: {[...FALSE_WORDS].join("、")}</span>
          </div>
        </>
      );
      break;
    default:
      fields = (
        <>
          <label className="checkbox">
            <input type="checkbox" checked={p.trim !== false} onChange={(e) => set({ trim: e.target.checked ? undefined : false })} />
            前後の空白を除く
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={!!p.widthNormalize} onChange={(e) => set({ widthNormalize: e.target.checked || undefined })} />
            全角英数字を半角にする
          </label>
          {selectField(
            "case",
            "大文字・小文字",
            p.letterCase ?? "none",
            [
              ["none", "そのまま"],
              ["upper", "大文字にそろえる"],
              ["lower", "小文字にそろえる"],
            ],
            (v) => set({ letterCase: v === "none" ? undefined : v }),
          )}
        </>
      );
  }

  return (
    <div className="form-stack">
      <p className="field-hint">{c.type !== c.inferredType ? "種類: 手動で変更" : c.inferredReason ? `自動判定: ${c.inferredReason}` : ""}</p>
      {fields}
      <section className="parse-preview" aria-label="変換の確認" aria-live="polite">
        <h3 className="field-label">変換の確認</h3>
        {preview.samples.length === 0 ? (
          <p className="field-hint">確認できる値がありません。</p>
        ) : (
          <ul>
            {preview.samples.map((s) => (
              <li key={s.raw}>
                <span className="parse-raw">{s.raw}</span>
                <span aria-hidden>→</span>
                <span className={s.ok ? undefined : "danger-text"}>{s.shown}</span>
              </li>
            ))}
          </ul>
        )}
        {preview.invalid > 0 ? (
          <p className="badge badge-warning">変換できない値 {preview.invalid.toLocaleString("ja-JP")} 件（{preview.checked.toLocaleString("ja-JP")} 件中）</p>
        ) : (
          <p className="field-hint">変換できない値はありません（{preview.checked.toLocaleString("ja-JP")} 件を確認）</p>
        )}
      </section>
      <div>
        <button type="button" className="btn btn-sm" onClick={reset} disabled={same}>
          自動に戻す
        </button>
      </div>
    </div>
  );
}
