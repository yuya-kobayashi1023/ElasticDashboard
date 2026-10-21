/**
 * Generates docs/CODEMAP.md: a compact map of every source file (purpose,
 * exports, internal imports, reverse imports) plus a CSS section index.
 * Deterministic: re-running on unchanged sources produces identical output.
 *
 *   bun run codemap           write docs/CODEMAP.md
 *   bun run codemap --check   exit 1 if docs/CODEMAP.md is out of date
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "docs", "CODEMAP.md");
const DIRS = ["src/core", "src/app", "src/components", "src/components/charts", "src/viewer", "scripts"];
const MAX_USED_BY = 6; // longer reverse-import lists are truncated to keep the map small
const LONE_FILES = ["src/main.tsx"]; // top-level source files outside DIRS

interface FileInfo {
  path: string; // relative to repo root, e.g. src/core/aggregate.ts
  lines: number;
  purpose: string;
  values: string[];
  types: string[];
  imports: string[]; // short module names, e.g. core/aggregate
  isTest: boolean;
}

/** Short module name used in the map: path under src/ (or repo root) without extension. */
const shortName = (p: string) => p.replace(/^src\//, "").replace(/\.tsx?$/, "");

function listFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => `${dir}/${e.name}`)
    .sort();
}

/** Resolve a relative import specifier to a repo-relative file path, or null if it is not a source file. */
function resolveImport(from: string, spec: string): string | null {
  const base = relative(ROOT, resolve(ROOT, dirname(from), spec.replace(/\?.*$/, "")));
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (/\.tsx?$/.test(c) && existsSync(join(ROOT, c))) return c;
  }
  return null;
}

/** First leading comment block (`//` lines or one block comment), flattened to one line. */
function leadingComment(text: string): string {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const out: string[] = [];
  if (lines[i]?.trimStart().startsWith("//")) {
    for (; i < lines.length && lines[i].trimStart().startsWith("//"); i++) out.push(lines[i].replace(/^\s*\/\/\s?/, ""));
  } else if (lines[i]?.trimStart().startsWith("/*")) {
    for (; i < lines.length; i++) {
      out.push(lines[i].replace(/^\s*(\/\*+|\*+\/?)\s?/, "").replace(/\s*\*+\/\s*$/, ""));
      if (lines[i].includes("*/")) break;
    }
  }
  // Stop at the first blank line or usage example (indented / "bun run" lines).
  const para: string[] = [];
  for (const l of out) {
    if (l.trim() === "" && para.length) break;
    if (/^\s{2,}\S/.test(l) && para.length) break;
    if (l.trim()) para.push(l.trim());
  }
  const s = para.join(" ");
  return s.length > 160 ? s.slice(0, 157) + "..." : s;
}

function analyze(path: string): FileInfo {
  const text = readFileSync(join(ROOT, path), "utf8");
  const values = new Set<string>();
  const types = new Set<string>();

  for (const m of text.matchAll(/^export\s+(?:declare\s+)?(?:async\s+)?(function\*?|class|const|let|interface|type|enum)\s+(\w+)/gm)) {
    (m[1] === "interface" || m[1] === "type" ? types : values).add(m[2]);
  }
  if (/^export\s+default\b/m.test(text)) values.add("default");
  // export { a, type B as C } [from "x"]
  for (const m of text.matchAll(/^export\s+(type\s+)?\{([^}]*)\}/gm)) {
    for (const part of m[2].split(",")) {
      const t = part.trim();
      if (!t) continue;
      const isType = !!m[1] || t.startsWith("type ");
      const name = t.replace(/^type\s+/, "").split(/\s+as\s+/).pop()!.trim();
      (isType ? types : values).add(name);
    }
  }

  // Static imports (multi-line aware), re-exports and dynamic import("...") with a literal.
  const specs = new Set<string>();
  for (const m of text.matchAll(/^(?:import|export)\b[^"'`;]*?\bfrom\s*["']([^"']+)["']/gm)) specs.add(m[1]);
  for (const m of text.matchAll(/^import\s*["']([^"']+)["']/gm)) specs.add(m[1]);
  for (const m of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specs.add(m[1]);
  const imports = [...specs]
    .filter((s) => s.startsWith("."))
    .map((s) => resolveImport(path, s))
    .filter((p): p is string => p !== null && p !== path)
    .map(shortName);

  return {
    path,
    lines: text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length,
    purpose: leadingComment(text),
    values: [...values],
    types: [...types],
    imports: [...new Set(imports)].sort(),
    isTest: /\.test\.tsx?$/.test(path),
  };
}

/** Section comments (`/* ... *\/` at line start) with their line ranges. */
function cssIndex(file: string): string {
  const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const marks: { line: number; title: string }[] = [];
  lines.forEach((l, i) => {
    const m = l.match(/^\/\*\s*(.*?)\s*\*\/\s*$/);
    if (m) marks.push({ line: i + 1, title: m[1].replace(/^[-=\s]+|[-=\s]+$/g, "") });
  });
  const rows = marks.map((m, k) => `- ${m.line}-${k + 1 < marks.length ? marks[k + 1].line - 1 : lines.length}: ${m.title}`);
  return `### ${file} (${lines.length})\n${rows.join("\n")}`;
}

function build(): string {
  const files = [...DIRS.flatMap(listFiles), ...LONE_FILES].map(analyze);
  const usedBy = new Map<string, string[]>();
  for (const f of files) {
    if (f.isTest) continue; // tests are listed separately; keep reverse imports to real consumers
    for (const imp of f.imports) usedBy.set(imp, [...(usedBy.get(imp) ?? []), shortName(f.path)]);
  }

  const out: string[] = ["Generated by `bun run codemap`. Do not edit by hand.", ""];
  out.push("Format: `path` (lines) - purpose (from leading comment, blank if none). Module names are relative to src/.", "");

  const entry = (f: FileInfo) => {
    const s = shortName(f.path);
    const rows = [`\`${f.path}\` (${f.lines})${f.purpose ? ` - ${f.purpose}` : ""}`];
    const ex = [f.values.join(", "), f.types.length ? `types: ${f.types.join(", ")}` : ""].filter(Boolean).join("; ");
    if (ex) rows.push(`  exports: ${ex}`);
    if (f.imports.length) rows.push(`  imports: ${f.imports.join(", ")}`);
    const ub = [...new Set(usedBy.get(s) ?? [])].sort();
    if (ub.length) rows.push(`  used by: ${ub.slice(0, MAX_USED_BY).join(", ")}${ub.length > MAX_USED_BY ? `, +${ub.length - MAX_USED_BY} more` : ""}`);
    return rows.join("\n");
  };

  const sections = [...DIRS, "src (top level)"];
  for (const dir of sections) {
    const inDir = files.filter((f) => !f.isTest && (dir === "src (top level)" ? LONE_FILES.includes(f.path) : dirname(f.path) === dir));
    if (!inDir.length) continue;
    out.push(`## ${dir}`, ...inDir.map(entry), "");
  }

  const tests = files.filter((f) => f.isTest);
  if (tests.length) {
    out.push("## Tests (vitest, `bun run test`)");
    for (const t of tests) out.push(`- \`${t.path}\` (${t.lines}) - imports: ${t.imports.join(", ")}`);
    out.push("");
  }

  // Layer rule: core must not depend on the UI layers.
  const violations: string[] = [];
  for (const f of files) {
    if (!f.path.startsWith("src/core/") || f.isTest) continue;
    for (const imp of f.imports) {
      if (imp.startsWith("app/") || imp.startsWith("components/")) violations.push(`${shortName(f.path)} -> ${imp}`);
    }
  }
  out.push("## Layers", "core <- (app, components, viewer). src/core must not import src/app or src/components.");
  out.push(`violations: ${violations.length ? violations.join(", ") : "none"}`, "");

  out.push("## CSS index (Read with offset/limit)");
  const cssFiles = readdirSync(join(ROOT, "src/styles")).filter((n) => n.endsWith(".css")).sort();
  out.push(...cssFiles.map((n) => cssIndex(`src/styles/${n}`)));
  return out.join("\n") + "\n";
}

const next = build();
if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== next) {
    console.error("docs/CODEMAP.md is out of date. Run `bun run codemap` and include it in the commit.");
    process.exit(1);
  }
  console.log("docs/CODEMAP.md is up to date.");
} else {
  writeFileSync(OUT, next);
  console.log(`Wrote docs/CODEMAP.md (${Buffer.byteLength(next)} bytes)`);
}
