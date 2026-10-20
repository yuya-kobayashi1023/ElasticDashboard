import { LayoutIcon, ClipboardTextIcon, FileArrowUpIcon, LockSimpleIcon, SparkleIcon, WarningCircleIcon, XIcon } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { ACCEPT } from "../core/readFile";
import { sampleSales } from "../core/sample";
import { Dialog } from "./Dialog";
import { useImporter } from "./importer";
import { useApp, useToasts } from "./store";

export function ImportScreen() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { busy, error, importFile, clearError, template, clearTemplate } = useImporter();
  const create = useApp((s) => s.create);
  const [over, setOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  const trySample = async () => {
    await create(sampleSales(), { fileName: "サンプル売上データ.csv", sheetName: null, importedAt: Date.now() }, "サンプル売上");
    useToasts.getState().push({ tone: "success", message: "サンプルデータでダッシュボードを作成しました。" });
  };

  return (
    <div className="import-screen">
      <h1 className="page-title">新しいダッシュボード</h1>
      {template && (
        <div className="template-banner" role="status">
          <LayoutIcon size={20} aria-hidden />
          <div className="template-text">
            <strong>テンプレート「{template.dashboard.name}」を適用します</strong>
            <span>
              使う列: {template.dashboard.columns.filter((c) => !c.derived).map((c) => c.label).slice(0, 8).join("、")}
              {template.dashboard.columns.length > 8 ? " ほか" : ""}
            </span>
          </div>
          <button type="button" className="btn btn-sm" onClick={clearTemplate}>
            テンプレートを外す
          </button>
        </div>
      )}
      <div
        className={`dropzone${over ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) void importFile(f, "new");
        }}
      >
        {busy ? (
          <div className="dropzone-busy" role="status">
            <span className="spinner" aria-hidden />
            <span>「{busy}」を読み込み中…</span>
          </div>
        ) : (
          <>
            <FileArrowUpIcon size={40} className="muted" aria-hidden />
            <p className="dropzone-lead">ファイルをここにドロップ</p>
            <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
              ファイルを選択
            </button>
            <p className="muted dropzone-formats">CSV・TSV・Excel（xlsx / xls）・JSON・書き出した HTML</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void importFile(f, "new");
          }}
        />
      </div>

      {error && (
        <div className="inline-error" role="alert">
          <WarningCircleIcon size={20} weight="fill" aria-hidden />
          <span>{error}</span>
          <button type="button" className="icon-btn" aria-label="エラーを閉じる" onClick={clearError}>
            <XIcon size={16} />
          </button>
        </div>
      )}

      <div className="import-alt">
        <button type="button" className="btn" onClick={() => setPasteOpen(true)} disabled={!!busy}>
          <ClipboardTextIcon size={18} aria-hidden />
          表を貼り付け
        </button>
        <button type="button" className="btn" onClick={trySample} disabled={!!busy}>
          <SparkleIcon size={18} aria-hidden />
          サンプルデータで試す
        </button>
      </div>

      <p className="privacy-note">
        <LockSimpleIcon size={16} aria-hidden />
        データはこのブラウザ内で処理・保存され、外部には送信されません
      </p>

      <PasteDialog open={pasteOpen} onClose={() => setPasteOpen(false)} />
    </div>
  );
}

function PasteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState("");
  const { importText, error } = useImporter();
  const [submitted, setSubmitted] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="表を貼り付け"
      width={640}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={text.trim() === ""}
            onClick={async () => {
              setSubmitted(true);
              if (await importText(text)) {
                setText("");
                setSubmitted(false);
                onClose();
              }
            }}
          >
            読み込む
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Excel やスプレッドシートでコピーした表（1 行目が見出し）</span>
        <textarea className="input textarea" rows={12} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      {submitted && error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  );
}
