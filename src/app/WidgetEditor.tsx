import { TrashIcon } from "@phosphor-icons/react";
import { defaultWidget } from "../core/autoDashboard";
import { widgetTitle } from "../core/format";
import type { Frame, Widget, WidgetKind } from "../core/types";
import { Dialog } from "./Dialog";
import { useApp, useToasts } from "./store";
import { BasicFields, DataFields, DisplayFields, hasNumberFormat, NumberFormatFields, Section } from "./widgetFields";

interface Props {
  widgetId: string | null;
  frame: Frame;
  onClose: () => void;
}

export function WidgetEditor({ widgetId, frame, onClose }: Props) {
  const dashboard = useApp((s) => s.dashboard);
  const update = useApp((s) => s.update);
  const widget = dashboard?.widgets.find((w) => w.id === widgetId) ?? null;
  const columns = (dashboard?.columns ?? []).filter((c) => frame.columns.has(c.key));

  const set = (patch: Partial<Widget>, coalesce?: string) => {
    if (!widget) return;
    update((d) => ({ ...d, widgets: d.widgets.map((w) => (w.id === widget.id ? ({ ...w, ...patch } as Widget) : w)) }), coalesce);
  };

  const changeKind = (kind: WidgetKind) => {
    if (!widget || widget.kind === kind || !dashboard) return;
    const next = { ...defaultWidget(kind, dashboard.columns, frame, widget.id), title: widget.title, ...(widget.subtitle ? { subtitle: widget.subtitle } : {}), ...(widget.numberFormat && kind !== "table" ? { numberFormat: widget.numberFormat } : {}) };
    update((d) => ({ ...d, widgets: d.widgets.map((w) => (w.id === widget.id ? next : w)) }));
  };

  const remove = () => {
    if (!widget || !dashboard) return;
    const title = widgetTitle(widget, dashboard.columns);
    update((d) => ({ ...d, widgets: d.widgets.filter((w) => w.id !== widget.id) }));
    onClose();
    useToasts.getState().push({ tone: "info", message: `「${title}」を削除しました`, action: { label: "元に戻す", run: () => useApp.getState().undo() } });
  };

  return (
    <Dialog
      open={!!widget}
      onClose={onClose}
      title="ウィジェットの設定"
      variant="drawer"
      footer={
        <>
          <button type="button" className="btn btn-ghost danger-text" onClick={remove}>
            <TrashIcon size={18} aria-hidden />
            削除
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            完了
          </button>
        </>
      }
    >
      {widget && dashboard && (
        <div className="editor-sections">
          <Section name="basic" title="基本" defaultOpen>
            <BasicFields widget={widget} columns={dashboard.columns} set={set} onChangeKind={changeKind} />
          </Section>
          <Section name="data" title="データ" defaultOpen>
            <DataFields widget={widget} columns={columns} frame={frame} set={set} />
          </Section>
          <Section name="display" title="表示">
            <DisplayFields widget={widget} columns={columns} frame={frame} set={set} />
          </Section>
          {hasNumberFormat(widget) && (
            <Section name="format" title="数値の書式">
              <NumberFormatFields widget={widget} set={set} />
            </Section>
          )}
        </div>
      )}
    </Dialog>
  );
}
