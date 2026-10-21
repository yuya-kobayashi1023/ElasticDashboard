---
name: add-derived-column
description: Use when adding a new kind of calculated/derived column or a formula feature to elastic-dashboard (e.g. "計算列", "派生列", "add a formula function", "new derived column type", "IF/ROUND/SUM in formulas", "新しい計算列の種類"). Covers core/derive.ts, frame.ts, DerivedDialog, ColumnSettings, export, tests.
---

# Add a derived column kind / formula feature

Existing derivation kinds (`Derivation` in `core/types.ts`): `formula`, `datepart`, `lookup` (own dialog `app/LookupDialog.tsx`), `datecompose`. Template commit for a new kind: `b2e4fce` (datecompose). Formula grammar changes: see section B.

## A. New derivation kind
1. `core/types.ts`: add a variant to `Derivation` (plain JSON, stored in `ColumnMeta.derived`, saved in IndexedDB and exports; never rename existing fields).
2. `core/derive.ts`: pure compute function (`xxx(params, values: Map<string, ColumnValues>, n): Float64Array | (string|null)[]`, throw `FormulaError` with a Japanese message). Update:
   - `derivedSources`: returns source column keys. Drives `planExport` (keeps hidden source columns in the export). Missing = broken exported dashboards.
   - `describeDerived`: one-line Japanese description shown in ColumnSettings.
3. `core/frame.ts`: `frameSteps` derived loop: add `else if (d.kind === "xxx")` branch setting `values.set(col.key, { type, values })`. Note the final `else` is `datepart`; insert before it. Errors are caught per column and land in `frame.errors`. Derived columns evaluate in list order (later may use earlier).
4. `app/DerivedDialog.tsx`: add the kind to the `kind` state/selector, its params state (reset in the `open`/`editing` effect), `derivation()` (build the `Derivation`), `resultType` (`number|category|date|...`), `autoName`, form fields, and the `invalid` check. The live preview uses `buildFrame` with a probe column, so it works once frame.ts is done.
5. `app/ColumnSettings.tsx`: row label (`マスタ` vs `計算列`), edit button (`c.derived.kind !== "lookup"` opens DerivedDialog), delete handling. Usually no change for non-lookup kinds; check if the kind needs cleanup on delete.
6. Export/viewer: `core/export.ts` `planExport`/`pruneForExport` keep derived columns automatically (`c.derived`); only `derivedSources` matters. `viewer/main.tsx` and `components/useDashboardData.ts` rebuild the frame from `derived` metadata (cache key is `JSON.stringify(c.derived)`), so no change unless the kind carries extra data like `Lookup` (then add it to Dashboard and prune like `pruneLookups`).
7. Result type: if it should be a column type other than number/category/date, see `core/columnTypes.ts`, `TYPE_LABEL` in `core/format.ts`, `components/TypeIcon.tsx`.
8. CSS only if new controls: `styles/app.css` (Column settings / Dialogs sections).
9. Tests in `core/features.test.ts` (helper `calc(key, label, derived, type)`, `dash`, `buildFrame`): compute result, error case (`frame.errors`), `derivedSources`/`planExport` includes sources, `describeDerived`.

## B. New formula function / operator (inside `formula`)
Grammar lives only in `core/derive.ts`: `Node` type, `tokenize` (currently only `[col]`, numbers, `+-*/()`, `×÷`; unknown chars throw), `parseFormula` (primary/term/expr), `formulaRefs`, `toStoredFormula` (`print`), `evaluateFormula` (`ev`). Currently there are no functions or identifiers, so a function needs: identifier + `,` tokens, a new `Node` variant, parse, then update ALL FIVE of `formulaRefs`, `toStoredFormula`, `evaluateFormula`, and the parser; `displayFormula` only rewrites `[key]`. Then update the hint text and `placeholder` in `app/DerivedDialog.tsx`.
- Stored `expr` is persisted: new syntax must keep old expressions parsing identically; stored form must round-trip (`toStoredFormula` output re-parses to the same result).
- Evaluation runs per row with `Float64Array`; division by zero yields `NaN` (shown as blank); keep NaN propagation for missing cells.
- Only number/duration columns may be referenced (`evaluateFormula` throws otherwise).

## Pitfalls
- UI strings and `FormulaError` messages are Japanese.
- `core/` and the viewer share code: run `bun run build:viewer` before testing exported HTML.
- Big data: compute loops must stay O(n) and sync-friendly (`frameSteps` yields between columns for `buildFrameAsync`).
- Re-run `bun run codemap` after adding files/exports so the map stays accurate this session.

## Verify
`bun run typecheck && bun run test && bun run smoke`; for dialog changes also try it in the app (`bun run dev`, column settings -> 計算列を追加) since there are no component tests.
