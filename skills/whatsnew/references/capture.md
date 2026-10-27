# Capturing real screens

Real screenshots beat rebuilt mockups: they're exactly what users will see. This step photographs the screens that changed, once as they were before the branch and once with it.

## When to capture

Capture when the diff touches UI (components, pages, routes, styles, templates) and the user didn't pass `--no-capture`. CLI tools, libraries and backend-only changes skip this step and get visuals built in the composition.

## Choose a capture strategy (the ladder)

Go down this list and use the **first rung that works**. Each rung shows the real UI; only the last one is an illustration.

| Rung | Use it when | How |
|---|---|---|
| **a. URLs the user gives** | `--before-url`/`--after-url`, or the user names a dev/test/preview environment that opens without a login (or with a documented demo login) | `capture.mjs --url <that URL>` — no worktrees, no servers |
| **b. The app running locally** | It starts without a real login: no auth, a dev auth bypass, or a demo/seed account the repo documents | Worktrees + dev servers (or built output via `serve-static.mjs`), `capture.mjs` |
| **c. Built SPA + mocked API** — the default when login, SSO or a backend blocks capture | The frontend is a client-rendered SPA with a build (Vite, CRA, Angular, Vue, a Next.js static export) | `mock-capture.mjs`: serves the build and answers every API call with mock data — no login, backend or database, and it's the real UI code. See "Built SPA + mocked API" below |
| **d. A real login** — only if (c) can't work and the user agrees | Server-rendered pages (Razor, Rails, Django, Next.js server components) where the HTML itself comes from the backend | Ask first, then `login.mjs` — see "Apps behind a login" |
| **e. Illustrations** — last resort | Nothing above works | Pages rebuilt from the component code with the app's own CSS — see "Illustrations styled with the app's own CSS" |

Signs you've hit a blocker: `capture.mjs` reports a `LOGIN WALL` (exit code 3), the server log needs secrets or a database you don't have, or the page is empty because every API call fails. Move down one rung; don't spend long fighting a rung.

**Checking whether a session is logged in:** never trust a page or request that follows redirects — an SSO login page answers `200` too. Ask an API endpoint the app uses for the current user, **without following redirects**, and accept only `200` with a JSON body: Playwright `request.get(url, { maxRedirects: 0 })`, `fetch(url, { redirect: "manual" })`, or `curl -s -o /dev/null -w "%{http_code}" --max-redirs 0`.

**Never** drive the user's own browser profile, copy cookies out of it, or ask the user to take screenshots by hand. Don't open a visible browser window or ask the user to sign in unless rung (c) can't work — and then only after asking.

## 1. Check out both versions

```
bash <skill-dir>/scripts/worktrees.sh up <base> <head>
```

Prints the two folders (in a temp dir, outside the repo), the ports (4101 before, 4102 after), and the install command. Untracked `.env*` files are copied into both so the app can start.

## 2. Install and start both servers

In each folder, install dependencies, then start the dev server **in the background**, logging to a file:

```
cd "$BEFORE_DIR" && npm ci && PORT=4101 nohup npm run dev -- --port 4101 > "<repo>/whatsnew-output/server-before.log" 2>&1 &
cd "$AFTER_DIR"  && npm ci && PORT=4102 nohup npm run dev -- --port 4102 > "<repo>/whatsnew-output/server-after.log" 2>&1 &
```

Use the install command `worktrees.sh` printed, and your agent's background-process option if it has one. Read the folder paths from `whatsnew-output/worktrees.env`. Port flags by framework:

| Framework            | Start command                                          |
|----------------------|--------------------------------------------------------|
| Next.js              | `npm run dev -- -p 4102`                               |
| Vite / SvelteKit / Astro | `npm run dev -- --port 4102 --strictPort`          |
| Create React App     | `PORT=4102 BROWSER=none npm start`                     |
| Nuxt                 | `npm run dev -- --port 4102`                           |
| Remix (Vite)         | `npm run dev -- --port 4102`                           |
| Rails / Django / other | follow the README; pass the port the framework's way |

### Apps with a separate backend (e.g. .NET API + React, Node API + Vite)

Find how the frontend reaches the API first: a dev proxy (`server.proxy` in `vite.config.*`, `"proxy"` in a CRA `package.json`, `setupProxy.js`), or a base URL env var (`VITE_API_URL`, `REACT_APP_API_URL`, `NEXT_PUBLIC_API_URL`).

- **Backend unchanged in the diff** (only frontend files changed): run **one** backend, from the `after` worktree, on the port the frontend already expects. Start both frontends (4101, 4102) pointing at it. This is the common case and the simplest.
- **Backend changed too**: run one backend per side on its own port (before → 5101, after → 5102), and point each frontend at its own backend — set the env var, or edit the proxy target **in that worktree's copy only** (worktrees are throwaway; never edit the user's main checkout).

Backend start commands:

| Stack | Command (after side shown) |
|---|---|
| ASP.NET Core | `ASPNETCORE_ENVIRONMENT=Development dotnet run --project <Api.csproj> --urls http://localhost:5102` |
| Node / Express | `PORT=5102 npm run dev` (in the API folder) |
| Django | `python manage.py runserver 5102` |

If the ASP.NET project starts the React app itself (SpaProxy / `SpaProxyLaunchCommand`), start the React dev server separately on 4101/4102 instead, so you control the ports. A database the app needs must already be running locally; use the dev database and seed data the README describes, never production.

Install both sides in parallel if you can — it's the slowest part. If the server log shows it needs something you don't have (a database, an API key), tell the user what's missing in one line and fall back to HTML visuals. Never invent credentials.

### Already-built apps (`dist/`, `build/`, `out/`, `wwwroot/`)

Instead of a dev server, you can serve a production build. It's often faster, matches what users see more closely, and avoids dev-server setup. For .NET + React, build the `ClientApp` and serve its output.

```
node <skill-dir>/scripts/serve-static.mjs --dir "$AFTER_DIR/dist" --port 4102 --proxy /api=http://localhost:5102
```

- `--proxy /api=…` forwards API calls to a running backend (repeatable; `https://` works with self-signed dev certificates). Find the prefix the frontend uses (`/api`, `/graphql`, `/hubs` for SignalR).
- `--base /app/` if the app isn't served from `/` (Vite `base`, CRA `homepage`, `<base href>` in `index.html`).
- Client-side routes fall back to `index.html`; static exports (`/about/index.html`) work too.

Each side needs a build **of its own code**. Build in each worktree (`npm run build`, or the README's build command), then serve each worktree's output. A build that already exists in the user's main checkout matches only the code it was built from: use it for the `after` side only if `head` is checked out, there are no uncommitted changes, and the build is newer than `head`'s last commit (`git log -1 --format=%ct` vs. the folder's modification time). Otherwise build fresh. If the `before` side can't be built, skip before-shots and present the changes as new.

A built app usually still needs its backend and a login. If either is a problem, don't serve it this way — use the build with mocked API answers instead (next section).

### Built SPA + mocked API

The default whenever a login, SSO or a backend stands in the way. The app's real production build runs in headless Chrome; every API call is answered with mock JSON you write. Login is no problem, because "am I logged in?" is just another API call you answer.

**1. Get a current build for each side.**
- `after`: a `dist/` (or `build/`, `wwwroot/`, `ClientApp/dist`) that's **current** — newer than `head`'s last commit, *and* containing a string from the new feature: `grep -rl "Replace file" dist/assets/` (pass it as `--expect "Replace file"` and the script checks for you). If it's stale or missing, run the project's own build command in the `after` worktree (`npm ci && npm run build`).
- `before`: build in the `before` worktree the same way. If it can't be built, show the changes as new (no before shots).
- Builds that read the API address at build time (`VITE_API_URL`, …) are fine: requests to another host are offered to `mock()` too, with the full URL as `path`.

**2. Write the mocks** in `whatsnew-output/mocks.mjs`:

```js
// Shaped like the generated API types. Fictional "Demo …" names only.
let certificate = { id: 7, fileName: "certificate-2025.pdf" };   // module state survives the whole run

export function mock(method, path, q, req) {
  if (method === "GET" && path === "/api/me") return { name: "Demo user", roles: ["admin"] };
  if (method === "GET" && path === "/api/vessels") return [{ id: 1, name: "Demo vessel" }, { id: 2, name: "Demo vessel 2" }];
  if (method === "GET" && /^\/api\/lines\/\d+\/certificate$/.test(path)) return certificate;
  if (method === "POST" && /^\/api\/lines\/\d+\/certificate$/.test(path)) { certificate = { id: 8, fileName: "certificate-2026.pdf" }; return { $status: 204 }; }
  if (method === "GET" && path === "/api/suppliers") return [{ id: 1, name: "Demo supplier" }].filter((s) => s.name.includes(q.get("q") ?? ""));
  if (path.startsWith("/api/files/")) return { $file: "whatsnew-output/demo.pdf", $headers: { "content-type": "application/pdf" } };
  // anything not matched → undefined → logged as MISS
}

// Optional: runs before the app loads. Use it when the SPA keeps its login client-side
// (MSAL, auth0-spa-js, oidc-client): seed the token cache it reads, so it never redirects.
export async function init(page) {
  // await page.addInitScript(() => localStorage.setItem("@@auth0spajs@@::client::default", JSON.stringify({ /* … */ })));
}
```

- Return values: any JSON → `200`; `{ $status, $body, $headers }` for other statuses (`204`, `404`, a validation `400`); `{ $file }` to send a file; `undefined` → **MISS**.
- **Start from the generated API types**, not from guesses: OpenAPI/Swagger specs (`swagger.json`, `openapi.yaml`), generated clients (orval, openapi-typescript, openapi-typescript-codegen, NSwag — look for `api/`, `generated/`, `*.gen.ts`, `model/`), or the C# DTOs. Fill every field the UI reads, with the right types and enum values.
- **Fictional data only:** "Demo vessel", "Demo vessel 2", "Demo user", "Demo supplier"; `@example.com` emails; round, plausible numbers; no real people, customers, ships, emails, URLs or IDs — even if the repo's fixtures or seed data contain real ones.
- Keep it to what the shots need; screens nobody films don't need mocks.

**3. Write the shots** in `whatsnew-output/mock-shots.json`:

```json
{ "shots": [
  { "name": "certificate", "path": "/inventory/rope/line/42/certificate", "waitFor": "text=Certificate", "box": ["#current-file"] },
  { "name": "supplier-create", "path": "/inventory/rope/line/42/certificate",
    "actions": [ { "type": ["#supplier", "Nordic"] }, { "waitFor": "text=Create" } ],
    "capture": ["#supplier", "[role=listbox]"], "pad": 16, "box": ["text=Create"] },
  { "name": "after-refresh", "path": "/inventory/rope/line/42/certificate",
    "actions": [ { "setInputFiles": ["input[type=file]", "whatsnew-output/demo.pdf"] }, { "click": "text=Replace file" },
                 { "goto": "/inventory/rope/line/42/certificate" } ],
    "capture": ".certificate-card", "box": ["#current-file"] }
] }
```

- `capture`: `"page"` (default, the full 1920×1080 viewport), a selector, or a list of selectors to crop around all of them (a dropdown that hangs outside its input) with `pad` px around.
- `actions`: `click`, `type: [sel, text]` (key by key — for autocompletes), `fill`, `press`, `hover`, `select`, `check`, `setInputFiles: [sel, file]`, `waitFor`, `wait`, `goto` (a full reload — e.g. "after refresh"), `scroll`, `shot` (an extra screenshot mid-flow).
- `box`: elements to measure. For each, the script prints the 2× pixel box, the `.spot` values (`--x --y --w --h` in %) and pan/zoom values (`--z --tx --ty`) for the composition's 1458×820 frame.
- For flows too complex for JSON, write `mock-shots.mjs` instead: `export default async ({ page, goto, act, shot, box }) => { … }`.

**4. Run, read the log, add mocks, repeat:**

```
node <skill-dir>/scripts/mock-capture.mjs --dist "$AFTER_DIR/dist" --mocks whatsnew-output/mocks.mjs \
     --shots whatsnew-output/mock-shots.json --label after --expect "Replace file"
```

Each run logs `MISS GET /api/…` for every call without a mock, `PAGEERROR …` for crashes (usually a field your mock left out), and `BLOCKED …` for other hosts (analytics, fonts — add `--allow fonts.googleapis.com,fonts.gstatic.com` for web fonts). It exits with code 4 until there are no misses and no page errors. Add mocks and run again until the log is clean, then do the same for `--label before` with the before build (the same mocks usually work for both).

Defaults: headless Google Chrome (bundled Chromium if Chrome isn't installed), 1920×1080 at 2× — narrower viewports squeeze table columns and truncate text — service workers blocked, every request served from the build or the mocks; nothing listens on a port. Options: `--api /graphql` (repeatable) for other API prefixes, `--base /app/` for a non-root base path.

**5. Look at every PNG before using it.** Check that it shows the screen the moment is about, no "undefined", `NaN`, empty tables or spinners, no error toasts, and only "Demo …" data.

Limits: server-rendered HTML can't be mocked this way (go to rung d), and GraphQL needs `mock()` to branch on `req.json().operationName`.

### Apps behind a login

Rung (c) above handles almost every SPA behind a login — use it first. A real login is for **server-rendered apps** where the page HTML itself comes from the backend, or when mocks can't make the app render.

`capture.mjs` **detects login walls**: a shot that lands on a login page, another domain or a password form fails with `login wall` and the script exits with code 3. Never use those shots, and never quietly swap in rebuilt HTML as if it were the real UI.

1. **A login the repo already has for tests or development.** Look in the README, `.env.example`/`appsettings.Development.json` (flags like `AUTH_DISABLED`, `MOCK_AUTH`, `UseFakeAuth`), and the end-to-end tests: a Playwright `storageState`/`globalSetup`, a Cypress `cy.login()` command, a seeded demo user. Use it through the shot plan's `setup` actions, or point `--auth` at the test suite's saved `storageState` file.
2. **Ask the user** (one single-select question; with `--yes` or nobody to ask, go to illustrations):
   *"The app needs a login I can't mock. How should I continue?"*
   - **Log me in once** — opens a browser window for them to sign in.
   - **Use a test environment** — they give the URLs.
   - **No screenshots** — illustrations styled with the app's CSS.

   **Log me in once:** with the app running, `node <skill-dir>/scripts/login.mjs --url http://localhost:4102`. It opens a Chromium window; the user signs in, waits for the app, and **closes the window**; the session is saved to `whatsnew-output/auth.json`. Run it with a long timeout (MFA takes minutes). Then capture with `--auth whatsnew-output/auth.json` — one login covers both ports. `--channel msedge`/`chrome` uses an installed browser *program* (with a fresh, empty profile — never the user's own profile). If the org blocks sign-in from automated browsers, this rung is closed: go to a test environment or illustrations.
3. Sessions expire: a login wall with `--auth` means run `login.mjs` again.

Rules:
- **Never ask for passwords, tokens or MFA codes in the chat**, and never write credentials into files.
- `auth.json` holds live login tokens: keep it in `whatsnew-output/` (git-ignored) and **delete it when done** (`rm -f whatsnew-output/auth*.json`).
- Logged-in screens can show real customer or personal data. Check every screenshot and hide or crop anything personal before it goes in a video.

### Illustrations styled with the app's own CSS

The last rung. When the real UI can't be rendered at all — not even with mocks — don't draw look-alike screens in the video's own style. Rebuild each changed screen as a small HTML page that uses the **app's compiled CSS**, and screenshot those pages with the normal capture flow, so they look like the product and get `focus` positions for spotlights.

1. **Get the CSS.** Use the build output's stylesheets (`dist/assets/*.css`, `build/static/css/*.css`, `wwwroot/css/*.css`) — from each worktree if you built them, otherwise the newest build you have. Copy them, plus the fonts and images they reference, into `whatsnew-output/mock/`. If the app styles components at runtime (styled-components, Emotion, MUI's `sx`), there's little in the CSS files: copy the theme values (colours, fonts, radii) from the source into a small stylesheet instead.
2. **Write one page per screen and side:** `whatsnew-output/mock/before/<name>.html` and `mock/after/<name>.html`, each linking the copied CSS (`<link rel="stylesheet" href="../app.css">`). Write the markup from the actual component code: the same elements, `className` → `class` with the same class names, the same labels and button texts. Only the screens and parts the moment needs — not the whole app.
3. **Data:** plausible, neutral sample data (fictional names, round numbers). Never real customer data, never copied from production.
4. **Screenshot them** like a real app (add an empty `mock/index.html` first):
   ```
   node <skill-dir>/scripts/serve-static.mjs --dir whatsnew-output/mock --port 4103
   node <skill-dir>/scripts/capture.mjs --plan whatsnew-output/shots.json --url http://localhost:4103/before/ --label before
   node <skill-dir>/scripts/capture.mjs --plan whatsnew-output/shots.json --url http://localhost:4103/after/ --label after
   ```
   with relative shot paths in the plan (`"path": "checkout.html"`). `worktrees.sh down` stops this server too.
5. Look at every result next to the component code; fix anything that doesn't match. Mark these moments `illustration` in `plan.md` and mention it in the report.

## 3. Write the shot plan

Write `whatsnew-output/shots.json`. One shot per moment in `plan.md` that has a UI.

```json
{
  "viewport": { "width": 1920, "height": 1080 },
  "scale": 2,
  "colorScheme": "light",
  "setup": {
    "path": "/login",
    "actions": [
      { "fill": ["input[name=email]", "demo@example.com"] },
      { "fill": ["input[name=password]", "demo-password"] },
      { "click": "button[type=submit]" },
      { "waitFor": "text=Dashboard" }
    ]
  },
  "shots": [
    { "name": "checkout", "path": "/checkout" },
    { "name": "pay-button", "path": "/checkout", "selector": "[data-testid=pay-panel]" },
    { "name": "saved-cards", "path": "/settings/payments", "only": "after",
      "actions": [{ "click": "text=Saved cards" }], "waitFor": "text=Visa" }
  ],
  "hide": [".cookie-banner"]
}
```

| Field        | Meaning |
|--------------|---------|
| `path`       | URL path to open |
| `actions`    | Steps before the shot: `click`, `fill: [sel, value]`, `press`, `hover`, `select: [sel, value]`, `check`, `scroll: px`, `waitFor`, `wait: ms`, `goto` |
| `waitFor`    | Element that must be visible before shooting |
| `focus`      | The element that changed. Safe to set even if it only exists on the after side (the before shot is still taken). Its position is saved in the manifest as `focus: {x, y, w, h}` percentages — paste them straight into a `.spot` in the video |
| `selector`   | Screenshot just this element instead of the viewport (great for small UI changes) |
| `fullPage`   | Capture the whole scrollable page |
| `only`       | `"after"` for screens that are new, `"before"` for screens that were removed |
| `setup`      | Runs once before all shots — use it to log in with a demo/seed account the repo documents (never real ones). For a real login, use `login.mjs` and `--auth` instead (see "Apps behind a login") |
| `allowLogin` | `true` on a shot that is *meant* to show a login page, so it isn't reported as a login wall |
| `hide`       | Extra selectors to hide (cookie banners, chat widgets). Dev overlays are hidden automatically |

**Full page or crop?** Capture at 1920×1080 (narrower squeezes tables). For the scene pattern most viewers follow best — show the whole page so they know where they are, then pan and zoom to the change — take the full page and `box` the changed element (see "Page scene" in `composition.md`). Use a `selector` crop for a pop-over detail (a dropdown, a dialog) shown on top of the page.

Selectors are Playwright selectors: CSS, `text=…`, `[data-testid=…]`, `role=button[name="Pay"]`. Read the actual component code to pick them — don't guess.

## 4. Capture both sides

```
node <skill-dir>/scripts/capture.mjs --plan whatsnew-output/shots.json --url http://localhost:4101 --label before [--auth whatsnew-output/auth.json]
node <skill-dir>/scripts/capture.mjs --plan whatsnew-output/shots.json --url http://localhost:4102 --label after  [--auth whatsnew-output/auth.json]
```

It waits up to 3 minutes for each server (first compile is slow), then writes `whatsnew-output/shots/before-<name>.png`, `after-<name>.png` and a manifest per side.

**Look at every screenshot** (open the PNGs). Re-shoot if you see: a loading spinner, an error page, an empty state where there should be data, a login wall, a cookie banner, or personal data. On the `before` side, a missing element is fine if the feature didn't exist yet — say so in the video ("New") instead of showing a before.

## 5. Clean up

```
bash <skill-dir>/scripts/worktrees.sh down
```

Stops both servers (dev servers or `serve-static.mjs`) and removes the worktrees. Always run this, even if something failed earlier, and delete any saved login: `rm -f whatsnew-output/auth*.json`.

## Using the screenshots in the video

Reference them from `composition.html` as `shots/after-checkout.png`. See the `.shot`, `.wipe` and `.spot` building blocks in `references/composition.md`.
