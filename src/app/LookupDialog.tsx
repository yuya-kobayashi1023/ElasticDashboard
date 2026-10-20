import { FileArrowUpIcon, PlusIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { lookupKeys, masterIndex, matchReport, rowKeys } from "../core/derive";
import { buildFrame } from "../core/frame";
import type { ParsedSheet } from "../core/grid";
import { newId } from "../core/id";
import { inferColumn } from "../core/infer";
import { ACCEPT, readDataFile } from "../core/readFile";
import type { ColumnMeta, ColumnValues, Lookup, RawTable } from "../core/types";
import { Dialog } from "./Dialog";
import { useApp, useToasts } from "./store";

const count = new Intl.NumberFormat("ja-JP");

interface Props {
  open: boolean;
  raw: RawTable;
  /** Lookup to update (new master file, keys or columns); null to join a new master. */
  editing: Lookup | null;
  onClose: () => void;
}

interface KeyPair {
  local: string;
  master: string;
}

/** Joins a master table (store list, product list…) by one or more key columns and adds its columns. */
export function LookupDialog({ open, raw, editing, onClose }: Props) {
  const dashboard = useApp((s) => s.dashboard)!;
  const update = useApp((s) => s.update);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairs, setPairs] = useState<KeyPair[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const sheet = sheets[sheetIndex];
  const own = (c: ColumnMeta) => c.derived?.kind === "lookup" && c.derived.lookupId === editing?.id;
  const localCandidates = dashboard.columns.filter((c) => !own(c) && (c.type === "category" || c.type === "text" || c.type === "number" || c.type === "date"));
  const masterKeySet = new Set(pairs.map((p) => p.master));

  // Start from the saved master when updating, or from nothing when joining.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSheetIndex(0);
    if (editing) {
      const keys = lookupKeys(editing);
      setFileName(editing.fileName);
      setSheets([{ name: null, table: editing.table, notes: [] }]);
      setPairs(keys.master.map((m, i) => ({ master: m, local: keys.local[i] ?? "" })));
      setPicked(new Set(dashboard.columns.filter(own).map((c) => (c.derived as { column: string }).column)));
    } else {
      setFileName(null);
      setSheets([]);
      setPairs([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const suggestFor = (s: ParsedSheet) => {
    const headers = s.table.headers;
    const shared = headers.find((h) => dashboard.columns.some((c) => !c.derived && (c.key === h || c.label === h)));
    const master = shared ?? headers[0];
    const local = dashboard.columns.find((c) => !c.derived && (c.key === master || c.label === master)) ?? localCandidates.find((c) => c.idLike) ?? localCandidates[0];
    setPairs([{ master, local: local?.key ?? "" }]);
    setPicked(new Set(headers.filter((h) => h !== master)));
  };

  const load = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const res = await readDataFile(file);
      setFileName(file.name);
      setSheets(res.sheets);
      setSheetIndex(0);
      if (editing) {
        // Keep the existing keys and columns when they still exist in the new file.
        const headers = res.sheets[0].table.headers;
        if (!pairs.every((p) => headers.includes(p.master))) suggestFor(res.sheets[0]);
        else setPicked(new Set([...picked].filter((h) => headers.includes(h))));
      } else suggestFor(res.sheets[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ファイルを読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const report = useMemo(() => {
    if (!sheet || pairs.length === 0 || pairs.some((p) => !p.local || !p.master)) return null;
    const frame = buildFrame(raw, dashboard.columns, dashboard.lookups);
    const cols = pairs.map((p) => frame.columns.get(p.local));
    if (cols.some((c) => !c)) return null;
    const probe: Lookup = { id: "probe", fileName: "", table: sheet.table, masterKeys: pairs.map((p) => p.master), localKeys: pairs.map((p) => p.local) };
    return matchReport(rowKeys(cols as ColumnValues[], frame.rowCount), masterIndex(probe, (cols as ColumnValues[]).map((c) => c.type === "date")));
  }, [sheet, pairs, raw, dashboard.columns, dashboard.lookups]);

  const labels = new Set(dashboard.columns.filter((c) => !own(c)).map((c) => c.label));
  const columnsToAdd = sheet ? sheet.table.headers.filter((h) => !masterKeySet.has(h) && picked.has(h)) : [];
  const duplicateKey = new Set(pairs.map((p) => p.local)).size !== pairs.length || masterKeySet.size !== pairs.length;
  const canSave = !!sheet && pairs.length > 0 && !duplicateKey && columnsToAdd.length > 0 && (report?.matched ?? 0) > 0;

  const save = () => {
    if (!sheet || !canSave) return;
    const id = editing?.id ?? newId();
    const keep = [...pairs.map((p) => p.master), ...columnsToAdd].map((h) => sheet.table.headers.indexOf(h));
    const lookup: Lookup = {
      id,
      fileName: fileName ?? "マスタ",
      table: { headers: keep.map((i) => sheet.table.headers[i]), rows: sheet.table.rows.map((r) => keep.map((i) => r[i] ?? null)) },
      masterKeys: pairs.map((p) => p.master),
      localKeys: pairs.map((p) => p.local),
    };
    const existing = new Map(dashboard.columns.filter(own).map((c) => [(c.derived as { column: string }).column, c]));
    const columns: ColumnMeta[] = columnsToAdd.map((h) => {
      const prev = existing.get(h);
      if (prev) return prev;
      const idx = sheet.table.headers.indexOf(h);
      const inferred = inferColumn(h, sheet.table.rows.map((r) => r[idx] ?? null));
      return {
        key: `lookup:${id}:${h}`,
        label: labels.has(h) ? `${h}（マスタ）` : h,
        type: inferred.type,
        inferredType: inferred.type,
        hidden: false,
        idLike: inferred.idLike,
        format: inferred.format,
        derived: { kind: "lookup", lookupId: id, column: h },
      };
    });
    const removed = [...existing.keys()].filter((h) => !columnsToAdd.includes(h));
    update((d) => {
      const rest = d.columns.filter((c) => !(c.derived?.kind === "lookup" && c.derived.lookupId === id));
      return { ...d, lookups: [...(d.lookups ?? []).filter((l) => l.id !== id), lookup], columns: [...rest, ...columns] };
    });
    onClose();
    useToasts.getState().push({
      tone: removed.length ? "info" : "success",
      message: editing
        ? `マスタ「${lookup.fileName}」を更新しました。${removed.length ? `外した列: ${removed.join("、")}。` : ""}`
        : `「${lookup.fileName}」から ${columns.map((c) => c.label).join("、")} を結合しました。データを差し替えても結合は残ります。`,
      action: { label: "元に戻す", run: () => useApp.getState().undo() },
    });
  };

  const setPair = (i: number, patch: Partial<KeyPair>) => setPairs(pairs.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const nextFreeMaster = sheet?.table.headers.find((h) => !masterKeySet.has(h)) ?? "";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "マスタを更新" : "マスタを結合"}
      width={640}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave}>
            {editing ? "更新" : "結合"}
          </button>
        </>
      }
    >
      <div className="form-stack">
        {!editing && <p className="field-hint">店舗コードから店舗名を引くように、別のファイル（マスタ）の列を、共通の列をキーにして追加します。</p>}

        <div className="field">
          <span className="field-label">マスタのファイル</span>
          <div className="lookup-file">
            <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
              <FileArrowUpIcon size={18} aria-hidden />
              {fileName ? (editing ? "新しいファイルに差し替え" : "選び直す") : "ファイルを選択"}
            </button>
            <span className="muted">{busy ? "読み込み中…" : (fileName ?? "CSV・TSV・Excel・JSON")}</span>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT.replace(",.html,.htm", "")}
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void load(f);
              }}
            />
          </div>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>

        {sheets.length > 1 && (
          <label className="field">
            <span className="field-label">シート</span>
            <select
              className="select"
              value={sheetIndex}
              onChange={(e) => {
                setSheetIndex(Number(e.target.value));
                suggestFor(sheets[Number(e.target.value)]);
              }}
            >
              {sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name}（{count.format(s.table.rows.length)} 行）
                </option>
              ))}
            </select>
          </label>
        )}

        {sheet && (
          <>
            <fieldset className="field fieldset">
              <legend className="field-label">キー（すべて一致する行を結合）</legend>
              <div className="key-pairs">
                <span className="key-pairs-head">このデータの列</span>
                <span />
                <span className="key-pairs-head">マスタの列</span>
                <span />
                {pairs.map((p, i) => (
                  <div className="key-pair" key={i}>
                    <select className="select" aria-label={`キー ${i + 1}: このデータの列`} value={p.local} onChange={(e) => setPair(i, { local: e.target.value })}>
                      {localCandidates.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <span className="muted" aria-hidden>
                      ＝
                    </span>
                    <select className="select" aria-label={`キー ${i + 1}: マスタの列`} value={p.master} onChange={(e) => setPair(i, { master: e.target.value })}>
                      {sheet.table.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`キー ${i + 1} を外す`}
                      title="キーを外す"
                      disabled={pairs.length === 1}
                      onClick={() => setPairs(pairs.filter((_, k) => k !== i))}
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ justifySelf: "start" }}
                disabled={!nextFreeMaster}
                onClick={() => {
                  const local = localCandidates.find((c) => c.key === nextFreeMaster || c.label === nextFreeMaster) ?? localCandidates[0];
                  setPairs([...pairs, { master: nextFreeMaster, local: local?.key ?? "" }]);
                  setPicked(new Set([...picked].filter((h) => h !== nextFreeMaster)));
                }}
              >
                <PlusIcon size={16} aria-hidden />
                キーを追加
              </button>
              {duplicateKey && <span className="field-error">同じ列を 2 回キーにしています</span>}
            </fieldset>

            {report && !duplicateKey && (
              <div className={`match-report${report.matched === 0 ? " is-bad" : report.matched < report.total ? " is-partial" : ""}`} role="status">
                {report.matched < report.total && <WarningCircleIcon size={18} aria-hidden />}
                <span>
                  {count.format(report.total)} 行中 {count.format(report.matched)} 行がマスタと一致
                  {report.unmatched.length > 0 && `。一致しない値の例: ${report.unmatched.join("、")}`}
                  {report.matched === 0 && "。キーの列の組み合わせを確認してください"}
                </span>
              </div>
            )}

            <fieldset className="field fieldset">
              <legend className="field-label">追加する列</legend>
              <div className="check-list">
                {sheet.table.headers
                  .filter((h) => !masterKeySet.has(h))
                  .map((h) => (
                    <label key={h} className="checkbox">
                      <input
                        type="checkbox"
                        checked={picked.has(h)}
                        onChange={() => {
                          const next = new Set(picked);
                          if (next.has(h)) next.delete(h);
                          else next.add(h);
                          setPicked(next);
                        }}
                      />
                      {h}
                      {labels.has(h) && <span className="muted">（同名の列があるため「{h}（マスタ）」）</span>}
                    </label>
                  ))}
              </div>
            </fieldset>
          </>
        )}
      </div>
    </Dialog>
  );
}
