#!/usr/bin/env node
// Render still previews of a composition in each colour theme, so the user can pick one.
//
//   node preview.mjs <composition.html> [--at 2,9] [--themes dark,light,soft,bold] [--out <composition dir>/previews]
//
// --at       seconds to capture (default: middle of the first two scenes)
// Writes <out>/<theme>.png (the stills side by side) and <out>/all.png (every theme stacked,
// labelled), and prints each theme's main colours.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
const input = args[0];
if (!input || input.startsWith("--") || !existsSync(input)) {
  console.error("usage: node preview.mjs <composition.html> [--at 2,9] [--themes dark,light,soft,bold] [--out dir]");
  process.exit(1);
}
// Default: a previews/ folder next to the composition, wherever this is run from.
const outDir = opt("out", join(dirname(resolve(input)), "previews"));
const themes = opt("themes", "dark,light,soft,bold").split(",").map((t) => t.trim()).filter(Boolean);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(resolve(input)).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);

// Default capture times: halfway through the first two scenes (title + first moment).
let times = opt("at", "").split(",").filter(Boolean).map(Number);
if (!times.length) {
  times = await page.evaluate(() =>
    [...document.querySelectorAll(".scene")].slice(0, 2).map((el) => {
      const cs = getComputedStyle(el);
      const start = parseFloat(cs.getPropertyValue("--start")) || 0;
      const len = parseFloat(cs.getPropertyValue("--len")) || 4;
      return start + len * 0.42;   // after reveals and wipes, before most spotlights
    })
  );
}

const ff = (argv) => {
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...argv], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
};

const rows = [];
for (const theme of themes) {
  const colours = await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return { bg: v("--bg"), text: v("--fg"), accent: v("--accent"), exists: [...document.styleSheets].some((sh) => {
      try { return [...sh.cssRules].some((r) => r.selectorText?.includes(`data-theme="${t}"`)); } catch { return false; }
    }) };
  }, theme);
  if (!colours.exists) console.warn(`warning: no html[data-theme="${theme}"] block in the composition`);

  const frames = [];
  for (const [i, t] of times.entries()) {
    await page.evaluate((ms) => {
      for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; }
    }, t * 1000);
    const f = join(outDir, `.${theme}-${i}.png`);
    await page.screenshot({ path: f });
    frames.push(f);
  }

  const out = join(outDir, `${theme}.png`);
  const inputs = frames.flatMap((f) => ["-i", f]);
  const scaled = frames.map((_, i) => `[${i}]scale=960:-1[s${i}]`).join(";");
  const joined = frames.map((_, i) => `[s${i}]`).join("");
  ff([...inputs, "-filter_complex", `${scaled};${joined}hstack=inputs=${frames.length}`, out]);
  frames.forEach((f) => rmSync(f));
  rows.push({ theme, out });
  console.log(`${theme.padEnd(6)} background ${colours.bg}  text ${colours.text}  accent ${colours.accent}  → ${out}`);
}
await browser.close();

// One overview image: each theme's row with its name on the left.
const labelled = rows.map(({ theme, out }) => {
  const f = join(outDir, `.label-${theme}.png`);
  ff(["-i", out, "-vf", `pad=iw+260:ih:260:0:color=0x111111,drawtext=text='${theme}':x=36:y=(h-text_h)/2:fontsize=54:fontcolor=white`, f]);
  return f;
});
const all = join(outDir, "all.png");
try {
  ff([...labelled.flatMap((f) => ["-i", f]), "-filter_complex", `vstack=inputs=${labelled.length},scale=1600:-1`, all]);
} catch {
  // drawtext needs an ffmpeg built with freetype; fall back to unlabelled rows (order = --themes).
  ff([...rows.flatMap((r) => ["-i", r.out]), "-filter_complex", `vstack=inputs=${rows.length},scale=1600:-1`, all]);
  console.warn(`note: overview has no labels; rows are, top to bottom: ${themes.join(", ")}`);
}
labelled.forEach((f) => existsSync(f) && rmSync(f));
console.log(`overview → ${all}`);
