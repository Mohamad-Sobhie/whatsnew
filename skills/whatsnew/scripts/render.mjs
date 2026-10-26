#!/usr/bin/env node
// Render an HTML composition to MP4 by seeking its CSS animations frame by frame.
// Usage: node render.mjs <composition.html> <out.mp4> [--fps 30] [--scale 1]
//
// Deterministic: every frame is captured at its exact timestamp, so output is smooth
// no matter how fast the machine is.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

// require() (unlike import) also honours NODE_PATH, so a global Playwright install works too.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("error: Playwright not found. Run: npm install --prefix <skill-dir>/scripts && npx --prefix <skill-dir>/scripts playwright install chromium");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const [input, output = "whatsnew-output/whatsnew.mp4"] = positional;

if (!input || !existsSync(input)) {
  console.error("usage: node render.mjs <composition.html> <out.mp4> [--fps 30] [--scale 1]");
  process.exit(1);
}

const WIDTH = 1920;
const HEIGHT = 1080;
const scale = Number(flag("scale", 1));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: scale });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("requestfailed", (r) => errors.push(`failed to load ${r.url()}`));

await page.goto(pathToFileURL(resolve(input)).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);

// Missing fonts and images silently fall back or vanish in the video — surface them.
const broken = await page.evaluate(async () => {
  await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => {}))));
  return [
    ...[...document.fonts].filter((f) => f.status === "error").map((f) => `font failed to load: ${f.family}`),
    ...[...document.images].filter((i) => !i.naturalWidth).map((i) => `image failed to load: ${i.getAttribute("src")}`),
  ];
});
errors.push(...broken);

const meta = await page.evaluate(() => ({
  duration: Number(document.body.dataset.duration),
  fps: Number(document.body.dataset.fps || 30),
  animations: document.getAnimations().length,
}));
const fps = Number(flag("fps", meta.fps));

if (!meta.duration || meta.duration <= 0) {
  console.error('error: set <body data-duration="SECONDS"> in the composition');
  await browser.close();
  process.exit(1);
}
if (meta.animations === 0) console.warn("warning: no CSS animations found — the video will be static");
if (errors.length) console.warn("warnings:\n  " + errors.join("\n  "));

const totalFrames = Math.round(meta.duration * fps);

const ffmpeg = spawn("ffmpeg", [
  "-loglevel", "error", "-y",
  "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
  "-vf", `scale=${WIDTH}:${HEIGHT}:flags=lanczos`,
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  output,
], { stdio: ["pipe", "inherit", "inherit"] });

const ffmpegDone = new Promise((res, rej) => {
  ffmpeg.on("error", rej);
  ffmpeg.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with ${code}`))));
});

const started = Date.now();
for (let f = 0; f < totalFrames; f++) {
  const ms = (f / fps) * 1000;
  await page.evaluate((t) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = t;
    }
  }, ms);
  const frame = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ffmpeg.stdin.write(frame)) await new Promise((r) => ffmpeg.stdin.once("drain", r));
  if (f % fps === 0) process.stdout.write(`\rrendering ${Math.round((f / totalFrames) * 100)}%`);
}
ffmpeg.stdin.end();
await ffmpegDone;
await browser.close();

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\rrendered ${output} — ${meta.duration}s @ ${fps}fps (${totalFrames} frames) in ${secs}s`);
