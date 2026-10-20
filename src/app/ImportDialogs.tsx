import { ArrowsClockwiseIcon, PlusIcon, RowsPlusBottomIcon, TableIcon } from "@phosphor-icons/react";
import { Dialog } from "./Dialog";
import { useImporter } from "./importer";

const count = new Intl.NumberFormat("ja-JP");

export function ImportDialogs() {
  const { pending, chooseSheet, dropped, setDropped, importFile, mismatch, resolveMismatch } = useImporter();
  return (
    <>
      <Dialog open={!!pending} onClose={() => void chooseSheet(null)} title="読み込むシートを選択" width={560}>
        <div className="choice-list">
          {pending?.result.sheets.map((s) => (
            <button type="button" key={s.name} className="choice" onClick={() => void chooseSheet(s)}>
              <TableIcon size={22} aria-hidden className="muted" />
              <span className="choice-text">
                <span className="choice-title">{s.name}</span>
                <span className="choice-sub">
                  {count.format(s.table.rows.length)} 行・{s.table.headers.length} 列 ・ {s.table.headers.slice(0, 4).join("、")}
                  {s.table.headers.length > 4 ? " …" : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      </Dialog>

      <Dialog open={!!dropped} onClose={() => setDropped(null)} title={`「${dropped?.name ?? ""}」の読み込み方法`} width={520}>
        <div className="choice-list">
          <button type="button" className="choice" onClick={() => dropped && void importFile(dropped, "replace")}>
            <ArrowsClockwiseIcon size={22} aria-hidden className="muted" />
            <span className="choice-text">
              <span className="choice-title">このダッシュボードのデータを差し替え</span>
              <span className="choice-sub">レイアウトと列の設定はそのまま。列は名前で対応付けます</span>
            </span>
          </button>
          <button type="button" className="choice" onClick={() => dropped && void importFile(dropped, "append")}>
            <RowsPlusBottomIcon size={22} aria-hidden className="muted" />
            <span className="choice-text">
              <span className="choice-title">このダッシュボードに行を追加</span>
              <span className="choice-sub">今のデータの後ろに行をつなげます。月ごとに分かれたファイルをまとめるときに使います</span>
            </span>
          </button>
          <button type="button" className="choice" onClick={() => dropped && void importFile(dropped, "new")}>
            <PlusIcon size={22} aria-hidden className="muted" />
            <span className="choice-text">
              <span className="choice-title">新しいダッシュボードを作成</span>
              <span className="choice-sub">データから自動でレイアウトを作ります</span>
            </span>
          </button>
        </div>
      </Dialog>

      <Dialog
        open={!!mismatch}
        onClose={() => void resolveMismatch("cancel")}
        title="列がほとんど一致しません"
        width={600}
        footer={
          <>
            <button type="button" className="btn" onClick={() => void resolveMismatch("cancel")}>
              キャンセル
            </button>
            <button type="button" className="btn" onClick={() => void resolveMismatch("replace")}>
              それでも差し替える
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void resolveMismatch("new")}>
              新しいダッシュボードを作成
            </button>
          </>
        }
      >
        <p>
          「{mismatch?.fileName}」には、このダッシュボードで使っている {mismatch?.usedCount} 列のうち {mismatch?.missing.length} 列がありません。差し替えると、該当するグラフは表示できなくなります。
        </p>
        <p className="field-hint" style={{ marginTop: 12 }}>
          見つからない列: {mismatch?.missing.join("、")}
        </p>
      </Dialog>
    </>
  );
}
