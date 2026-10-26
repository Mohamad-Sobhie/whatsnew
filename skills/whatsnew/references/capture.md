# Capturing real screens

Real screenshots beat rebuilt mockups: they're exactly what users will see. This step runs the app twice — once as it was before the branch, once with the branch — and photographs the screens that changed.

## When to capture

Capture when **all** of these are true:
- the diff touches UI (components, pages, routes, styles, templates),
- the project is a web app you can start locally (a `dev`/`start` script, or a README that explains how),
- the user didn't pass `--no-capture`.

If the user passed `--before-url` and `--after-url` (e.g. production and a PR preview deployment), skip worktrees and servers entirely and capture straight from those URLs.

Otherwise — CLI tools, libraries, backend-only changes — skip this step and build visuals in HTML as before.

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

Install both sides in parallel if you can — it's the slowest part. If the server log shows it needs something you don't have (a database, an API key), tell the user what's missing in one line and fall back to HTML visuals. Never invent credentials.

## 3. Write the shot plan

Write `whatsnew-output/shots.json`. One shot per moment in `plan.md` that has a UI.

```json
{
  "viewport": { "width": 1440, "height": 900 },
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
| `focus`      | The element that changed. Its position is saved in the manifest as `focus: {x, y, w, h}` percentages — paste them straight into a `.spot` in the video |
| `selector`   | Screenshot just this element instead of the viewport (great for small UI changes) |
| `fullPage`   | Capture the whole scrollable page |
| `only`       | `"after"` for screens that are new, `"before"` for screens that were removed |
| `setup`      | Runs once before all shots — use it to log in. Only use demo/seed accounts the repo documents; never real ones |
| `hide`       | Extra selectors to hide (cookie banners, chat widgets). Dev overlays are hidden automatically |

**Crop to what matters.** A full 1440px page shrinks to tiny text in the video. Prefer `selector` on the content area that changed (e.g. `main`, a card, a dialog) so the UI stays readable on screen, and use a full-viewport shot only when the whole page layout is the point.

Selectors are Playwright selectors: CSS, `text=…`, `[data-testid=…]`, `role=button[name="Pay"]`. Read the actual component code to pick them — don't guess.

## 4. Capture both sides

```
node <skill-dir>/scripts/capture.mjs --plan whatsnew-output/shots.json --url http://localhost:4101 --label before
node <skill-dir>/scripts/capture.mjs --plan whatsnew-output/shots.json --url http://localhost:4102 --label after
```

It waits up to 3 minutes for each server (first compile is slow), then writes `whatsnew-output/shots/before-<name>.png`, `after-<name>.png` and a manifest per side.

**Look at every screenshot** (open the PNGs). Re-shoot if you see: a loading spinner, an error page, an empty state where there should be data, a login wall, a cookie banner, or personal data. On the `before` side, a missing element is fine if the feature didn't exist yet — say so in the video ("New") instead of showing a before.

## 5. Clean up

```
bash <skill-dir>/scripts/worktrees.sh down
```

Stops both servers and removes the worktrees. Always run this, even if something failed earlier.

## Using the screenshots in the video

Reference them from `composition.html` as `shots/after-checkout.png`. See the `.shot`, `.wipe` and `.spot` building blocks in `references/composition.md`.
