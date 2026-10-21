/**
 * Text-only browser smoke test: starts the dev server, imports a sample file in
 * headless Chromium, auto-creates widgets and prints a compact report.
 * Exits 1 on console/page errors or when no widgets render.
 *
 *   bun run smoke [file] [--shot out.png]
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = join(import.meta.dirname, "..");
const PORT = 5399;
const URL = `http://localhost:${PORT}/`;
const MAX_TITLES = 30;

const args = process.argv.slice(2);
const shotAt = args.indexOf("--shot");
const shot = shotAt >= 0 ? resolve(args.splice(shotAt, 2)[1] ?? "smoke.png") : null;
const sample = args[0] ? resolve(args[0]) : defaultSample();

function defaultSample() {
  const dir = join(ROOT, "samples", "売上");
  const csv = readdirSync(dir).filter((f) => f.endsWith(".csv")).sort()[0];
  return join(dir, csv);
}

async function waitForServer(server: ChildProcess) {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("vite exited before becoming ready");
    try {
      if ((await fetch(URL)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("vite did not become ready in 20s");
}

async function main() {
  const t0 = Date.now();
  if (!existsSync(join(ROOT, "src/generated/viewer.js"))) {
    spawnSync("bun", ["run", "build:viewer"], { cwd: ROOT, stdio: "inherit" });
  }
  const server = spawn("bunx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: ROOT, stdio: "ignore" });
  const stop = () => server.kill();
  process.on("exit", stop);
  process.on("SIGINT", () => process.exit(130));

  const errors = new Set<string>();
  let titles: string[] = [];
  let title = "";
  const browser = await (async () => {
    await waitForServer(server);
    return chromium.launch();
  })();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on("console", (m) => m.type() === "error" && errors.add(`console: ${m.text()}`));
    page.on("pageerror", (e) => errors.add(`pageerror: ${e.message}`));

    await page.goto(URL);
    await page.locator("input[type=file]").setInputFiles(sample);

    // Widgets may be created on import; otherwise the empty state offers 「自動で作成」.
    const widgets = page.locator("section.widget");
    const auto = page.getByRole("button", { name: "自動で作成" });
    await auto.or(widgets.first()).first().waitFor({ timeout: 30_000 });
    if (await auto.isVisible()) await auto.click();
    await widgets.first().waitFor({ timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(500); // let charts settle and late errors surface

    title = await page.title();
    titles = await page.locator("section.widget .widget-title").allInnerTexts();
    if (shot) await page.screenshot({ path: shot, fullPage: true });
  } catch (e) {
    errors.add(`smoke: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  } finally {
    await browser.close();
    stop();
  }

  console.log(`file:    ${sample}`);
  console.log(`title:   ${title}`);
  console.log(`widgets: ${titles.length}`);
  titles.slice(0, MAX_TITLES).forEach((t) => console.log(`  - ${t}`));
  if (titles.length > MAX_TITLES) console.log(`  ... +${titles.length - MAX_TITLES} more`);
  console.log(`errors:  ${errors.size}`);
  errors.forEach((e) => console.log(`  ! ${e}`));
  if (shot) console.log(`shot:    ${shot}`);
  console.log(`elapsed: ${Date.now() - t0}ms`);
  process.exit(errors.size > 0 || titles.length === 0 ? 1 : 0);
}

void main();
