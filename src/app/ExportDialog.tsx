import { DownloadSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { planExport, safeFileName } from "../core/export";
import { columnLabel } from "../core/format";
import type { RawTable } from "../core/types";
import { buildExportHtml } from "./buildExport";
import { Dialog } from "./Dialog";
import { useApp, useToasts } from "./store";

const count = new Intl.NumberFormat("ja-JP");

export function ExportDialog({ open, onClose, raw }: { open: boolean; onClose: () => void; raw: RawTable }) {
  const dashboard = useApp((s) => s.dashboard)!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState(false);
  const plan = planExport(dashboard);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const html = await buildExportHtml(dashboard, template ? null : raw, { template });
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeFileName(dashboard.name)}${template ? "（テンプレート）" : ""}.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      onClose();
      useToasts.getState().push({ tone: "success", message: `「${a.download}」を書き出しました（${(blob.size / 1024 / 1024).toFixed(1)} MB）` });
    } catch {
      setError("書き出しに失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="HTML として書き出し"
      width={560}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button type="button" className="btn btn-primary" onClick={download} disabled={busy}>
            <DownloadSimpleIcon size={18} aria-hidden />
            {busy ? "作成中…" : "ダウンロード"}
          </button>
        </>
      }
    >
      <div className="form-stack">
        <div className="choice-list" role="radiogroup" aria-label="書き出す内容">
          <button type="button" role="radio" aria-checked={!template} className="choice choice-radio" onClick={() => setTemplate(false)}>
            <span className="radio-dot" aria-hidden />
            <span className="choice-text">
              <span className="choice-title">データを含める</span>
              <span className="choice-sub">
                {count.format(raw.rows.length)} 行・{plan.included.length} 列。開くとすぐにダッシュボードを見られます
              </span>
            </span>
          </button>
          <button type="button" role="radio" aria-checked={template} className="choice choice-radio" onClick={() => setTemplate(true)}>
            <span className="radio-dot" aria-hidden />
            <span className="choice-text">
              <span className="choice-title">テンプレート（データなし）</span>
              <span className="choice-sub">レイアウトと設定だけを保存します。開いたあとで同じ形式のファイルを読み込んで使います</span>
            </span>
          </button>
        </div>

        <p>書き出した HTML はブラウザで開くだけで動きます。同じ形式の CSV や Excel を読み込み直して、新しいデータで HTML を保存し直すこともできます。</p>

        {!template && (
          <>
            <dl className="summary-list">
              <div>
                <dt>除外する列</dt>
                <dd>{plan.excluded.length ? plan.excluded.map((k) => columnLabel(dashboard.columns, k)).join("、") : "なし"}</dd>
              </div>
            </dl>
            <p className="field-hint">
              非表示にした列のうち、グラフやフィルタで使っていない列はファイルに含めません。ファイルにはデータそのものが入るため、共有先に注意してください。
            </p>
          </>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
