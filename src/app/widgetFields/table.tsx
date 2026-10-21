import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CaretDownIcon, CaretUpIcon, DotsSixVerticalIcon } from "@phosphor-icons/react";
import { orderedTableKeys } from "../../core/tableFilter";
import type { TableWidget } from "../../core/types";
import type { FieldProps } from "./shared";

function tableColumns({ widget, columns }: FieldProps<TableWidget>) {
  const visible = columns.filter((c) => !c.hidden);
  const byKey = new Map(visible.map((c) => [c.key, c]));
  const keys = orderedTableKeys(widget, visible.map((c) => c.key));
  return { byKey, keys };
}

export function TableData(props: FieldProps<TableWidget>) {
  const { widget, set } = props;
  const { byKey, keys } = tableColumns(props);
  const selected = new Set(widget.columns ?? keys);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // `order` holds every key (checked or not); `columns` holds the checked ones, null while all are checked.
  const commit = (order: string[], checked: Set<string>) => {
    const on = order.filter((k) => checked.has(k));
    set({ order, columns: on.length === order.length ? null : on });
  };
  const toggle = (key: string) => {
    const next = new Set(selected);
    if (!next.delete(key)) next.add(key);
    commit(keys, next);
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= keys.length) return;
    commit(arrayMove(keys, from, to), selected);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    move(keys.indexOf(String(active.id)), keys.indexOf(String(over.id)));
  };
  const setAll = (on: boolean) => set({ order: keys, columns: on ? null : [] });

  return (
    <fieldset className="field fieldset">
      <legend className="field-label">表示する列</legend>
      <div className="col-pick-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(true)}>
          すべて表示
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(false)}>
          すべて外す
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ul className="col-order-list">
            {keys.map((k, i) => (
              <ColumnRow key={k} id={k} label={byKey.get(k)!.label} checked={selected.has(k)} first={i === 0} last={i === keys.length - 1} onToggle={() => toggle(k)} onMove={(d) => move(i, i + d)} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <span className="field-hint">ここにない列は「列の設定」で非表示になっています</span>
    </fieldset>
  );
}

export function TableDisplay(props: FieldProps<TableWidget>) {
  const { widget, set } = props;
  const { byKey, keys } = tableColumns(props);
  return (
    <>
      <div className="field">
        <span className="field-label" id="table-sort-label">
          最初の並び順
        </span>
        <div className="sort-setting" role="group" aria-labelledby="table-sort-label">
          <select
            className="select"
            aria-label="並べ替える列"
            value={widget.sort && byKey.has(widget.sort.key) ? widget.sort.key : ""}
            onChange={(e) => set({ sort: e.target.value ? { key: e.target.value, dir: widget.sort?.dir ?? 1 } : null })}
          >
            <option value="">指定しない</option>
            {keys.map((k) => (
              <option key={k} value={k}>
                {byKey.get(k)!.label}
              </option>
            ))}
          </select>
          <div className="segmented" role="group" aria-label="並べ替えの向き">
            {([1, -1] as const).map((d) => (
              <button type="button" key={d} disabled={!widget.sort} aria-pressed={widget.sort?.dir === d} onClick={() => widget.sort && set({ sort: { ...widget.sort, dir: d } })}>
                {d === 1 ? "昇順" : "降順"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="check-list">
        <label className="checkbox">
          <input type="checkbox" checked={widget.filterRow !== false} onChange={(e) => set({ filterRow: e.target.checked })} />
          列ごとの絞り込み欄を表示
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={!!widget.rowNumbers} onChange={(e) => set({ rowNumbers: e.target.checked })} />
          行番号を表示
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={!!widget.wrap} onChange={(e) => set({ wrap: e.target.checked })} />
          長い文字を折り返す
        </label>
      </div>
      <label className="field">
        <span className="field-label">1 ページの行数</span>
        <select className="select" value={widget.pageSize} onChange={(e) => set({ pageSize: Number(e.target.value) })}>
          {[10, 20, 50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {n} 行
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

function ColumnRow({ id, label, checked, first, last, onToggle, onMove }: { id: string; label: string; checked: boolean; first: boolean; last: boolean; onToggle: () => void; onMove: (delta: -1 | 1) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} className={`col-order-row${isDragging ? " is-dragging" : ""}`} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <button type="button" ref={setActivatorNodeRef} className="icon-btn drag-handle" aria-label={`「${label}」を並べ替え`} title="ドラッグで並べ替え" {...attributes} {...listeners}>
        <DotsSixVerticalIcon size={16} weight="bold" />
      </button>
      <label className="checkbox">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span>{label}</span>
      </label>
      <button type="button" className="icon-btn" aria-label="上へ" title="上へ" disabled={first} onClick={() => onMove(-1)}>
        <CaretUpIcon size={14} weight="bold" />
      </button>
      <button type="button" className="icon-btn" aria-label="下へ" title="下へ" disabled={last} onClick={() => onMove(1)}>
        <CaretDownIcon size={14} weight="bold" />
      </button>
    </li>
  );
}
