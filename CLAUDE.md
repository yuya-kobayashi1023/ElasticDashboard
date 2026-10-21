# elastic-dashboard

CSV/Excel/JSON/pasted table -> auto-inferred column types -> editable dashboard (React 19 + TS + Vite + zustand), exportable as one self-contained HTML file (data gzip+base64 inside, viewer JS/CSS inlined). All processing is in-browser; nothing is sent out. Bun + vitest; runtimes via mise.

## Commands
- `bun run test` (vitest, node env) and `bun run typecheck` (tsc --noEmit) take <1s: run them freely.
- `bun run dev` / `bun run build` first run `build:viewer` (writes src/generated/); `bun run build:viewer` alone to refresh it.
- `bun run samples` regenerates samples/ (deterministic). `bun run smoke [file] [--shot out.png]` - headless browser check: loads a sample, prints widget titles and console errors as text, exit 1 on errors. Prefer it over Playwright MCP snapshots/screenshots; use MCP only for interactive UI checks.
- `bun run codemap` regenerates docs/CODEMAP.md (gitignored; a SessionStart hook regenerates it, so it is fresh at session start). Re-run it after adding/renaming files or exports mid-session.

## Navigation
- Read docs/CODEMAP.md first to locate code (per-file purpose, exports, imports, reverse imports, tests, layer check). It ends with a CSS index: use Read with offset/limit on styles instead of whole stylesheets.
- For symbol questions (where defined, who calls it, its type) use the LSP tool (workspaceSymbol, findReferences, incomingCalls, hover) before rg + Read. LSP runs on a global TS 6 (TS 7 has no tsserver) and can emit bogus diagnostics like "Cannot find name 'Set'"; ignore them and trust `bun run typecheck`.
- For broad "where/how is X done" sweeps, delegate to the `explorer` subagent (Haiku) and keep only its conclusion.
- Never read src/generated/, dist/, bun.lock (large, generated).

## Recording findings
- When an investigation took real effort (root cause, non-obvious why, where a behaviour lives), save the conclusion as a `project` memory: 2-5 lines with file:symbol pointers. Before investigating, check memory and sem-search (past sessions) for prior findings.
- Recurring multi-file changes have recipes in `.claude/skills/` (add-widget-kind, add-derived-column). Update a recipe when you find it wrong or incomplete.
- Tests: src/core/core.test.ts, src/core/features.test.ts (core logic only; no component tests).

## Architecture
- `src/core/` pure logic, no React; must not import app/ or components/ (codemap reports violations).
- `src/components/` shared UI (widgets, charts/, FilterBar, DataTable, ThemeScope) used by BOTH the editor and the exported viewer.
- `src/app/` editor-only: App, DashboardPage, dialogs, importer, ColumnSettings, WidgetEditor, store.ts.
- `src/viewer/main.tsx` standalone read-only viewer. `vite.viewer.config.ts` bundles it as an IIFE into src/generated/viewer.{js,css}; `app/buildExport.ts` imports those with `?raw` and `core/export.ts` inlines them into the HTML.
- Data flow: readFile (spawns parse.worker) -> parse/grid (text, delimited, xlsx) -> infer (column types) -> autoDashboard (columns, default widgets/filters) -> frame (coerceColumn/buildFrame, derived + lookup columns via derive.ts) -> aggregate (filterRows, groupBy, timeSeries, pivot...) -> components/WidgetBody + charts. `components/useDashboardData` builds the Frame for rendering.
- Types of Dashboard/Widget/Filter/ColumnMeta/Frame live in core/types.ts; widget kinds are a discriminated union.
- State: single zustand store (`useApp` in app/store.ts) with undo/redo snapshots (dashboard + raw rows). Persistence is IndexedDB via idb-keyval in core/storage.ts (keys `dash:<id>`, `rows:<id>`, plus an index).
- Export format: core/export.ts + core/exportFormat.ts (payload parse/append for re-import; exported HTML can be re-imported or used as a template without data).

## Gotchas
- Editing anything the viewer imports (components/, core/) changes exported HTML only after `bun run build:viewer`. `dev` builds the viewer once at startup (no watch), so rebuild it after such edits before testing export; `build` always rebuilds.
- Styles: base.css = shared with viewer; app.css = editor chrome. Despite app.css's leading comment ("not included in exported HTML"), viewer/main.tsx imports both, so both end up in viewer.css.
- UI strings are Japanese (columns/widgets labels live in core/format.ts: TYPE_LABEL, AGG_LABEL, BUCKET_LABEL). Keep new UI text Japanese.
- xlsx (SheetJS) is installed from the cdn.sheetjs.com tarball (npm version is stale); do not "fix" it to an npm range.
- Large files: parsing/inference run in a worker and frame/stats have async variants (buildFrameAsync, columnStatsAsync); keep heavy per-row work off the main thread path.
- The git tree may hold uncommitted feature work from parallel sessions; check `git status` before assuming a file is stable.

## Conventions
- Conventional Commits (`feat:`, `fix:`, ...); branches `feat/<topic>`, `fix/<topic>`. Code and comments English.
- docs/ are Japanese: PLAN.md (product plan), HEURISTICS.md (usability principles), TASKS.md (current QA log; finished items archived in docs/archive/TASKS-done.md), CODEMAP.md (generated, gitignored).
- samples/README.md explains the sample datasets.
