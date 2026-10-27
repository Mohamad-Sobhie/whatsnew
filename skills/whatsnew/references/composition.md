# Composition contract

The video is a single HTML file (`whatsnew-output/composition.html`) rendered by `scripts/render.mjs`. Follow this contract or the render will be wrong.

## The rules

1. **Canvas:** 1920×1080. Everything lives inside `.stage`.
2. **Duration and frame rate** go on `<body>`:
   `<body data-duration="30" data-fps="30">`
3. **All motion is CSS animations** (`@keyframes` + `animation`). The renderer pauses every animation and seeks it to each frame's time. Do **not** use `setTimeout`, `requestAnimationFrame`, `<video>`, GIFs, or JS-driven motion — they will not be captured in sync.
4. **Scenes** are `<section class="scene">` with two custom properties:
   `style="--start: 4s; --len: 7s"`. The base CSS fades each scene in and out over that window. Give the final scene the class `last` so it holds to the end.
5. **Elements inside a scene** animate in with `class="reveal"` (or `reveal-left`, `reveal-zoom`) and an optional `--d` delay relative to the scene start: `style="--d: .4s"`.
6. **Local assets only.** Images go in `whatsnew-output/shots/` and are referenced relatively (`shots/after.png`). No web fonts or CDNs — use the system font stack in the template.
7. **No scrolling, no overflow.** Text must fit its box at 1920×1080.

## Building blocks in the template

| Class            | Use for                                                  |
|------------------|----------------------------------------------------------|
| `.kicker`        | Small label above a headline ("New in Acme 2.4")         |
| `.headline`      | Big title text                                           |
| `.sub`           | One supporting sentence                                  |
| `.ba`            | Before/after pair — two `.panel` children                 |
| `.panel.before` / `.panel.after` | Each side; put an `<img>` or HTML UI mock inside |
| `.window`        | A fake app window frame for UI mocks (has a title bar)   |
| `.code`          | A code snippet block (`<pre>`), ≤ 8 lines                 |
| `.list` / `.item`| Recap bullets                                            |
| `.chip`          | Small tag ("API", "Design", "Faster")                    |
| `.metric`        | A big number + label for performance changes             |
| `.shot` > `.zoom` > `img` | A real screenshot with a slow push-in. Set `--zoom` (default 1.06) and `--origin` (e.g. `62% 40%`, aim at the change) |
| `.spot`          | Spotlight ring inside `.zoom`, dims everything else. Set `--x --y --w --h` from the capture manifest's `focus`, and `--d` for when it appears |
| `.wipe`          | Before→after wipe on the same screen: before `img`, then `img.after-img`, `.divider`, `.tag.t-before`, `.tag.t-after`. Tune `--wipe-at` (default 1.4s into the scene) |
| `.media-row`     | Text on the left, screenshot on the right                |

Screenshots are 2× resolution, so they stay sharp at any size. Keep a captured page at roughly 1100–1500px wide on the canvas so the UI text stays readable. Use the same `.spot` coordinates on both before and after only if the layout didn't move.

Add new classes freely, but keep them in the single `<style>` block.

## Choosing the right block for screenshots

- **Same screen changed** (before and after are the same page) → `.wipe`. It shows the change happening on one full-size screen, instead of two half-size ones the viewer has to compare.
- **Different screens** (a flow was replaced by a different page) → `.ba` with an `<img>` in each `.panel`.
- **New screen** (only exists after) → `.shot` in a `.media-row`, with a `New` chip.
- **The manifest has a `focus` for the shot** → add a `.spot` with those coordinates. That's what the viewer's eye should land on; use it at least once per video.

Follow what `plan.md` said under "How to show it"; if you change your mind, update the plan.

## Page scene: breadcrumb + full page + pan/zoom + spot

The scene pattern viewers follow best for a UI change. A component on its own leaves them guessing which page they're on, so show where it lives, then move in:

1. **Breadcrumb row** with the chip: the menu path to the page, exactly as the app's navigation names it ("Inventory › Rope › Line › Certificate"). Take it from the router/menu config, not from the URL.
2. **Headline** (≤ 6 words) and a **one-line subtitle**.
3. **Framed full-page screenshot** (`.frame`, 1458×820 — the 1920×1080 capture at 0.76×). It holds still for ~1.5 s so viewers see the whole page, then pans and zooms (`.pan`) until the changed element is centred, then the `.spot` ring appears on it.
4. Optionally a **second real crop that pops over the frame** (`.pop`) — the detail that is too small even when zoomed: an autocomplete list showing "Create …", a tooltip, a dialog.

```html
<section class="scene ui" style="--start: 4s; --len: 8s">
  <div class="ui-head">
    <div class="crumbs reveal"><span class="chip">New</span><span>Inventory</span><i>›</i><span>Rope</span><i>›</i><span>Line</span><i>›</i><b>Certificate</b></div>
    <h2 class="ui-title reveal" style="--d: .1s">Replace a line's certificate</h2>
    <p class="ui-sub reveal" style="--d: .2s">Upload the new file right on the line page.</p>
  </div>
  <div class="frame reveal-zoom" style="--d: .15s; --z: 1.56; --tx: 0px; --ty: -92px; --pan-at: 1.6s">
    <div class="pan">
      <img src="shots/after-certificate.png">
      <div class="spot" style="--x: 14.22%; --y: 37.08%; --w: 35.31%; --h: 4.26%; --d: 3.4s"></div>
    </div>
    <img class="pop" src="shots/after-supplier-create.png" style="--d: 5.2s; right: 48px; bottom: 48px; width: 600px">
  </div>
</section>
```

**The pan/zoom maths.** `.pan` uses `transform-origin: 0 0` and animates to `translate(tx, ty) scale(z)`. For a frame of width `W` and height `H` (1458×820) and an element whose centre sits at fractions `fx`, `fy` of the screenshot (centre x ÷ page width, centre y ÷ page height):

- zoom: `z` = as large as keeps the element comfortably in view — about `min(0.55·page_w / el_w, 0.55·page_h / el_h)`, clamped to **1 … 2.4** (more than ~2.4× and the 2× screenshot gets soft)
- centre it: `tx = W/2 − z·fx·W`, `ty = H/2 − z·fy·H`
- never show past the edge: clamp `tx` to `[W − z·W, 0]` and `ty` to `[H − z·H, 0]`

You don't have to compute this: `mock-capture.mjs` prints it for every `box` (`pan --z:1.56; --tx:0px; --ty:-92px`), together with the `.spot` percentages. The spot sits *inside* `.pan`, so it zooms along with the screenshot; its ring is kept thin with `border-width: calc(4px / var(--z))`.

Timing: `--pan-at` ≈ 1.4–1.8 s (after the frame has appeared), `--pan-len` 1.6 s, the spot's `--d` ≈ `--pan-at + --pan-len + 0.2 s`, a `.pop` 1–2 s after the spot. The scene needs ~7–8 s.

## Flow scene: numbered cards (bug fixes and multi-step changes)

For a change that only makes sense as a sequence, use `.flow` with numbered `.step-card`s, each a **real crop** of the part that changes plus a little context — the file row *with* its section heading and button, the status badge *with* its row label. Each card is a third (or, with `--cards: 2`, half) of the width: a crop that is a thin full-width strip turns into tiny text, so aim for a crop roughly 2:1 or squarer. Capture a list of selectors (`"capture": [".card h3", "#current-file", "button.save"]`) with `pad` 24–40 rather than one wide row. The flow centres itself in the space under the heading; don't push it around with margins.

```html
<div class="flow">
  <div class="step-card reveal" style="--d: .3s"><div class="n">1 · Replace the file</div><img src="shots/after-replace.png"><p>Choose the new certificate</p></div>
  <div class="step-card bad reveal" style="--d: 1.1s"><div class="n">2 · Before the fix ✗</div><img src="shots/before-after-refresh.png"><p>After refresh: the old file is back</p></div>
  <div class="step-card good reveal" style="--d: 1.9s"><div class="n">3 · Now ✓</div><img src="shots/after-after-refresh.png"><p>After refresh: the new file stays</p></div>
</div>
```

- Put the same breadcrumb + headline header (`.ui-head`) above it, with a `Fixed` chip for bug fixes.
- `--cards: 2` or `4` on `.flow` changes the number of columns.
- **A bug-fix scene shows the bug's real symptom and the fix — nothing else.** The before card shows what users actually saw go wrong (captured from the `before` build, or from mocks that reproduce the old behaviour when the bug was in the backend); the after card shows the same steps now working. Don't pad it with a nearby feature from another commit.

## Timing sanity check

Before rendering, add up the scenes: the last scene's `--start` + `--len` should equal `data-duration`. Leave ~0.4 s between the end of one scene's reveal animations and its fade-out so text is readable.

## Brand: logo, fonts, colours

The video should look like it came from the product's team, not from a template.

### Logo

Find the app's logo and copy it to `whatsnew-output/brand/` (keep its file type). Look, in order:

1. Files named like a logo: `**/logo*.{svg,png}`, `**/brand/**`, `**/wordmark*` — under `public/`, `static/`, `assets/`, `src/assets/`, `wwwroot/`, `ClientApp/public/`.
2. A logo component: `Logo.tsx`, `logo.component.*`, an inline `<svg>` in the header/navbar. Copy the SVG markup into its own `.svg` file.
3. App icons: `apple-touch-icon.png`, `icon.svg`, `favicon.svg`, the largest icon in `manifest.json` / `site.webmanifest`.
4. With screenshots available: capture the header's logo element with a `selector` shot (`only: "after"`, name `logo`) and use that PNG.

Prefer a horizontal wordmark for `.logo`, and a square mark for `.brand-mark` if both exist. A logo that only exists in its brand colour needs a white version for the dark and bold themes; make one that keeps the transparency with `ffmpeg -i logo.png -vf "format=rgba,lutrgb=r=255:g=255:b=255" logo-white.png` (for an SVG, change its `fill` colours to `#fff` instead). Then:
- Title scene: `<img class="logo" src="brand/...">` above the headline.
- Middle scenes: one `<img class="brand-mark">` directly in `.stage` with `--from` = start of scene 2 and `--until` = start of the last scene.
- Last scene: the logo again, smaller.

The user picks one of four colour themes, so the logo must work on dark *and* light backgrounds. Every logo in the template is a pair: `<img class="for-dark …">` (the version made for dark backgrounds, usually light/white) and `<img class="for-light …">` (dark text); CSS shows the right one per theme. Use the app's own variants when it has them (`logo-dark.svg`, `logo-white.svg`, a dark-mode logo). With only one version, use it for both and add class `on-light` to the copy that sits on the wrong background. An SVG logo that uses web-font text renders with a fallback font inside `<img>` — if the text looks wrong, use a PNG of it (from the app's icons or a screenshot) instead. If nothing is found, leave the logos out and say so in the report; never invent a logo.

### Fonts

1. **Use the app's own fonts** when you can find the files: `@font-face` in the app's CSS, font files in `public/fonts`/`assets/fonts`, `@fontsource/*` packages in `node_modules`, or (Next.js `next/font`) the `.woff2` files in the after worktree's `.next/static/media/` once its dev server has served a page. Copy them to `whatsnew-output/fonts/` and point the `@font-face` rules and `--display`/`--font` at them.
2. Otherwise keep the bundled pair: **Bricolage Grotesque** for headlines and numbers, **Instrument Sans** for text, **IBM Plex Mono** for code (all OFL, already in the template).

Never fall back to Inter, Roboto, Arial or the system UI font — they make every video look the same. The bundled fonts cover Latin scripts (including æøå); for Arabic, Hebrew, CJK or other scripts, use the app's font for that script.

The renderer warns about any font or image that failed to load — fix those before you deliver.

## Colour themes

The template has four themes, set as `html[data-theme="…"]` blocks. The user picks one before the final render (SKILL.md step 8). Rewrite all four from the app's colours — **keep the four names**, change only the values:

| Theme   | What it is | How to derive it |
|---------|------------|------------------|
| `light` | The app as users know it, if the app is light | The app's own background, text and primary colour |
| `dark`  | The app's dark mode, or a dark version of it | The app's dark-mode colours if it has them; otherwise a near-black tinted with the primary colour, light text, a brighter version of the primary as accent |
| `soft`  | Lighter and calmer | A very pale tint of the primary colour as background (5–10% primary on white), dark text, the primary as accent |
| `bold`  | Loud, for social posts | A deep shade of the primary colour as background, white text, a light tint of the primary (or the app's secondary colour) as accent |

Where to find the app's colours: Tailwind config (`theme.extend.colors`, `primary`), CSS custom properties (`--primary`, `--brand`, `--background`), theme files (`theme.ts`, MUI/Chakra/Mantine theme objects, `tokens.json`), SCSS variables, `<meta name="theme-color">`, the logo itself, or the captured screenshots.

Each theme sets the same variables: `--bg --bg-2 --panel --line --fg --muted --accent --accent-2 --on-accent --spot-dim`.
- `--on-accent` is the text colour on accent-filled things (buttons, tags) — check it's readable.
- `--spot-dim` is the veil outside a `.spot`: a dark veil on dark themes, a veil of the background colour on light ones (`rgba(255,255,255,.62)`).
- `.spot`'s ring uses `--accent`; if the element it circles is the same colour, override the ring's `border-color` for that spot.
- Text contrast: `--fg` on `--bg` and `--muted` on `--bg` must both be easy to read at a glance. Fix values that aren't.

Never hard-code a colour elsewhere in the page (except inside code blocks) — use the variables, so all four previews are correct.
