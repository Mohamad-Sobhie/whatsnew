#!/usr/bin/env node
// Take screenshots of a running app from a shot plan.
//
//   node capture.mjs --plan whatsnew-output/shots.json --url http://localhost:4102 --label after
//                    [--out whatsnew-output/shots] [--timeout 180]
//
// Writes <out>/<label>-<name>.png for every shot, and <out>/<label>-manifest.json with
// what succeeded, what failed and why. A failed shot never stops the run — on the
// "before" side a missing element often just means the feature didn't exist yet.
//
// Plan format: see references/capture.md.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("error: Playwright not found. Run: npm install --prefix <skill-dir>/scripts && npx --prefix <skill-dir>/scripts playwright install chromium");
  process.exit(1);
}

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};

const planPath = opt("plan", "whatsnew-output/shots.json");
const baseUrl = opt("url");
const label = opt("label");
const outDir = opt("out", "whatsnew-output/shots");
const readyTimeout = Number(opt("timeout", 180)) * 1000;

if (!baseUrl || !label) {
  console.error("usage: node capture.mjs --plan shots.json --url http://localhost:4102 --label before|after [--out dir] [--timeout s]");
  process.exit(1);
}

const plan = JSON.parse(readFileSync(planPath, "utf8"));
const viewport = plan.viewport ?? { width: 1440, height: 900 };
const scale = plan.scale ?? 2;
const shots = plan.shots ?? [];
mkdirSync(outDir, { recursive: true });

// Dev-mode overlays and badges that should never appear in a product video.
const HIDE = [
  "nextjs-portal", "[data-nextjs-toast]", "[data-next-badge-root]", "#__next-build-watcher",
  "vite-error-overlay", "#webpack-dev-server-client-overlay", "astro-dev-toolbar",
  "#react-refresh-overlay", ".tsqd-parent-container", "[data-tanstack-query-devtools]",
  ...(plan.hide ?? []),
];
const HIDE_CSS = `${HIDE.join(",")} { display: none !important; }
*, *::before, *::after { caret-color: transparent !important; }`;

const url = (path = "/") => new URL(path, baseUrl).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  const deadline = Date.now() + readyTimeout;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url(plan.readyPath ?? "/"), { redirect: "manual" });
      if (res.status < 500) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e.cause?.code ?? e.message;
    }
    await sleep(1500);
  }
  throw new Error(`server at ${baseUrl} not ready after ${readyTimeout / 1000}s (${last})`);
}

async function runActions(page, actions = []) {
  for (const a of actions) {
    if (a.click) await page.locator(a.click).first().click({ timeout: 10_000 });
    else if (a.fill) await page.locator(a.fill[0]).first().fill(String(a.fill[1]), { timeout: 10_000 });
    else if (a.press) await page.keyboard.press(a.press);
    else if (a.hover) await page.locator(a.hover).first().hover({ timeout: 10_000 });
    else if (a.select) await page.locator(a.select[0]).first().selectOption(String(a.select[1]));
    else if (a.check) await page.locator(a.check).first().check({ timeout: 10_000 });
    else if (a.scroll !== undefined) await page.mouse.wheel(0, Number(a.scroll));
    else if (a.waitFor) await page.locator(a.waitFor).first().waitFor({ timeout: 15_000 });
    else if (a.wait) await sleep(Number(a.wait));
    else if (a.goto) await page.goto(url(a.goto), { waitUntil: "networkidle" });
    else throw new Error(`unknown action ${JSON.stringify(a)}`);
  }
}

async function settle(page) {
  await page.addStyleTag({ content: HIDE_CSS }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await sleep(plan.settleMs ?? 400);
}

console.log(`[${label}] waiting for ${baseUrl} …`);
await waitForServer();

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: scale,
  colorScheme: plan.colorScheme ?? "light",
  reducedMotion: "reduce",
  locale: plan.locale ?? "en-US",
});
const page = await context.newPage();
const results = [];

try {
  if (plan.setup) {
    // e.g. log in with a demo account once; the session is shared by every shot.
    await page.goto(url(plan.setup.path ?? "/"), { waitUntil: "networkidle" });
    await runActions(page, plan.setup.actions);
    await settle(page);
    console.log(`[${label}] setup done`);
  }
} catch (e) {
  console.error(`[${label}] setup failed: ${e.message.split("\n")[0]}`);
}

for (const shot of shots) {
  if (shot.only && shot.only !== label) continue;
  const file = join(outDir, `${label}-${shot.name}.png`);
  const entry = { name: shot.name, file, path: shot.path };
  try {
    const res = await page.goto(url(shot.path), { waitUntil: "networkidle", timeout: 60_000 });
    entry.status = res?.status();
    if (entry.status >= 400) throw new Error(`HTTP ${entry.status} for ${shot.path}`);
    await runActions(page, shot.actions);
    if (shot.waitFor) await page.locator(shot.waitFor).first().waitFor({ timeout: 15_000 });
    await settle(page);

    // Where the changed element sits in the screenshot, as percentages — used for .spot in the video.
    const measureFocus = async (frame) => {
      if (!shot.focus) return;
      // A focus element that only exists on one side (new feature) must not fail the shot.
      const target = page.locator(shot.focus).first();
      if ((await target.count()) === 0) { entry.focusError = `focus element not on this side: ${shot.focus}`; return; }
      const fb = await target.boundingBox();
      if (!fb || !frame) { entry.focusError = `focus element not found: ${shot.focus}`; return; }
      const pct = (v, total) => `${((v / total) * 100).toFixed(1)}%`;
      entry.focus = {
        x: pct(fb.x - frame.x, frame.width), y: pct(fb.y - frame.y, frame.height),
        w: pct(fb.width, frame.width), h: pct(fb.height, frame.height),
      };
    };

    if (shot.selector) {
      const el = page.locator(shot.selector).first();
      await el.scrollIntoViewIfNeeded();
      await measureFocus(await el.boundingBox());
      await el.screenshot({ path: file });
    } else if (shot.fullPage) {
      const doc = await page.evaluate(() => ({
        x: -scrollX, y: -scrollY,
        width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight,
      }));
      await measureFocus(doc);
      await page.screenshot({ path: file, fullPage: true });
    } else {
      await measureFocus({ x: 0, y: 0, width: viewport.width, height: viewport.height });
      await page.screenshot({ path: file });
    }
    entry.ok = true;
    console.log(`[${label}] ✓ ${shot.name}${entry.focus ? ` (focus ${Object.values(entry.focus).join(" ")})` : ""}${entry.focusError ? ` (${entry.focusError})` : ""}`);
  } catch (e) {
    entry.ok = false;
    entry.error = e.message.split("\n")[0];
    console.log(`[${label}] ✗ ${shot.name}: ${entry.error}`);
  }
  results.push(entry);
}

await browser.close();
writeFileSync(join(outDir, `${label}-manifest.json`), JSON.stringify({ label, baseUrl, viewport, scale, results }, null, 2));
const ok = results.filter((r) => r.ok).length;
console.log(`[${label}] ${ok}/${results.length} shots captured → ${outDir}`);
