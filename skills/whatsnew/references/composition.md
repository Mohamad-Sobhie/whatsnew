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

Prefer a horizontal wordmark for `.logo`, and a square mark for `.brand-mark` if both exist. Then:
- Title scene: `<img class="logo" src="brand/...">` above the headline.
- Middle scenes: one `<img class="brand-mark">` directly in `.stage` with `--from` = start of scene 2 and `--until` = start of the last scene.
- Last scene: the logo again, smaller.

A dark logo on the dark video → add class `on-light`, or switch the theme to light (swap `--bg`/`--fg`). An SVG logo that uses web-font text renders with a fallback font inside `<img>` — if the text looks wrong, use a PNG of it (from the app's icons or a screenshot) instead. If nothing is found, leave the logos out and say so in the report; never invent a logo.

### Fonts

1. **Use the app's own fonts** when you can find the files: `@font-face` in the app's CSS, font files in `public/fonts`/`assets/fonts`, `@fontsource/*` packages in `node_modules`, or (Next.js `next/font`) the `.woff2` files in the after worktree's `.next/static/media/` once its dev server has served a page. Copy them to `whatsnew-output/fonts/` and point the `@font-face` rules and `--display`/`--font` at them.
2. Otherwise keep the bundled pair: **Bricolage Grotesque** for headlines and numbers, **Instrument Sans** for text, **IBM Plex Mono** for code (all OFL, already in the template).

Never fall back to Inter, Roboto, Arial or the system UI font — they make every video look the same. The bundled fonts cover Latin scripts (including æøå); for Arabic, Hebrew, CJK or other scripts, use the app's font for that script.

The renderer warns about any font or image that failed to load — fix those before you deliver.

## Palette

The template ships with a neutral dark theme via CSS variables at the top (`--bg`, `--fg`, `--accent`, …). For a light theme, also set `--spot-dim` to a white veil (`rgba(255,255,255,.62)`) and make sure `.spot`'s ring colour (`--accent`) differs from the element it circles. If the repo has obvious brand colours (Tailwind config, CSS variables, theme file), swap them in — the video should feel like the product.
