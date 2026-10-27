---
name: whatsnew
description: Compare two git branches and produce a short "what's new" feature intro video (MP4) plus release-note copy. Use when the user wants to showcase, announce, demo, or explain what changed between branches, a PR, or a release — for developers, designers, or product owners. Triggers on "/whatsnew", "make a feature video", "what's new video", "release video", "showcase this branch".
---

# whatsnew

Turn the difference between two branches into a 20–45 second feature intro video and ready-to-paste announcement copy.

You own the story. The scripts only collect facts and render frames — deciding *what is worth showing and why it matters* is your job.

## Usage

```
/whatsnew [base] [head] [--for dev|design|product|all] [--length 20|30|45] [--name "Product name"]
          [--no-capture] [--before-url URL --after-url URL] [--theme dark|light|soft|bold] [--export gif,stills,screenshots] [--yes]
```

- `base` — the branch being compared against. Default: the repo's default branch (`main` / `master`).
- `head` — the branch with the new work. Default: the current branch.
- `--for` — who the video is for. Default: `all`. See `references/storytelling.md`.
- `--length` — target length in seconds. Default: `30`.
- `--name` — product name for the title card. Default: infer from `package.json`, README title, or repo folder name.
- `--no-capture` — don't run the app; build all visuals in HTML.
- `--before-url` / `--after-url` — capture from already-running environments (e.g. production and a PR preview) instead of starting the app locally.
- `--theme` — pick the colour style up front and skip that question.
- `--export` — also export a GIF, one still image per scene, and/or the app screenshots; skips the export question.
- `--yes` — don't ask anything; use your own recommendations for changes and colours, and list them in the report.

Installed as a Claude Code plugin, the command is `/whatsnew:whatsnew`; the arguments are the same.

If the user gives a PR number or a description instead of branch names, work out the branches from git and confirm in one line before going on.

**Check the direction** when one argument is a tag or release: `/whatsnew main 1.6.10` almost always means *what's new on main since 1.6.10* (base `1.6.10`, head `main`), not "what the old tag has that main doesn't". `collect-diff.sh` warns when the comparison looks reversed ("Check the direction" — e.g. 5 commits one way, 97 the other). Then confirm the direction in one line, with both commit counts, before going on.

`<skill-dir>` below means the folder this SKILL.md lives in.

## Asking the user

Two steps below ask the user to choose: **which changes go in the video** (step 4) and **which colour style and extra exports** (step 8, one call). Two more come up only when needed: confirming the **direction** when the branches look reversed (Usage), and **how to continue** if real screens can't be rendered even with a mocked API (step 6). Ask with your agent's multiple-choice question tool (`AskUserQuestion` in Claude Code). If there is none, ask in plain text with a numbered list and wait for the reply.

Don't ask when `--yes` was passed, or when you know nobody can answer (a scheduled job, CI). Then use your recommendations and say in the report what you chose. When asking in plain text, end your turn after the question and continue from the user's reply; the work done so far stays in `whatsnew-output/`. Never ask anything else unless you are truly blocked.

## Workflow

### 1. Preflight

- Confirm you are inside a git repository (`git rev-parse --show-toplevel`). If not, stop and say so.
- Check `node --version` (needs 18+, 22 recommended) and `ffmpeg -version`. If one is missing, tell the user the exact install command for their OS (`brew install ffmpeg`, etc.) and stop.
- First run only: if `<skill-dir>/scripts/node_modules` is missing, run
  `npm install --prefix <skill-dir>/scripts` and then `npx --prefix <skill-dir>/scripts playwright install chromium`.
- Make sure `whatsnew-output/` is in the repo's `.gitignore` (add it if not, and tell the user you did).

### 2. Collect the change

```
bash <skill-dir>/scripts/collect-diff.sh <base> <head>
```

This writes `whatsnew-output/diff-context.md`: commits, diffstat, changed files, and a trimmed diff (lockfiles, build output and binaries excluded). Read the whole file.

If the diff is truncated, open the most important changed files directly. Prioritise UI components, routes/pages, API handlers, schema/migrations, and config flags over tests and refactors.

### 3. Understand what is actually new

Sort every change into one of:

- **User-visible feature** — something a user can now see or do.
- **Improvement** — faster, clearer, fewer steps, fixed bug users hit.
- **Under the hood** — refactors, deps, tests, CI. Only worth a single line, and only for `--for dev`.

Rules:
- **Never invent.** Every claim in the video must trace back to the diff or commit messages. If you are unsure what something does, read the code; if still unsure, leave it out.
- **Never leak secrets.** Do not put tokens, keys, internal URLs, env values, or customer data from the diff into the video or copy.
- **Fictional data only on screen:** "Demo vessel", "Demo vessel 2", "Demo user", "Demo supplier" — never realistic customer, ship, people or company names, emails or URLs, even when the repo's fixtures contain them.
- **Bug fixes: find the symptom.** For every fix, work out what users actually saw go wrong (commit message, linked issue, the code path) and what they see now — e.g. "after a refresh the old file came back; now the new one stays". That before/after *is* the scene. If the diff doesn't make the symptom clear — or the user names a fix in the change picker — ask in one line what users saw.
- If nothing user-visible changed, tell the user and offer a short "changelog card" version (title + 3 bullet lines) instead of a full video.

### 4. Let the user pick the changes

Turn your sorted list into checklist items, one per change worth mentioning, most important first. Merge tiny related changes into one item ("Small UI fixes in settings") so the list stays scannable.

Ask one multi-select question (`multiSelect: true`): *"Which changes should be in the video? Tick all you want."*
- Each option: `label` = the change in ≤ 5 words, in the user's language ("One-tap checkout"); `description` = what it does for users in one line, ending with "(recommended)" for the ones you would show.
- The question tool takes at most 4 options per question and 4 questions per call. With more than 4 items, split them over several questions in the same call, grouped by kind ("New features", "Improvements", "Under the hood"), each with its own header. More than 16 items: merge further.
- The user can type their own answer too ("Other"): treat it as an instruction — add, rename or reword items accordingly.

Then:
- Nothing ticked → ask once more whether to stop or let you choose.
- More ticked items than fit the length (roughly 1 moment per 7–8 seconds after the title and recap) → keep the biggest as their own scenes and group the rest into the recap, or suggest `--length 45` in one line.
- Unticked items never appear in the video or the share copy.

### 5. Plan the video

Read `references/storytelling.md`, then write `whatsnew-output/plan.md`:

```
# Headline           (≤ 7 words, benefit not feature name)
# One-liner          (≤ 18 words)
# Audience           (dev | design | product | all)
# Moments            (2–4, from the ticked changes, ordered by impact)
  - What changed     (fact, with file/commit reference)
  - Why it matters   (for this audience)
  - How to show it   (page scene with pan/zoom, before/after flow cards, code snippet, metric) + "illustration" if not a real render
# Cut list           (things you deliberately left out, and why)
```

Show the user the headline and moments in 3–5 lines and continue — they already chose the content, so don't ask again.

### 6. Capture real screens (web apps with UI changes)

Skip this step for non-UI changes or with `--no-capture`. Otherwise read `references/capture.md` and go down its **capture strategy ladder**, using the first rung that works:

- **a.** URLs the user gives (dev, test or preview environments) → `scripts/capture.mjs` against them.
- **b.** The app running locally with no login, a dev auth bypass, or a documented demo account → `scripts/worktrees.sh`, dev servers or `scripts/serve-static.mjs`, then `capture.mjs`.
- **c.** **The built SPA with a mocked API — the default whenever a login, SSO or backend blocks capture** → `scripts/mock-capture.mjs`. Check the build is current (newer than `head`, and contains a string from the new feature — `--expect`), write `mocks.mjs` from the generated API types with "Demo …" data, and iterate until the log shows no `MISS` and no `PAGEERROR`.
- **d.** Only if (c) can't work (server-rendered pages) and the user agrees → a real login (`scripts/login.mjs`).
- **e.** Last resort → illustrations styled with the app's own CSS, labelled as illustrations.

Hard rules:
- **Don't open a visible browser window or ask the user to sign in unless rung (c) can't work** — and then only after asking.
- **Never** use, drive or copy from the user's own browser profile or cookies, and never ask the user to take screenshots by hand.
- Checking whether a session is logged in: call an API endpoint **without following redirects** (`maxRedirects: 0`, `redirect: "manual"`) and accept only a `200` with a JSON body. An SSO page also answers `200` after redirects.
- `capture.mjs` refuses login-page screenshots (exit code 3) — never use them, and never quietly replace them with rebuilt HTML.
- Capture at **1920×1080, 2×** (narrower viewports squeeze tables). Take the full page for each UI moment and `box` the changed element; add tight crops for pop-over details and flow cards.
- Look at every PNG before using it. Delete `whatsnew-output/auth*.json` when done, and always run `worktrees.sh down`.

### 7. Build the composition

Read `references/composition.md`. Copy the starter files, then rewrite `composition.html` scene by scene from the plan:

```
cp <skill-dir>/assets/template.html whatsnew-output/composition.html
cp -R <skill-dir>/assets/fonts whatsnew-output/fonts
mkdir -p whatsnew-output/brand
```

- **Brand it** (see "Brand" in `references/composition.md`): find the app's logo and put it in `whatsnew-output/brand/`; use the app's fonts and colours when the repo has them. The example logos in the template's `brand/` are fictional — never ship them.
- **No branch names, SHAs, PR numbers or file paths on screen.**

- One idea per scene. Scenes of 3–6 seconds (page scenes with pan/zoom 7–8 s). Total duration = `--length`.
- Visuals for UI changes: use the screenshots in `whatsnew-output/shots/`. Default for each UI moment: the **page scene** (breadcrumb + headline + full-page frame that pans and zooms to the change + `.spot`, optional `.pop` crop) — see `references/composition.md`. For bug fixes and multi-step changes: **numbered flow cards** showing the symptom and the fix. `.wipe` still suits a same-screen before/after. Without screenshots, use illustrations made with the app's own CSS (see `references/capture.md`); only if there is no usable CSS at all, rebuild the UI in the video's HTML from the component code (real labels, real fields, real layout) — never a generic mock.
- Visuals for backend/dev changes: short code snippets (≤ 8 lines), API request/response pairs, or before/after numbers.
- Keep all assets local. No external fonts, scripts, or images.
- **Write all four colour themes** (`html[data-theme="dark|light|soft|bold"]` in the template) from the app's colours — see "Colour themes" in `references/composition.md`. Keep every other colour in the page on the theme variables, so switching theme switches everything.

### 8. Let the user pick the colours (and extra exports)

Render a still preview of every theme:

```
node <skill-dir>/scripts/preview.mjs whatsnew-output/composition.html
```

It writes `whatsnew-output/previews/all.png` (all four, labelled) and one PNG per theme, and prints each theme's colours. **Look at `all.png` yourself first** and fix any theme where text is hard to read or the logo disappears (use the `for-dark`/`for-light` logo pair or `on-light`), then re-run the preview.

Show it to the user: open `all.png` in their image viewer (`open` on macOS, `xdg-open` on Linux, `start ""` on Windows) — the question tool can't show images — then ask one single-select question: *"Which colour style?"*
- Four options, the one closest to the app's own look first, marked "(Recommended)".
- `label`: "Light", "Dark", "Soft", "Bold" plus a two-word hint ("Light — app colours"); `description`: one line of what it looks like; `preview` (if the tool supports it): the background, text and accent hex values the script printed.
- A typed answer ("darker green", "use #1E40AF", "like the dark one but warmer"): adjust that theme, re-run the preview, and ask once more.

In the **same question call**, ask a second, multi-select question: *"Also export as?"* — options **GIF** ("for READMEs, Slack and tickets"), **Stills** ("one image per scene, for slides and docs"), **Screenshots** ("the clean app screens the video uses" — only offer it when screens were captured). Nothing ticked means just the MP4. Skip this question when `--export` was given; with `--yes` and no `--export`, export nothing extra.

Set the colour choice on the root element, `<html lang="en" data-theme="light">`. With `--theme` given, skip the colour question but still look at that theme's preview.

### 9. Render

```
node <skill-dir>/scripts/render.mjs whatsnew-output/composition.html whatsnew-output/whatsnew.mp4
```

The renderer steps through the composition's CSS animations frame by frame, so timing is exact and the output is smooth regardless of machine speed.

### 10. Check your work

Pull 4 frames — one from the middle of each main scene — and look at them:

```
ffmpeg -loglevel error -y -ss <seconds> -i whatsnew-output/whatsnew.mp4 -frames:v 1 whatsnew-output/check-<n>.png
```

Fix and re-render if you see: text overflowing or clipped, overlapping elements, unreadable contrast, an empty scene, or a claim that isn't in the diff. Delete the check images when done.

### 11. Export

If GIF, stills or screenshots were chosen:

```
node <skill-dir>/scripts/export.mjs --gif --stills --screenshots   # only the chosen ones
```

It writes to `whatsnew-output/export/`: `whatsnew.gif` (960 px, 15 fps — it warns above 10 MB; use `--gif-width 720 --gif-fps 12` to shrink), `stills/01-<scene>.png …` (3840×2160, each scene once everything in it has appeared) and `screenshots/` (the `before-*`/`after-*` app captures). Open one still and the GIF's first frames to check them.

### 12. Write the share copy

Write `whatsnew-output/share.md` with:

- **Release note** — headline + 2–4 bullets.
- **Slack / Teams post** — 2–3 sentences, casual, mentions the video.
- **PR description snippet** — a "What's new" section in Markdown.

Same rules: only what is in the diff and what the user ticked, matched to the audience.

### 13. Report

Tell the user, briefly:
- where the video is (`whatsnew-output/whatsnew.mp4`) and its length, plus any exports (`whatsnew-output/export/`),
- the headline you chose, and the changes and colour style used (say which ones you picked yourself because nobody was asked),
- anything you cut or were unsure about.

Do not recap every step.
