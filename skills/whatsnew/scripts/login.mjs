#!/usr/bin/env node
// Let the user log in to the app once, in a real browser window, and save the session
// so capture.mjs can take screenshots as a logged-in user.
//
//   node login.mjs --url http://localhost:4102 [--out whatsnew-output/auth.json] [--timeout 600] [--channel chrome|msedge]
//
// --channel  open the user's installed Chrome or Edge instead of Playwright's Chromium. Use it when
//            company sign-in (e.g. Entra ID conditional access) rejects unknown browsers.
//
// Opens a visible Chromium window at --url. The user logs in (SSO, MFA, anything) and then
// CLOSES THE WINDOW. The session (cookies, localStorage, IndexedDB and sessionStorage) is saved
// to --out. It contains login tokens: it stays in whatsnew-output/ (git-ignored) and the skill
// deletes it when done.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
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
const url = opt("url");
const out = opt("out", "whatsnew-output/auth.json");
const timeoutMs = Number(opt("timeout", 600)) * 1000;
if (!url) {
  console.error("usage: node login.mjs --url http://localhost:4102 [--out whatsnew-output/auth.json] [--timeout seconds]");
  process.exit(1);
}
const appOrigin = new URL(url).origin;

let browser;
try {
  const channel = opt("channel");
  browser = await chromium.launch({ headless: false, ...(channel ? { channel } : {}) });
} catch (e) {
  console.error("error: could not open a browser window (no display, or --channel browser not installed). Log in another way — see references/capture.md.");
  console.error(e.message.split("\n")[0]);
  process.exit(1);
}
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// Keep a fresh snapshot while the user works; the last good one is written when the window closes.
// sessionStorage is not part of Playwright's storageState, but many SSO libraries (e.g. MSAL) keep
// tokens there, so it is captured separately for the app's origin.
let snapshot = null;
async function takeSnapshot() {
  try {
    const state = await context.storageState({ indexedDB: true });
    let session = {};
    if (!page.isClosed() && new URL(page.url()).origin === appOrigin) {
      session = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
    } else if (snapshot) {
      session = snapshot.sessionStorage ?? {};
    }
    snapshot = { ...state, sessionStorage: session, appOrigin, savedAt: new Date().toISOString() };
  } catch {
    // page navigating or already closing — keep the previous snapshot
  }
}

await page.goto(url).catch(() => {});
console.log(`A browser window is open at ${url}.`);
console.log("Log in as you normally would, wait until you see the app, then CLOSE THE WINDOW.");

const timer = setInterval(takeSnapshot, 1500);
const closed = new Promise((resolve) => {
  page.on("close", resolve);
  browser.on("disconnected", resolve);
});
const timedOut = new Promise((resolve) => setTimeout(() => resolve("timeout"), timeoutMs));
const why = await Promise.race([closed, timedOut]);
clearInterval(timer);
if (why === "timeout") await takeSnapshot();
await browser.close().catch(() => {});

if (!snapshot) {
  console.error("error: no session was captured. Try again and wait until the app has loaded before closing the window.");
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
const ls = snapshot.origins?.find((o) => o.origin === appOrigin)?.localStorage?.length ?? 0;
console.log(`saved session → ${out} (${snapshot.cookies.length} cookies, ${ls} localStorage, ${Object.keys(snapshot.sessionStorage).length} sessionStorage items for ${appOrigin})`);
if (why === "timeout") console.log("note: stopped waiting after the timeout; saved what was there.");
if (!snapshot.cookies.length && !ls && !Object.keys(snapshot.sessionStorage).length) {
  console.log("warning: the saved session is empty — it looks like the login didn't finish. Run this again and wait until the app is showing before closing the window.");
  process.exitCode = 2;
}
