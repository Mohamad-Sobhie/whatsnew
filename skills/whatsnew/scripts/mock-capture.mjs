#!/usr/bin/env node
// Screenshot a built single-page app (dist/) with every API call answered from mock data.
// No login, no backend, no database — and it renders the app's real UI code.
//
//   node mock-capture.mjs --dist <dir> --mocks whatsnew-output/mocks.mjs --shots whatsnew-output/mock-shots.json
//                         --label after [--out whatsnew-output/shots] [--api /api] [--base /]
//                         [--width 1920 --height 1080 --scale 2] [--frame 1458x820]
//                         [--expect "text from the new feature"] [--allow fonts.googleapis.com,fonts.gstatic.com]
//
// How it works: the browser loads http://localhost:4173<base>. Playwright intercepts every request:
//   - paths under --api (repeatable, default /api)  → answered by mock() from the mocks module
//   - files that exist in --dist                    → served from disk
//   - other same-origin paths                       → index.html (client-side routes)
//   - other hosts                                   → mock() gets a chance, else blocked (--allow lets some through)
// Every unanswered API call is logged as MISS, every page error as PAGEERROR. Add mocks and run
// again until a shot logs neither. Nothing listens on a port, so nothing can clash.
//
// mocks module (ES module):
//   export function mock(method, path, searchParams, req) { ... }
//     return undefined            → MISS (answered 404, logged)
//     return any JSON value       → 200 with that JSON
//     return { $status: 204 }     → that status, optional $body (JSON or string), $headers, $file (path to send)
//   export async function init(page, context) { ... }   optional: seed localStorage, cookies, clock, …
//   req = { url, host, body, json() } — body of POST/PUT as text; json() parses it
//
// shots file: JSON  { "shots": [ { "name", "path", "actions": [...], "capture": "page" | "<selector>",
//                                  "box": ["<selector>", ...], "waitFor": "<selector>", "only": "before|after" } ] }
//   actions: { "click": sel } { "type": [sel, text] } (key by key) { "fill": [sel, text] } { "press": key }
//            { "hover": sel } { "select": [sel, value] } { "check": sel } { "setInputFiles": [sel, file | [files]] }
//            { "waitFor": sel } { "wait": ms } { "goto": path } { "scroll": px } { "shot": name } (extra screenshot)
//   or an ES module: export default async function ({ page, goto, act, shot, box, log }) { ... }
//     shot(name, selector | "page"), box(selector, [frameSelector]) → prints 2× coordinates for .spot

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { extname, join, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
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
const all = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));

const dist = resolve(opt("dist", "dist"));
const mocksPath = opt("mocks", "whatsnew-output/mocks.mjs");
const shotsPath = opt("shots", "whatsnew-output/mock-shots.json");
const label = opt("label", "after");
const outDir = opt("out", "whatsnew-output/shots");
const apiPrefixes = all("api").length ? all("api") : ["/api"];
let base = opt("base", "/");
if (!base.startsWith("/")) base = `/${base}`;
if (!base.endsWith("/")) base = `${base}/`;
const width = Number(opt("width", 1920));
const height = Number(opt("height", 1080));
const scale = Number(opt("scale", 2));
const [frameW, frameH] = opt("frame", "1458x820").split("x").map(Number);
const allow = (opt("allow", "") || "").split(",").map((s) => s.trim()).filter(Boolean);
const expect = all("expect");
const ORIGIN = "http://localhost:4173";

if (!existsSync(join(dist, "index.html"))) {
  console.error(`error: ${dist} has no index.html — point --dist at the build output (dist/, build/, wwwroot/).`);
  process.exit(1);
}
if (!existsSync(mocksPath)) { console.error(`error: mocks module not found: ${mocksPath}`); process.exit(1); }
if (!existsSync(shotsPath)) { console.error(`error: shots file not found: ${shotsPath}`); process.exit(1); }

// ---------- is the build current? ----------
function newestMtime(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return t;
}
try {
  const commitTime = Number(execFileSync("git", ["-C", dist, "log", "-1", "--format=%ct"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()) * 1000;
  const built = newestMtime(dist);
  if (built && commitTime && built < commitTime) {
    console.warn(`warning: ${dist} was built before the latest commit in its repo (${new Date(built).toISOString()} < ${new Date(commitTime).toISOString()}). Rebuild it if the change isn't in it.`);
  }
} catch { /* not in a git repo — skip */ }
if (expect.length) {
  const bundle = readdirSync(dist, { recursive: true })
    .filter((f) => /\.(js|mjs|html)$/.test(String(f)))
    .map((f) => readFileSync(join(dist, String(f)), "utf8")).join("\n");
  for (const e of expect) {
    if (!bundle.includes(e)) console.warn(`warning: "${e}" is not in the build — it is probably stale. Rebuild with the project's own build command.`);
    else console.log(`build check: found "${e}"`);
  }
}

// ---------- load mocks and shots ----------
const mocks = await import(`${pathToFileURL(resolve(mocksPath)).href}?t=${Date.now()}`);
if (typeof mocks.mock !== "function") { console.error("error: the mocks module must export function mock(method, path, searchParams, req)"); process.exit(1); }
const shotsIsModule = /\.m?js$/.test(shotsPath);
const plan = shotsIsModule ? null : JSON.parse(readFileSync(shotsPath, "utf8"));
mkdirSync(outDir, { recursive: true });

const log = [];
const note = (line) => { log.push(line); console.log(`[${label}] ${line}`); };
const misses = new Set();
const pageErrors = new Set();

// ---------- browser ----------
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
} catch {
  browser = await chromium.launch({ headless: true });   // Google Chrome not installed — bundled Chromium is fine
}
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: scale,
  serviceWorkers: "block",           // a cached service worker would bypass the mocks
  reducedMotion: "reduce",
  colorScheme: plan?.colorScheme ?? "light",
  locale: plan?.locale ?? "en-US",
});
const page = await context.newPage();
if (typeof mocks.init === "function") await mocks.init(page, context);   // e.g. page.addInitScript to seed storage

page.on("pageerror", (e) => { const m = e.message.split("\n")[0]; if (!pageErrors.has(m)) { pageErrors.add(m); note(`PAGEERROR ${m}`); } });
// "Failed to load resource" just repeats a MISS/BLOCKED line, so it's left out.
page.on("console", (m) => { if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) note(`console.error ${m.text().slice(0, 200)}`); });

const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff",
  ".ico": "image/x-icon", ".pdf": "application/pdf", ".wasm": "application/wasm", ".map": "application/json" };

async function answer(route, result) {
  if (result && typeof result === "object" && ("$status" in result || "$file" in result || "$body" in result)) {
    const headers = { "access-control-allow-origin": "*", ...(result.$headers ?? {}) };
    if (result.$file) return route.fulfill({ status: result.$status ?? 200, path: result.$file, headers });
    const body = result.$body === undefined ? "" : typeof result.$body === "string" ? result.$body : JSON.stringify(result.$body);
    if (result.$body !== undefined && typeof result.$body !== "string") headers["content-type"] = "application/json";
    return route.fulfill({ status: result.$status ?? 200, body, headers });
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result), headers: { "access-control-allow-origin": "*" } });
}

await context.route("**/*", async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  const isApp = u.origin === ORIGIN;
  const info = { url: u.href, host: u.host, body: req.postData() ?? "", json: () => JSON.parse(req.postData() || "null") };
  const path = decodeURIComponent(u.pathname);

  const isApi = apiPrefixes.some((p) => path.startsWith(p) || path.startsWith(base.replace(/\/$/, "") + p));
  if (isApi || !isApp) {
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    let result;
    try { result = await mocks.mock(req.method(), isApp ? path : u.href, u.searchParams, info); }
    catch (e) { note(`MOCKERROR ${req.method()} ${path}: ${e.message}`); return route.fulfill({ status: 500, body: e.message }); }
    if (result !== undefined) return answer(route, result);
    if (!isApp) {
      if (allow.includes(u.hostname)) return route.continue();
      note(`BLOCKED ${req.method()} ${u.href.slice(0, 160)}`);
      return route.abort();
    }
    const key = `${req.method()} ${path}${u.search}`;
    if (!misses.has(key)) { misses.add(key); note(`MISS ${key}`); }
    return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not mocked"}' });
  }

  // static files from dist, SPA fallback to index.html
  const rel = path.startsWith(base) ? path.slice(base.length) : path.slice(1);
  const file = normalize(join(dist, rel));
  if (!file.startsWith(dist + sep) && file !== dist) return route.fulfill({ status: 403 });
  const exists = (f) => existsSync(f) && statSync(f).isFile();
  const send = (f) => route.fulfill({ status: 200, path: f, headers: { "content-type": TYPES[extname(f).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" } });
  if (exists(file)) return send(file);
  if (exists(join(file, "index.html"))) return send(join(file, "index.html"));
  if (extname(rel)) { note(`MISSING FILE ${path}`); return route.fulfill({ status: 404 }); }
  return send(join(dist, "index.html"));
});

// ---------- shot helpers ----------
const url = (p = "/") => new URL(p.replace(/^\//, ""), ORIGIN + base).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const manifest = [];
let lastFrame = { x: 0, y: 0, width, height };

async function settle() {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.addStyleTag({ content: "*,*::before,*::after{caret-color:transparent!important}" }).catch(() => {});
  await sleep(plan?.settleMs ?? 500);
}
async function goto(p) {
  await page.goto(url(p), { waitUntil: "networkidle", timeout: 60_000 }).catch((e) => note(`GOTO ${p}: ${e.message.split("\n")[0]}`));
  await settle();
}
async function act(a) {
  const L = (s) => page.locator(s).first();
  if (a.click) await L(a.click).click({ timeout: 10_000 });
  else if (a.type) { await L(a.type[0]).click({ timeout: 10_000 }); await L(a.type[0]).pressSequentially(String(a.type[1]), { delay: 40 }); }
  else if (a.fill) await L(a.fill[0]).fill(String(a.fill[1]), { timeout: 10_000 });
  else if (a.press) await page.keyboard.press(a.press);
  else if (a.hover) await L(a.hover).hover({ timeout: 10_000 });
  else if (a.select) await L(a.select[0]).selectOption(String(a.select[1]));
  else if (a.check) await L(a.check).check({ timeout: 10_000 });
  else if (a.setInputFiles) await L(a.setInputFiles[0]).setInputFiles(a.setInputFiles[1]);
  else if (a.waitFor) await L(a.waitFor).waitFor({ timeout: 15_000 });
  else if (a.wait) await sleep(Number(a.wait));
  else if (a.goto) await goto(a.goto);
  else if (a.scroll !== undefined) await page.mouse.wheel(0, Number(a.scroll));
  else if (a.shot) await shot(a.shot, a.capture ?? "page", a.pad ?? 0);
  else throw new Error(`unknown action ${JSON.stringify(a)}`);
  if (!a.wait && !a.shot) await sleep(250);
}

// what: "page" | "<selector>" | ["<selector>", ...] (crop around all of them — for dropdowns and
// popovers that hang outside their parent). pad: extra CSS px around a crop.
async function shot(name, what = "page", pad = 0) {
  await settle();
  const file = join(outDir, `${label}-${name}.png`);
  if (what === "page") {
    await page.screenshot({ path: file });
    lastFrame = { x: 0, y: 0, width, height };
  } else {
    const sels = [].concat(what);
    const boxes = [];
    for (const sel of sels) {
      const el = page.locator(sel).first();
      if (boxes.length === 0) await el.scrollIntoViewIfNeeded();
      const b = await el.boundingBox();
      if (!b) throw new Error(`capture element not visible: ${sel}`);
      boxes.push(b);
    }
    const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
    const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
    const r = Math.min(width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
    const btm = Math.min(height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
    lastFrame = { x, y, width: r - x, height: btm - y };
    await page.screenshot({ path: file, clip: lastFrame });
  }
  manifest.push({ name, file, capture: what, frame: lastFrame, ok: true });
  note(`SHOT ${name} → ${file}`);
  return file;
}

// Where an element is, for .spot (percent of the shot) and the pan/zoom scene (see composition.md).
async function box(selector, frameSelector) {
  const target = page.locator(selector).first();
  if ((await target.count()) === 0) { note(`BOX ${selector}: not found`); return null; }
  const b = await target.boundingBox();
  const f = frameSelector ? await page.locator(frameSelector).first().boundingBox() : lastFrame;
  const rx = b.x - f.x, ry = b.y - f.y;
  const pct = (v, t) => +((v / t) * 100).toFixed(2);
  const spot = { x: pct(rx, f.width), y: pct(ry, f.height), w: pct(b.width, f.width), h: pct(b.height, f.height) };
  // pan/zoom values for a frame of frameW×frameH showing this shot (origin 0 0, translate then scale)
  const fx = (rx + b.width / 2) / f.width, fy = (ry + b.height / 2) / f.height;
  const zFit = Math.min((0.55 * f.width) / b.width, (0.55 * f.height) / b.height);
  const z = +Math.max(1, Math.min(2.4, zFit)).toFixed(2);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const tx = Math.round(clamp(frameW / 2 - z * fx * frameW, frameW - z * frameW, 0));
  const ty = Math.round(clamp(frameH / 2 - z * fy * frameH, frameH - z * frameH, 0));
  const px2 = { x: Math.round(rx * scale), y: Math.round(ry * scale), w: Math.round(b.width * scale), h: Math.round(b.height * scale) };
  note(`BOX ${selector}: ${px2.x},${px2.y} ${px2.w}×${px2.h} (${scale}× px) | spot --x:${spot.x}%; --y:${spot.y}%; --w:${spot.w}%; --h:${spot.h}% | pan --z:${z}; --tx:${tx}px; --ty:${ty}px`);
  const entry = manifest[manifest.length - 1];
  if (entry) (entry.boxes ??= {})[selector] = { px2, spot, pan: { z, tx, ty, frame: `${frameW}x${frameH}` } };
  return { px2, spot, pan: { z, tx, ty } };
}

// ---------- run ----------
try {
  if (shotsIsModule) {
    const mod = await import(`${pathToFileURL(resolve(shotsPath)).href}?t=${Date.now()}`);
    await mod.default({ page, context, goto, act, shot, box, log: note, label });
  } else {
    for (const s of plan.shots ?? []) {
      if (s.only && s.only !== label) continue;
      try {
        await goto(s.path ?? "/");
        for (const a of s.actions ?? []) await act(a);
        if (s.waitFor) await page.locator(s.waitFor).first().waitFor({ timeout: 15_000 });
        await shot(s.name, s.capture ?? "page", s.pad ?? 0);
        for (const sel of [].concat(s.box ?? [])) await box(sel);
      } catch (e) {
        manifest.push({ name: s.name, ok: false, error: e.message.split("\n")[0] });
        note(`FAILED ${s.name}: ${e.message.split("\n")[0]}`);
      }
    }
  }
} finally {
  await browser.close();
}

const summary = { label, dist, misses: [...misses], pageErrors: [...pageErrors], shots: manifest };
writeFileSync(join(outDir, `${label}-mock-manifest.json`), JSON.stringify(summary, null, 2));
writeFileSync(join(outDir, `${label}-mock-log.txt`), log.join("\n") + "\n");
const ok = manifest.filter((m) => m.ok).length;
console.log(`[${label}] ${ok}/${manifest.length} shots, ${misses.size} unanswered API calls, ${pageErrors.size} page errors → ${outDir}`);
if (misses.size || pageErrors.size) {
  console.log(`[${label}] Not done yet: add mocks for the MISS lines (and fix what causes PAGEERROR), run again, and look at every PNG.`);
  process.exitCode = 4;
}
