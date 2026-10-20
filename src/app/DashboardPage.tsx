import { ArrowArcLeftIcon, ArrowArcRightIcon, ArrowsClockwiseIcon, CaretDownIcon, CheckIcon, CloudWarningIcon, ExportIcon, FileTextIcon, MagicWandIcon, PaletteIcon, PlusIcon, RowsPlusBottomIcon, TrashIcon } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { FilterBar } from "../components/FilterBar";
import { Popover } from "../components/Popover";
import { ThemeScope } from "../components/ThemeScope";
import { useDashboardData } from "../components/useDashboardData";
import { autoWidgets, defaultWidget } from "../core/autoDashboard";
import { toggleFilterValue } from "../core/filters";
import { ACCEPT } from "../core/readFile";
import { ColumnSettings } from "./ColumnSettings";
import { DesignPanel } from "./DesignPanel";
import { Dialog } from "./Dialog";
import { EditableGrid } from "./EditableGrid";
import { ExportDialog } from "./ExportDialog";
import { useImporter, type ImportMode } from "./importer";
import { useApp, useToasts, type View } from "./store";
import { WidgetEditor } from "./WidgetEditor";

const count = new Intl.NumberFormat("ja-JP");
const dateFmt = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

const TABS: { id: View; label: string }[] = [
  { id: "dashboard", label: "ダッシュボード" },
  { id: "columns", label: "列の設定" },
];

export function DashboardPage() {
  const { dashboard, raw, view, setView, update, setFilters, undo, redo, past, future, saveState, remove } = useApp();
  const d = dashboard!;
  const { frame, rows, computing } = useDashboardData(raw!, d.columns, d.filters, d.lookups);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileMode = useRef<ImportMode>("replace");
  const [designOpen, setDesignOpen] = useState(false);
  const [dataMenu, setDataMenu] = useState(false);
  const pickFile = (mode: ImportMode) => {
    fileMode.current = mode;
    setDataMenu(false);
    fileRef.current?.click();
  };
  const { importFile, busy } = useImporter();

  const filters = d.filters;
  const onToggleValue = useCallback(
    (column: string, value: string) => setFilters(toggleFilterValue(useApp.getState().dashboard!.filters, column, value)),
    [setFilters],
  );

  const autoLayout = () => {
    if (!frame) return;
    update((x) => ({ ...x, widgets: autoWidgets(x.columns, frame) }));
    useToasts.getState().push({
      tone: "success",
      message: "データの内容からウィジェットを作成しました",
      action: { label: "元に戻す", run: () => useApp.getState().undo() },
    });
  };

  const addWidget = () => {
    if (!frame) return;
    const w = defaultWidget("bar", d.columns, frame);
    update((x) => ({ ...x, widgets: [...x.widgets, w] }));
    setEditingId(w.id);
  };

  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = TABS.findIndex((t) => t.id === view);
    const next = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    setView(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  };

  return (
    <ThemeScope theme={d.theme}>
    <div className="page">
      <header className="page-head">
        <div className="title-block">
          <label className="visually-hidden" htmlFor="dash-name">
            ダッシュボード名
          </label>
          <input
            id="dash-name"
            className="title-input"
            value={d.name}
            onChange={(e) => update((x) => ({ ...x, name: e.target.value }), "name")}
            onBlur={(e) => {
              if (!e.target.value.trim()) update((x) => ({ ...x, name: "無題のダッシュボード" }));
            }}
          />
          <div className="source-line">
            <FileTextIcon size={16} aria-hidden />
            <span className="source-name" title={[d.source.fileName, ...(d.source.appended ?? [])].join("\n")}>
              {d.source.fileName}
              {d.source.sheetName ? ` / ${d.source.sheetName}` : ""}
              {d.source.appended?.length ? ` ほか ${d.source.appended.length} ファイル` : ""}
            </span>
            <span>{count.format(d.source.rowCount)} 行</span>
            <span>{dateFmt.format(d.source.importedAt)} 読み込み</span>
            <SaveStatus state={saveState} />
          </div>
        </div>
        <div className="head-actions">
          <div className="history-buttons">
            <button type="button" className="icon-btn" aria-label="元に戻す" title="元に戻す（Ctrl+Z）" disabled={past.length === 0} onClick={undo}>
              <ArrowArcLeftIcon size={20} />
            </button>
            <button type="button" className="icon-btn" aria-label="やり直す" title="やり直す（Ctrl+Shift+Z）" disabled={future.length === 0} onClick={redo}>
              <ArrowArcRightIcon size={20} />
            </button>
          </div>
          <Popover
            open={dataMenu}
            onClose={() => setDataMenu(false)}
            label="データの更新方法"
            align="right"
            width={300}
            trigger={
              <button type="button" className="btn" onClick={() => setDataMenu(!dataMenu)} aria-expanded={dataMenu} disabled={!!busy}>
                <ArrowsClockwiseIcon size={18} aria-hidden />
                データを更新
                <CaretDownIcon size={14} aria-hidden />
              </button>
            }
          >
            <div className="menu-list">
              <button type="button" className="menu-item" onClick={() => pickFile("replace")}>
                <span>
                  <ArrowsClockwiseIcon size={16} aria-hidden /> 差し替える
                </span>
                <span className="menu-item-sub">今のデータを新しいファイルに入れ替えます。レイアウトと列の設定はそのまま</span>
              </button>
              <button type="button" className="menu-item" onClick={() => pickFile("append")}>
                <span>
                  <RowsPlusBottomIcon size={16} aria-hidden /> 行を追加する
                </span>
                <span className="menu-item-sub">今のデータの後ろに行をつなげます</span>
              </button>
            </div>
          </Popover>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importFile(f, fileMode.current);
            }}
          />
          <button type="button" className="btn btn-primary" onClick={() => setExportOpen(true)}>
            <ExportIcon size={18} aria-hidden />
            HTML を書き出し
          </button>
          <button type="button" className="icon-btn" aria-label="ダッシュボードを削除" title="ダッシュボードを削除" onClick={() => setDeleteOpen(true)}>
            <TrashIcon size={20} />
          </button>
        </div>
      </header>

      {busy && (
        <div className="busy-banner" role="status">
          <span className="spinner" aria-hidden />「{busy}」を読み込み中…
        </div>
      )}

      <div className="tabs-row">
        <div className="tabs" role="tablist" aria-label="表示の切り替え" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={view === t.id}
              aria-controls={`panel-${t.id}`}
              tabIndex={view === t.id ? 0 : -1}
              className="tab"
              onClick={() => setView(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {view === "dashboard" && (
          <div className="tabs-actions">
            <button type="button" className="btn btn-sm" onClick={() => setDesignOpen(true)}>
              <PaletteIcon size={16} aria-hidden />
              デザイン
            </button>
            <button type="button" className="btn btn-sm" onClick={addWidget}>
              <PlusIcon size={16} aria-hidden />
              ウィジェットを追加
            </button>
          </div>
        )}
      </div>

      <div id={`panel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`} className="tab-panel">
        {computing && frame && (
          <div className="busy-banner" role="status">
            <span className="spinner" aria-hidden />
            集計し直しています…
          </div>
        )}
        {view === "dashboard" && !frame ? (
          <div className="empty-dash" role="status">
            <span className="spinner" aria-hidden />
            <p>{count.format(raw!.rows.length)} 行を集計しています…</p>
          </div>
        ) : view === "dashboard" && frame ? (
          <>
            <FilterBar frame={frame} filters={filters} filteredCount={rows.length} onChange={setFilters} />
            {d.widgets.length === 0 ? (
              <div className="empty-dash">
                <p>ウィジェットがありません</p>
                <div className="empty-dash-actions">
                  <button type="button" className="btn btn-primary" onClick={addWidget}>
                    <PlusIcon size={18} aria-hidden />
                    ウィジェットを追加
                  </button>
                  <button type="button" className="btn" onClick={autoLayout}>
                    <MagicWandIcon size={18} aria-hidden />
                    自動で作成
                  </button>
                </div>
              </div>
            ) : (
              <EditableGrid widgets={d.widgets} frame={frame} rows={rows} filters={filters} onToggleValue={onToggleValue} onEdit={setEditingId} />
            )}
          </>
        ) : (
          <ColumnSettings raw={raw!} />
        )}
      </div>

      {frame && <WidgetEditor widgetId={editingId} frame={frame} onClose={() => setEditingId(null)} />}
      <DesignPanel open={designOpen} onClose={() => setDesignOpen(false)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} raw={raw!} />
      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="ダッシュボードを削除"
        width={460}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setDeleteOpen(false)}>
              キャンセル
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                setDeleteOpen(false);
                await remove(d.id);
              }}
            >
              削除する
            </button>
          </>
        }
      >
        <p>
          「{d.name}」と、読み込んだデータを削除します。この操作は元に戻せません。書き出した HTML ファイルには影響しません。
        </p>
      </Dialog>
    </div>
    </ThemeScope>
  );
}

function SaveStatus({ state }: { state: "saved" | "saving" | "error" }) {
  if (state === "error") {
    return (
      <span className="save-status is-error" role="alert">
        <CloudWarningIcon size={16} aria-hidden />
        保存できませんでした
      </span>
    );
  }
  return (
    <span className="save-status" aria-live="polite">
      {state === "saving" ? (
        "保存中…"
      ) : (
        <>
          <CheckIcon size={14} aria-hidden />
          保存済み
        </>
      )}
    </span>
  );
}
