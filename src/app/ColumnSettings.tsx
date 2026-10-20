import { ArrowCounterClockwiseIcon, CalculatorIcon, TreeStructureIcon, EyeIcon, EyeSlashIcon, MagicWandIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { describeDerived, lookupKeys } from "../core/derive";
import { DerivedDialog } from "./DerivedDialog";
import { LookupDialog } from "./LookupDialog";
import { autoFilters, autoWidgets } from "../core/autoDashboard";
import { buildFrame, columnStats } from "../core/frame";
import { columnLabel, formatNumber, TYPE_LABEL } from "../core/format";
import type { ColumnMeta, ColumnType, Lookup, NumberFormat, RawTable } from "../core/types";
import { TypeIcon } from "../components/TypeIcon";
import { useApp, useToasts } from "./store";

const count = new Intl.NumberFormat("ja-JP");
const TYPES: ColumnType[] = ["number", "date", "category", "text"];

export function ColumnSettings({ raw }: { raw: RawTable }) {
  const dashboard = useApp((s) => s.dashboard)!;
  const update = useApp((s) => s.update);
  const present = new Set(raw.headers);
  const typeKey = dashboard.columns.map((c) => `${c.key}:${c.type}:${c.derived ? JSON.stringify(c.derived) : ""}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const frame = useMemo(() => buildFrame(raw, dashboard.columns, dashboard.lookups), [raw, typeKey, dashboard.lookups]);
  const stats = useMemo(
    () =>
      new Map(
        dashboard.columns.map((c) => {
          if (!c.derived) return [c.key, columnStats(raw, c)];
          // Calculated columns: describe the computed values.
          const col = frame.columns.get(c.key);
          let blank = 0;
          const seen = new Set<string>();
          const samples: string[] = [];
          if (col) {
            for (let i = 0; i < frame.rowCount; i++) {
              const v = col.values[i];
              const text = typeof v === "number" ? (Number.isNaN(v) ? null : formatNumber(v, c)) : v;
              if (text === null) {
                blank++;
                continue;
              }
              if (seen.size < 100000) seen.add(text);
              if (samples.length < 3 && !samples.includes(text)) samples.push(text);
            }
          }
          return [c.key, { blank, distinct: seen.size, invalid: 0, samples }];
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, frame, typeKey],
  );
  const [derivedOpen, setDerivedOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [editingLookup, setEditingLookup] = useState<Lookup | null>(null);
  const openLookup = (l: Lookup | null) => {
    setEditingLookup(l);
    setLookupOpen(true);
  };
  const unjoin = (l: Lookup) => {
    const removed = dashboard.columns.filter((c) => c.derived?.kind === "lookup" && c.derived.lookupId === l.id);
    update((d) => ({
      ...d,
      lookups: d.lookups?.filter((x) => x.id !== l.id),
      columns: d.columns.filter((c) => !(c.derived?.kind === "lookup" && c.derived.lookupId === l.id)),
    }));
    useToasts.getState().push({
      tone: "info",
      message: `「${l.fileName}」の結合を解除しました（${removed.map((c) => c.label).join("、")} を削除）`,
      action: { label: "元に戻す", run: () => useApp.getState().undo() },
    });
  };
  const [editingDerived, setEditingDerived] = useState<ColumnMeta | null>(null);
  const openDerived = (c: ColumnMeta | null) => {
    setEditingDerived(c);
    setDerivedOpen(true);
  };

  const patch = (key: string, p: Partial<ColumnMeta>, coalesce?: string) =>
    update((d) => ({ ...d, columns: d.columns.map((c) => (c.key === key ? { ...c, ...p } : c)) }), coalesce);
  const patchFormat = (c: ColumnMeta, p: Partial<NumberFormat>, coalesce?: string) => patch(c.key, { format: { ...c.format, ...p } }, coalesce);

  const hiddenCount = dashboard.columns.filter((c) => c.hidden).length;

  const regenerate = () => {
    const frame = buildFrame(raw, dashboard.columns, dashboard.lookups);
    update((d) => ({ ...d, widgets: autoWidgets(d.columns, frame), filters: autoFilters(d.columns, frame) }));
    useApp.getState().setView("dashboard");
    useToasts.getState().push({
      tone: "success",
      message: "現在の列の設定でレイアウトを作り直しました",
      action: { label: "元に戻す", run: () => useApp.getState().undo() },
    });
  };

  return (
    <div className="columns-page">
      <div className="toolbar">
        <span className="muted">
          {dashboard.columns.length} 列{hiddenCount > 0 ? ` ・ ${hiddenCount} 列を非表示` : ""}
        </span>
        <div className="toolbar-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => update((d) => ({ ...d, columns: d.columns.map((c) => ({ ...c, hidden: false })) }))}
            disabled={hiddenCount === 0}
          >
            <EyeIcon size={16} aria-hidden />
            すべて表示
          </button>
          <button type="button" className="btn btn-sm" onClick={() => openDerived(null)}>
            <CalculatorIcon size={16} aria-hidden />
            計算列を追加
          </button>
          <button type="button" className="btn btn-sm" onClick={() => openLookup(null)}>
            <TreeStructureIcon size={16} aria-hidden />
            マスタを結合
          </button>
          <button type="button" className="btn btn-sm" onClick={regenerate}>
            <MagicWandIcon size={16} aria-hidden />
            レイアウトを自動で作り直す
          </button>
        </div>
      </div>

      {!!dashboard.lookups?.length && (
        <section className="lookup-list" aria-label="結合したマスタ">
          <h3 className="lookup-list-title">結合したマスタ</h3>
          <ul>
            {dashboard.lookups.map((l) => {
              const cols = dashboard.columns.filter((c) => c.derived?.kind === "lookup" && c.derived.lookupId === l.id);
              return (
                <li key={l.id}>
                  <TreeStructureIcon size={18} aria-hidden className="muted" />
                  <span className="lookup-name">{l.fileName}</span>
                  <span className="muted lookup-meta">
                    {lookupKeys(l)
                      .local.map((k) => columnLabel(dashboard.columns, k))
                      .join(" + ")}
                    で結合 ・ {cols.map((c) => c.label).join("、")}
                  </span>
                  <span className="lookup-actions">
                    <button type="button" className="btn btn-sm" onClick={() => openLookup(l)}>
                      更新
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost danger-text" onClick={() => unjoin(l)}>
                      結合を解除
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="table-wrap col-table-wrap">
        <table className="data-table col-table">
          <thead>
            <tr>
              <th scope="col">表示</th>
              <th scope="col">列名</th>
              <th scope="col">種類</th>
              <th scope="col">数値の表記</th>
              <th scope="col">内容</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.columns.map((c) => {
              const s = stats.get(c.key);
              const missing = !c.derived && !present.has(c.key);
              const error = frame.errors.get(c.key);
              return (
                <tr key={c.key} className={c.hidden ? "is-hidden-col" : undefined}>
                  <td>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-pressed={!c.hidden}
                      aria-label={`${c.label}を${c.hidden ? "表示する" : "非表示にする"}`}
                      title={c.hidden ? "非表示" : "表示中"}
                      onClick={() => patch(c.key, { hidden: !c.hidden })}
                    >
                      {c.hidden ? <EyeSlashIcon size={18} /> : <EyeIcon size={18} weight="duotone" color="var(--action)" />}
                    </button>
                  </td>
                  <td>
                    <label className="visually-hidden" htmlFor={`label-${c.key}`}>
                      {c.derived ? c.label : c.key} の表示名
                    </label>
                    <input
                      id={`label-${c.key}`}
                      className="input input-sm"
                      value={c.label}
                      onChange={(e) => patch(c.key, { label: e.target.value }, `label:${c.key}`)}
                      onBlur={(e) => {
                        if (e.target.value.trim() === "") patch(c.key, { label: c.derived ? "計算列" : c.key });
                      }}
                    />
                    {c.derived ? (
                      <div className="cell-caption">
                        {c.derived.kind === "lookup" ? "マスタ" : "計算列"}: {describeDerived(c, dashboard.columns, dashboard.lookups)}
                      </div>
                    ) : (
                      c.label !== c.key && <div className="cell-caption">元の列名: {c.key}</div>
                    )}
                  </td>
                  <td>
                    <div className="type-cell">
                      <TypeIcon type={c.type} />
                      <label className="visually-hidden" htmlFor={`type-${c.key}`}>
                        {c.label} の種類
                      </label>
                      <select
                        id={`type-${c.key}`}
                        className="select select-sm"
                        value={c.type}
                        disabled={!!c.derived}
                        onChange={(e) => patch(c.key, { type: e.target.value as ColumnType })}
                      >
                        {TYPES.map((t) => (
                          <option key={t} value={t}>
                            {TYPE_LABEL[t]}
                            {t === c.inferredType ? "（自動判定）" : ""}
                          </option>
                        ))}
                      </select>
                      {c.type !== c.inferredType && (
                        <button type="button" className="icon-btn" aria-label="自動判定に戻す" title="自動判定に戻す" onClick={() => patch(c.key, { type: c.inferredType })}>
                          <ArrowCounterClockwiseIcon size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                  <td>
                    {c.type === "number" ? (
                      <div className="format-cell">
                        <input
                          className="input input-sm"
                          aria-label={`${c.label} の前に付ける記号`}
                          placeholder="例: ¥"
                          value={c.format.prefix}
                          onChange={(e) => patchFormat(c, { prefix: e.target.value }, `prefix:${c.key}`)}
                        />
                        <input
                          className="input input-sm"
                          aria-label={`${c.label} の後に付ける単位`}
                          placeholder="例: 円"
                          value={c.format.suffix}
                          onChange={(e) => patchFormat(c, { suffix: e.target.value }, `suffix:${c.key}`)}
                        />
                        <select
                          className="select select-sm"
                          aria-label={`${c.label} の小数点以下の桁数`}
                          value={c.format.decimals ?? "auto"}
                          onChange={(e) => patchFormat(c, { decimals: e.target.value === "auto" ? null : Number(e.target.value) })}
                        >
                          <option value="auto">小数: 自動</option>
                          {[0, 1, 2, 3].map((n) => (
                            <option key={n} value={n}>
                              小数: {n} 桁
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="content-cell">
                    {missing ? (
                      <div className="content-missing">
                        <span className="badge badge-danger">データにない列</span>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`${c.label} の設定を削除`}
                          title="設定を削除"
                          onClick={() => update((d) => ({ ...d, columns: d.columns.filter((x) => x.key !== c.key) }))}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    ) : c.derived ? (
                      <div className="content-missing">
                        {error ? (
                          <span className="badge badge-danger" title={error}>
                            計算できません
                          </span>
                        ) : (
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="samples">{s?.samples.join(" / ") || "（すべて空欄）"}</div>
                            {s && s.blank > 0 && <div className="stat-line">空欄 {count.format(s.blank)}</div>}
                          </div>
                        )}
                        {c.derived.kind !== "lookup" && (
                          <button type="button" className="icon-btn" aria-label={`${c.label} を編集`} title="編集" onClick={() => openDerived(c)}>
                            <PencilSimpleIcon size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`${c.label} を削除`}
                          title="削除"
                          onClick={() => {
                            update((d) => {
                              const columns = d.columns.filter((x) => x.key !== c.key);
                              // Drop master tables that no column uses any more.
                              const lookups = d.lookups?.filter((l) => columns.some((x) => x.derived?.kind === "lookup" && x.derived.lookupId === l.id));
                              return { ...d, columns, lookups };
                            });
                            useToasts.getState().push({ tone: "info", message: `計算列「${c.label}」を削除しました`, action: { label: "元に戻す", run: () => useApp.getState().undo() } });
                          }}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    ) : (
                      s && (
                        <>
                          <div className="samples" title={s.samples.join(" / ")}>
                            {s.samples.join(" / ") || "（すべて空欄）"}
                          </div>
                          <div className="stat-line">
                            <span>種類 {count.format(s.distinct)}</span>
                            {s.blank > 0 && <span>空欄 {count.format(s.blank)}</span>}
                            {s.invalid > 0 && <span className="badge badge-warning">変換できない値 {count.format(s.invalid)}</span>}
                          </div>
                        </>
                      )
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <DerivedDialog open={derivedOpen} editing={editingDerived} raw={raw} onClose={() => setDerivedOpen(false)} />
      <LookupDialog open={lookupOpen} raw={raw} editing={editingLookup} onClose={() => setLookupOpen(false)} />
    </div>
  );
}
