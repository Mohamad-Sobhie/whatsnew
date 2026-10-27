#!/usr/bin/env node
// Serve an already-built frontend (dist/, build/, out/, wwwroot/) so it can be screenshotted
// without starting a dev server.
//
//   node serve-static.mjs --dir <path/to/dist> --port 4102 [--proxy /api=http://localhost:5000] [--base /app/]
//
// --proxy  forward requests under a path prefix to a running backend (repeatable), so the
//          built app can talk to its API exactly like it does behind a real web server.
// --base   the app's public base path, if it isn't served from "/" (Vite `base`, CRA `homepage`).
// Unknown paths fall back to index.html, so client-side routes (/settings/payments) work.
// No dependencies; stops with Ctrl-C or when its port is killed (worktrees.sh down does that).

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { extname, join, normalize, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const all = (name) => args.flatMap((a, i) => (a === `--${name}` && args[i + 1] ? [args[i + 1]] : []));

const dir = resolve(opt("dir", "dist"));
const port = Number(opt("port", 4102));
let base = opt("base", "/");
if (!base.startsWith("/")) base = `/${base}`;
if (!base.endsWith("/")) base = `${base}/`;
const proxies = all("proxy").map((p) => {
  const [prefix, target] = p.split("=");
  return { prefix, target: new URL(target) };
});

if (!existsSync(join(dir, "index.html"))) {
  console.error(`error: ${dir} has no index.html — is this the build output folder? (dist/, build/, out/, wwwroot/)`);
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".map": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".avif": "image/avif",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".txt": "text/plain", ".xml": "application/xml", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm",
};

function proxy(req, res, { target }) {
  const send = target.protocol === "https:" ? httpsRequest : httpRequest;
  const upstream = send(
    {
      protocol: target.protocol, hostname: target.hostname, port: target.port,
      method: req.method, path: req.url,
      headers: { ...req.headers, host: target.host },
      rejectUnauthorized: false, // local dev backends often use self-signed certificates (e.g. ASP.NET dev certs)
    },
    (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); }
  );
  upstream.on("error", (e) => { res.writeHead(502); res.end(`proxy error: ${e.message}`); });
  req.pipe(upstream);
}

function serveFile(res, file, status = 200) {
  const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const p = proxies.find((x) => path.startsWith(x.prefix));
  if (p) return proxy(req, res, p);

  if (base !== "/" && path === base.slice(0, -1)) { res.writeHead(302, { location: base }); return res.end(); }
  const rel = path.startsWith(base) ? path.slice(base.length) : path.slice(1);
  const file = normalize(join(dir, rel));
  if (!file.startsWith(dir + sep) && file !== dir) { res.writeHead(403); return res.end(); }

  if (existsSync(file) && statSync(file).isFile()) return serveFile(res, file);
  if (existsSync(join(file, "index.html"))) return serveFile(res, join(file, "index.html"));   // static exports: /about/index.html
  if (existsSync(`${file}.html`)) return serveFile(res, `${file}.html`);                       // static exports: /about.html
  if (extname(rel)) { res.writeHead(404); return res.end("not found"); }                       // a missing asset, not a route
  return serveFile(res, join(dir, "index.html"));                                               // client-side route → SPA
}).listen(port, () => {
  console.log(`serving ${dir} at http://localhost:${port}${base}${proxies.map((p) => `  (${p.prefix} → ${p.target.origin})`).join("")}`);
});
