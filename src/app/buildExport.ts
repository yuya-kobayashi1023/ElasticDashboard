import { renderExportHtml, type RenderOptions } from "../core/export";
import type { Dashboard, RawTable } from "../core/types";

/** Loads the prebuilt viewer bundle (only when exporting) and renders the HTML file. */
export async function buildExportHtml(d: Dashboard, raw: RawTable | null, opts: RenderOptions = {}): Promise<string> {
  const [{ default: js }, { default: css }] = await Promise.all([import("../generated/viewer.js?raw"), import("../generated/viewer.css?raw")]);
  return renderExportHtml(d, raw, js, css, opts);
}
