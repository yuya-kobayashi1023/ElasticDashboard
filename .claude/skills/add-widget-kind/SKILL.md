---
name: add-widget-kind
description: Use when adding a new widget kind / chart type to elastic-dashboard (e.g. "add a chart type", "new widget", "新しいグラフ", "ウィジェットを追加", "treemap/radar/funnel widget"). Lists every file a kind touches, in order. Not for tweaking options of an existing kind (edit its widgetFields/<kind>.tsx and chart only).
---

# Add a widget kind

Template to copy: commit `3fc3cd6` (donut/heatmap/note/gauge). `git show 3fc3cd6 --stat`, then mirror the closest existing kind (donut = category+measure, heatmap = two axes, gauge = single value, note = no data).
Most `switch (w.kind)` have no default, so `bun run typecheck` flags every missed case. Fix those first; the items below also cover places tsc cannot catch.

## Steps (core -> components -> app)
1. `core/types.ts`: add `XxxWidget extends WidgetBase` with `kind: "xxx"`; add it to the `Widget` union (`WidgetKind` derives automatically). Reuse `Measure`, `HeatAxis`-style sub-types.
2. `core/aggregate.ts`: add a pure `xxxData(frame, rows, ...)` function (rows = `Uint32Array` from `filterRows`). No React, keep per-row work tight. Reuse `groupBy`/`aggregate`/`OTHER_LABEL`.
3. `components/charts/Xxx.tsx`: presentational component taking aggregated data + `format`/`color`. Use `ThemeScope` hooks (`usePalette`, `useChartFont`), `charts/util.ts` helpers, `var(--series-N)` colors, keyboard focus + tooltip like `DonutChart`.
4. `components/WidgetBody.tsx`: (a) `widgetProblem` case returning a Japanese message for invalid settings (missing column, wrong type, non-additive agg); (b) `WidgetBody` `switch (w.kind)` case: compute data, return `<Empty />` when no data, honor `fmt(w.measure)`, `color`, `titles`, `onToggleValue` (click-to-filter; ignore the widget's own dimension filter via `filterRows(frame, filters, filter.id)` as bar/donut do).
5. `core/autoDashboard.ts`: `defaultWidget` case (used by the editor's kind switcher; pick sensible columns from `columnRoles`, set `title: ""`, `span`). Add to `autoWidgets` only if it should appear on first import (usually not).
6. `core/format.ts`: `widgetTitle` case (auto title when `title` is empty). New unit/label maps go here (`*_LABEL`, Japanese).
7. `core/export.ts`: `usedColumns` case adding every column key the widget references (drives hidden-column pruning, `planExport`, template column list). Forgetting this silently drops data from exported HTML.
8. `app/widgetFields/xxx.tsx`: export `XxxData` and `XxxDisplay` (props `FieldProps<XxxWidget>`; use `ColumnSelect`, `MeasureFields` (`aggs` limits allowed aggregations), `Section`).
9. `app/widgetFields/index.tsx`: add cases to `DataFields` and `DisplayFields` (return `null` if no display options).
10. `app/widgetFields/BasicFields.tsx`: add entry to `KINDS` (`label` Japanese, Phosphor `*Icon`).
11. `app/widgetFields/display.tsx`: `usesColor` (single-color kinds) and `hasAxes` (axis-title toggle). `numberFormat.tsx`: `hasNumberFormat` returns false for kinds with no numbers.
12. `app/WidgetEditor.tsx`: only if the kind needs special section titles/hiding or `changeKind` must drop `numberFormat` (see the `note` special-cases).
13. `styles/base.css` (shared with viewer): chart styles. `app.css` only for editor chrome. Find sections via the CSS index at the end of docs/CODEMAP.md.
14. Tests: new `core/<topic>.test.ts` or extend `core/widgets2.test.ts` (uses `sampleSales`, `createDashboard`, `buildFrame`, `filterRows`): test the aggregate function, edge cases (empty, all-null), and `usedColumns`/`widgetTitle` for the new kind.

## No change needed
- `viewer/main.tsx`, `components/WidgetCard.tsx`, `app/EditableGrid.tsx`, `DashboardPage.tsx`: they render through `WidgetCard` -> `WidgetBody` and `widgetTitle`. `addWidget` in DashboardPage creates a "bar"; the kind is chosen in the editor.
- Persistence/import-export format: widgets are plain JSON in `Dashboard`; keep new fields optional so older saved dashboards and exported HTML still load.

## Pitfalls
- UI text is Japanese (labels, problems, aria-labels, auto titles); identifiers/comments English.
- Everything in `components/` and `core/` is bundled into the viewer: run `bun run build:viewer` before checking exported HTML (`dev` does not watch).
- `core/` must not import `app/` or `components/`.
- Charts must work without hover (print/keyboard) and with the texture setting; see `Texture.tsx` if series are color-coded.
- Re-run `bun run codemap` after adding files/exports so the map stays accurate this session.

## Verify
`bun run typecheck && bun run test && bun run smoke` (smoke loads a sample, lists widget titles, fails on console errors). For visuals add `bun run smoke --shot out.png` and view it; to see the new kind, add it via the editor kind switcher.
