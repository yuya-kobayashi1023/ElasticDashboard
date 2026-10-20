import { ChartPieSliceIcon, LockSimpleIcon, PlusIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { useApp } from "./store";

const count = new Intl.NumberFormat("ja-JP");
const dateFmt = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { list, dashboard, open, closeCurrent } = useApp();
  return (
    <nav className="sidebar" aria-label="ダッシュボード一覧">
      <div className="brand">
        <ChartPieSliceIcon size={22} weight="duotone" aria-hidden />
        <span>Elastic Dashboard</span>
      </div>
      <button
        type="button"
        className={`btn side-new${dashboard ? "" : " is-current"}`}
        aria-current={dashboard ? undefined : "page"}
        onClick={() => {
          closeCurrent();
          onNavigate?.();
        }}
      >
        <PlusIcon size={18} aria-hidden />
        新規作成
      </button>
      <h2 className="side-heading">ダッシュボード</h2>
      {list.length === 0 ? (
        <p className="side-empty">まだありません</p>
      ) : (
        <ul className="side-list">
          {list.map((d) => {
            const current = dashboard?.id === d.id;
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className={`side-item${current ? " is-current" : ""}`}
                  aria-current={current ? "page" : undefined}
                  onClick={() => {
                    void open(d.id);
                    onNavigate?.();
                  }}
                >
                  <SquaresFourIcon size={18} aria-hidden className="side-item-icon" />
                  <span className="side-item-text">
                    <span className="side-item-name">{d.name}</span>
                    <span className="side-item-sub">
                      {count.format(d.rowCount)} 行 ・ {dateFmt.format(d.updatedAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="side-foot">
        <LockSimpleIcon size={14} aria-hidden />
        ブラウザ内にのみ保存
      </p>
    </nav>
  );
}
