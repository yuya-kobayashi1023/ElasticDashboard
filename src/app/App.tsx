import { FileArrowDownIcon, ListIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { DashboardPage } from "./DashboardPage";
import { ImportDialogs } from "./ImportDialogs";
import { ImportScreen } from "./ImportScreen";
import { useImporter } from "./importer";
import { Sidebar } from "./Sidebar";
import { useApp } from "./store";
import { Toasts } from "./Toasts";

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

export function App() {
  const { ready, dashboard, raw, init } = useApp();
  const [dragging, setDragging] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isEditable(e.target)) return;
      if (document.querySelector("dialog[open]")) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) useApp.getState().undo();
      else if ((k === "z" && e.shiftKey) || k === "y") useApp.getState().redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (useApp.getState().dashboard) useImporter.getState().setDropped(file);
      else void useImporter.getState().importFile(file, "new");
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <div className={`app${navOpen ? " nav-open" : ""}`}>
      <div className="mobile-bar">
        <button type="button" className="icon-btn" aria-label="メニューを開く" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>
          <ListIcon size={22} />
        </button>
        <span className="mobile-title">{dashboard?.name ?? "新しいダッシュボード"}</span>
      </div>
      <Sidebar onNavigate={() => setNavOpen(false)} />
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden />}
      <main className="main">{!ready ? null : dashboard && raw ? <DashboardPage key={dashboard.id} /> : <ImportScreen />}</main>
      <ImportDialogs />
      <Toasts />
      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-overlay-inner">
            <FileArrowDownIcon size={40} aria-hidden />
            <span>ドロップして読み込む</span>
          </div>
        </div>
      )}
    </div>
  );
}
