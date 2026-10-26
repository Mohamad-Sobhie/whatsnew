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

## Timing sanity check

Before rendering, add up the scenes: the last scene's `--start` + `--len` should equal `data-duration`. Leave ~0.4 s between the end of one scene's reveal animations and its fade-out so text is readable.

## Palette

The template ships with a neutral dark theme via CSS variables at the top (`--bg`, `--fg`, `--accent`, …). If the repo has obvious brand colours (Tailwind config, CSS variables, theme file), swap them in — the video should feel like the product.
