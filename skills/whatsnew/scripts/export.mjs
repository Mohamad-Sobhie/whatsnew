#!/usr/bin/env node
// Export the finished video in other formats.
//
//   node export.mjs [--gif] [--stills] [--screenshots] [--all]
//                   [--dir whatsnew-output] [--gif-width 960] [--gif-fps 15] [--scale 2]
//
// --gif          whatsnew-output/export/whatsnew.gif  — from whatsnew.mp4, for READMEs, Slack, Jira, emails
// --stills       whatsnew-output/export/stills/NN-<scene>.png — one sharp image per scene, taken from
//                composition.html at the moment the scene is complete (after reveals, pans and spotlights)
// --screenshots  whatsnew-output/export/screenshots/ — the clean app screenshots the video was made from
// Without a flag, --all.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const has = (f) => args.includes(`--${f}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const dir = opt("dir", "whatsnew-output");
const all = has("all") || !(has("gif") || has("stills") || has("screenshots"));
const want = { gif: all || has("gif"), stills: all || has("stills"), screenshots: all || has("screenshots") };
const out = join(dir, "export");
mkdirSync(out, { recursive: true });
const mb = (f) => (statSync(f).size / 1024 / 1024).toFixed(1);

function ff(argv) {
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...argv], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg failed");
}

// ---------- GIF ----------
if (want.gif) {
  const mp4 = join(dir, "whatsnew.mp4");
  if (!existsSync(mp4)) {
    console.error(`skip gif: ${mp4} not found — render the video first`);
  } else {
    const width = Number(opt("gif-width", 960));
    const fps = Number(opt("gif-fps", 15));
    const gif = join(out, "whatsnew.gif");
    // One palette for the whole clip (diff stats favour the moving parts), Bayer dither, and
    // only changed rectangles re-encoded: small files without banding on UI gradients.
    ff(["-i", mp4, "-vf",
      `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
      "-loop", "0", gif]);
    const size = Number(mb(gif));
    console.log(`gif         → ${gif} (${width}px, ${fps} fps, ${size} MB)`);
    if (size > 10) console.log(`            note: over 10 MB — Slack and GitHub handle it, email may not. Try --gif-width 720 --gif-fps 12.`);
  }
}

// ---------- stills: one per scene ----------
if (want.stills) {
  const comp = join(dir, "composition.html");
  if (!existsSync(comp)) {
    console.error(`skip stills: ${comp} not found`);
  } else {
    const require = createRequire(import.meta.url);
    let chromium;
    try { ({ chromium } = require("playwright")); } catch {
      console.error("skip stills: Playwright not found (npm install --prefix <skill-dir>/scripts)"); chromium = null;
    }
    if (chromium) {
      const scale = Number(opt("scale", 2));
      const stillsDir = join(out, "stills");
      mkdirSync(stillsDir, { recursive: true });
      const browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: scale });
      await page.goto(pathToFileURL(resolve(comp)).href, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      const scenes = await page.evaluate(() =>
        [...document.querySelectorAll(".scene")].map((el, i) => {
          const cs = getComputedStyle(el);
          const start = parseFloat(cs.getPropertyValue("--start")) || 0;
          const len = parseFloat(cs.getPropertyValue("--len")) || 4;
          const last = el.classList.contains("last");
          const pick = [".ui-title", ".headline", "h1", "h2", ".item", ".kicker"].map((q) => el.querySelector(q)).find(Boolean);
          const heading = pick?.textContent ?? `scene ${i + 1}`;
          // the moment everything has arrived: just before the fade-out (or near the end of the last scene)
          return { i, t: start + len - (last ? 0.15 : 0.55), heading };
        })
      );
      const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "scene";
      for (const s of scenes) {
        await page.evaluate((ms) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms; } }, s.t * 1000);
        const f = join(stillsDir, `${String(s.i + 1).padStart(2, "0")}-${slug(s.heading)}.png`);
        await page.screenshot({ path: f });
        console.log(`still       → ${f}`);
      }
      await browser.close();
    }
  }
}

// ---------- the app screenshots themselves ----------
if (want.screenshots) {
  const shots = join(dir, "shots");
  if (!existsSync(shots)) {
    console.error(`skip screenshots: no ${shots} (this video had no captured screens)`);
  } else {
    const dest = join(out, "screenshots");
    mkdirSync(dest, { recursive: true });
    const pngs = readdirSync(shots).filter((f) => f.endsWith(".png"));
    for (const f of pngs) copyFileSync(join(shots, f), join(dest, f));
    console.log(`screenshots → ${dest} (${pngs.length} PNGs, before-* and after-*)`);
  }
}
