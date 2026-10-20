import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CopySimpleIcon, DotsSixVerticalIcon, DotsThreeVerticalIcon, PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Popover } from "../components/Popover";
import { WidgetCard } from "../components/WidgetCard";
import { widgetTitle } from "../core/format";
import { newId } from "../core/id";
import type { Filter, Frame, Widget } from "../core/types";
import { useApp, useToasts } from "./store";

interface Props {
  widgets: Widget[];
  frame: Frame;
  rows: Uint32Array;
  filters: Filter[];
  onToggleValue: (column: string, value: string) => void;
  onEdit: (id: string) => void;
}

export function EditableGrid({ widgets, frame, rows, filters, onToggleValue, onEdit }: Props) {
  const update = useApp((s) => s.update);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const titleOf = (id: string | number) => {
    const w = widgets.find((x) => x.id === id);
    return w ? widgetTitle(w, frame.meta) : "";
  };
  const position = (id: string | number) => widgets.findIndex((x) => x.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `「${titleOf(active.id)}」を持ち上げました。位置 ${position(active.id)} / ${widgets.length}`,
    onDragOver: ({ active, over }) => (over ? `「${titleOf(active.id)}」を位置 ${position(over.id)} に移動中` : ""),
    onDragEnd: ({ active, over }) => (over ? `「${titleOf(active.id)}」を位置 ${position(over.id)} に置きました` : "移動を取り消しました"),
    onDragCancel: ({ active }) => `「${titleOf(active.id)}」の移動を取り消しました`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    update((d) => {
      const from = d.widgets.findIndex((w) => w.id === active.id);
      const to = d.widgets.findIndex((w) => w.id === over.id);
      return { ...d, widgets: arrayMove(d.widgets, from, to) };
    });
  };

  const remove = (w: Widget) => {
    update((d) => ({ ...d, widgets: d.widgets.filter((x) => x.id !== w.id) }));
    useToasts.getState().push({
      tone: "info",
      message: `「${widgetTitle(w, frame.meta)}」を削除しました`,
      action: { label: "元に戻す", run: () => useApp.getState().undo() },
    });
  };

  const duplicate = (w: Widget) => {
    update((d) => {
      const i = d.widgets.findIndex((x) => x.id === w.id);
      const copy = { ...structuredClone(w), id: newId() };
      return { ...d, widgets: [...d.widgets.slice(0, i + 1), copy, ...d.widgets.slice(i + 1)] };
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: "スペースキーで持ち上げ、矢印キーで移動し、もう一度スペースキーで置きます。Escape で取り消します。" },
      }}
    >
      <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
        <div className="dash-grid">
          {widgets.map((w) => (
            <SortableWidget
              key={w.id}
              widget={w}
              frame={frame}
              rows={rows}
              filters={filters}
              onToggleValue={onToggleValue}
              onEdit={() => onEdit(w.id)}
              onDuplicate={() => duplicate(w)}
              onRemove={() => remove(w)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface ItemProps {
  widget: Widget;
  frame: Frame;
  rows: Uint32Array;
  filters: Filter[];
  onToggleValue: (column: string, value: string) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function SortableWidget({ widget, frame, rows, filters, onToggleValue, onEdit, onDuplicate, onRemove }: ItemProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const title = widgetTitle(widget, frame.meta);
  const [menu, setMenu] = useState(false);
  const run = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };
  return (
    <WidgetCard
      widget={widget}
      frame={frame}
      rows={rows}
      filters={filters}
      onToggleValue={onToggleValue}
      onFix={onEdit}
      innerRef={setNodeRef}
      className={`is-editable${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      actions={
        <div className="widget-actions">
          {/* Narrow cards show one menu instead of three icons so the title keeps its width. */}
          <span className="actions-compact">
            <Popover
              open={menu}
              onClose={() => setMenu(false)}
              label={`「${title}」の操作`}
              align="right"
              width={180}
              trigger={
                <button type="button" className="icon-btn" aria-label={`「${title}」の操作`} aria-expanded={menu} onClick={() => setMenu(!menu)}>
                  <DotsThreeVerticalIcon size={18} weight="bold" />
                </button>
              }
            >
              <div className="menu-list">
                <button type="button" className="menu-item" onClick={run(onEdit)}>
                  <span>
                    <PencilSimpleIcon size={16} aria-hidden /> 編集
                  </span>
                </button>
                <button type="button" className="menu-item" onClick={run(onDuplicate)}>
                  <span>
                    <CopySimpleIcon size={16} aria-hidden /> 複製
                  </span>
                </button>
                <button type="button" className="menu-item" onClick={run(onRemove)}>
                  <span>
                    <TrashIcon size={16} aria-hidden /> 削除
                  </span>
                </button>
              </div>
            </Popover>
          </span>
          <button type="button" className="icon-btn actions-full" aria-label={`「${title}」を編集`} title="編集" onClick={onEdit}>
            <PencilSimpleIcon size={18} />
          </button>
          <button type="button" className="icon-btn actions-full" aria-label={`「${title}」を複製`} title="複製" onClick={onDuplicate}>
            <CopySimpleIcon size={18} />
          </button>
          <button type="button" className="icon-btn actions-full" aria-label={`「${title}」を削除`} title="削除" onClick={onRemove}>
            <TrashIcon size={18} />
          </button>
          <button
            type="button"
            ref={setActivatorNodeRef}
            className="icon-btn drag-handle"
            aria-label={`「${title}」を並べ替え`}
            title="ドラッグで並べ替え"
            {...attributes}
            {...listeners}
          >
            <DotsSixVerticalIcon size={18} weight="bold" />
          </button>
        </div>
      }
    />
  );
}
