import { FileArrowUpIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { localKeys, masterIndex, matchReport } from "../core/derive";
import { buildFrame } from "../core/frame";
import type { ParsedSheet } from "../core/grid";
import { newId } from "../core/id";
import { inferColumn } from "../core/infer";
import { ACCEPT, readDataFile } from "../core/readFile";
import type { ColumnMeta, Lookup, RawTable } from "../core/types";
import { Dialog } from "./Dialog";
import { useApp, useToasts } from "./store";

const count = new Intl.NumberFormat("ja-JP");

interface Props {
  open: boolean;
  raw: RawTable;
  onClose: () => void;
}

/** Joins a master table (store list, product list…) by a key column and adds its columns. */
export function LookupDialog({ open, raw, onClose }: Props) {
  const dashboard = useApp((s) => s.dashboard)!;
  const update = useApp((s) => s.update);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masterKey, setMasterKey] = useState("");
  const [localKey, setLocalKey] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const sheet = sheets[sheetIndex];
  const keyCandidates = dashboard.columns.filter((c) => c.type === "category" || c.type === "text" || (c.type === "number" && c.idLike));

  useEffect(() => {
    if (!open) {
      setFileName(null);
      setSheets([]);
      setError(null);
    }
  }, [open]);

  // Suggest keys: a header present on both sides, else the first ID-like column.
  useEffect(() => {
    if (!sheet) return;
    const headers = sheet.table.headers;
    const shared = headers.find((h) => dashboard.columns.some((c) => !c.derived && (c.key === h || c.label === h)));
    const mk = shared ?? headers[0];
    setMasterKey(mk);
    const local = dashboard.columns.find((c) => !c.derived && (c.key === mk || c.label === mk)) ?? keyCandidates.find((c) => c.idLike) ?? keyCandidates[0];
    setLocalKey(local?.key ?? "");
    setPicked(new Set(headers.filter((h) => h !== mk)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  const report = useMemo(() => {
    if (!sheet || !localKey || !masterKey) return null;
    const frame = buildFrame(raw, dashboard.columns, dashboard.lookups);
    const col = frame.columns.get(localKey);
    if (!col) return null;
    const probe: Lookup = { id: "probe", fileName: "", table: sheet.table, masterKey, localKey };
    return matchReport(localKeys(col, frame.rowCount), masterIndex(probe));
  }, [sheet, localKey, masterKey, raw, dashboard.columns, dashboard.lookups]);

  const load = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const res = await readDataFile(file);
      setFileName(file.name);
      setSheets(res.sheets);
      setSheetIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ファイルを読み込めませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const labels = new Set(dashboard.columns.map((c) => c.label));
  const columnsToAdd = sheet ? sheet.table.headers.filter((h) => h !== masterKey && picked.has(h)) : [];
  const canSave = !!sheet && !!localKey && !!masterKey && columnsToAdd.length > 0 && (report?.matched ?? 0) > 0;

  const save = () => {
    if (!sheet || !canSave) return;
    const keep = [masterKey, ...columnsToAdd].map((h) => sheet.table.headers.indexOf(h));
    const lookup: Lookup = {
      id: newId(),
      fileName: fileName ?? "マスタ",
      table: { headers: keep.map((i) => sheet.table.headers[i]), rows: sheet.table.rows.map((r) => keep.map((i) => r[i] ?? null)) },
      masterKey,
      localKey,
    };
    const added: ColumnMeta[] = columnsToAdd.map((h) => {
      const idx = sheet.table.headers.indexOf(h);
      const inferred = inferColumn(h, sheet.table.rows.map((r) => r[idx] ?? null));
      return {
        key: `lookup:${lookup.id}:${h}`,
        label: labels.has(h) ? `${h}（マスタ）` : h,
        type: inferred.type,
        inferredType: inferred.type,
        hidden: false,
        idLike: inferred.idLike,
        format: inferred.format,
        derived: { kind: "lookup", lookupId: lookup.id, column: h },
      };
    });
    update((d) => ({ ...d, lookups: [...(d.lookups ?? []), lookup], columns: [...d.columns, ...added] }));
    onClose();
    useToasts.getState().push({
      tone: "success",
      message: `「${lookup.fileName}」から ${added.map((c) => c.label).join("、")} を結合しました。データを差し替えても結合は残ります。`,
      action: { label: "元に戻す", run: () => useApp.getState().undo() },
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="マスタを結合"
      width={600}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave}>
            結合
          </button>
        </>
      }
    >
      <div className="form-stack">
        <p className="field-hint">店舗コードから店舗名を引くように、別のファイル（マスタ）の列を、共通の列をキーにして追加します。</p>

        <div className="field">
          <span className="field-label">マスタのファイル</span>
          <div className="lookup-file">
            <button type="button" className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
              <FileArrowUpIcon size={18} aria-hidden />
              {fileName ? "選び直す" : "ファイルを選択"}
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
            <select className="select" value={sheetIndex} onChange={(e) => setSheetIndex(Number(e.target.value))}>
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
            <div className="field-row">
              <label className="field">
                <span className="field-label">このデータのキー</span>
                <select className="select" value={localKey} onChange={(e) => setLocalKey(e.target.value)}>
                  {keyCandidates.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">マスタのキー</span>
                <select
                  className="select"
                  value={masterKey}
                  onChange={(e) => {
                    setMasterKey(e.target.value);
                    setPicked(new Set(sheet.table.headers.filter((h) => h !== e.target.value)));
                  }}
                >
                  {sheet.table.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {report && (
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
                  .filter((h) => h !== masterKey)
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
