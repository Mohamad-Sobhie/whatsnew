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
          [--no-capture] [--before-url URL --after-url URL]
```

- `base` — the branch being compared against. Default: the repo's default branch (`main` / `master`).
- `head` — the branch with the new work. Default: the current branch.
- `--for` — who the video is for. Default: `all`. See `references/storytelling.md`.
- `--length` — target length in seconds. Default: `30`.
- `--name` — product name for the title card. Default: infer from `package.json`, README title, or repo folder name.
- `--no-capture` — don't run the app; build all visuals in HTML.
- `--before-url` / `--after-url` — capture from already-running environments (e.g. production and a PR preview) instead of starting the app locally.

Installed as a Claude Code plugin, the command is `/whatsnew:whatsnew`; the arguments are the same.

If the user gives a PR number or a description instead of branch names, work out the branches from git and confirm in one line before going on.

`<skill-dir>` below means the folder this SKILL.md lives in.

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
- If nothing user-visible changed, tell the user and offer a short "changelog card" version (title + 3 bullet lines) instead of a full video.

### 4. Plan the video

Read `references/storytelling.md`, then write `whatsnew-output/plan.md`:

```
# Headline           (≤ 7 words, benefit not feature name)
# One-liner          (≤ 18 words)
# Audience           (dev | design | product | all)
# Moments            (2–4, ordered by impact)
  - What changed     (fact, with file/commit reference)
  - Why it matters   (for this audience)
  - How to show it   (before/after, UI mock, code snippet, metric, flow)
# Cut list           (things you deliberately left out, and why)
```

Show the user the headline and moments in 3–5 lines and continue unless they object — do not wait for approval.

### 5. Capture real screens (web apps with UI changes)

Read `references/capture.md` and follow it: check out both versions with `scripts/worktrees.sh`, start both apps, write `whatsnew-output/shots.json` from the moments in `plan.md`, run `scripts/capture.mjs` for `before` and `after`, look at every screenshot, then always run `worktrees.sh down`.

Skip this step for non-UI changes, for projects you can't start locally, or with `--no-capture`. If the app won't start (missing database, secrets), say what's missing in one line and continue with HTML visuals — capture is a bonus, never a blocker.

### 6. Build the composition

Read `references/composition.md`. Copy the starter files, then rewrite `composition.html` scene by scene from the plan:

```
cp <skill-dir>/assets/template.html whatsnew-output/composition.html
cp -R <skill-dir>/assets/fonts whatsnew-output/fonts
mkdir -p whatsnew-output/brand
```

- **Brand it** (see "Brand" in `references/composition.md`): find the app's logo and put it in `whatsnew-output/brand/`; use the app's fonts and colours when the repo has them. The example `brand/logo.png` from the template is fictional — never ship it.
- **No branch names, SHAs, PR numbers or file paths on screen.**

- One idea per scene. Scenes of 3–6 seconds. Total duration = `--length`.
- Visuals for UI changes: use the screenshots in `whatsnew-output/shots/` when you have them (`.wipe` for before/after, `.shot` + `.spot` to point at the change). Without screenshots, rebuild the relevant UI in HTML/CSS from the actual component code (real labels, real fields, real layout) — not a generic mock.
- Visuals for backend/dev changes: short code snippets (≤ 8 lines), API request/response pairs, or before/after numbers.
- Keep all assets local. No external fonts, scripts, or images.

### 7. Render

```
node <skill-dir>/scripts/render.mjs whatsnew-output/composition.html whatsnew-output/whatsnew.mp4
```

The renderer steps through the composition's CSS animations frame by frame, so timing is exact and the output is smooth regardless of machine speed.

### 8. Check your work

Pull 4 frames — one from the middle of each main scene — and look at them:

```
ffmpeg -loglevel error -y -ss <seconds> -i whatsnew-output/whatsnew.mp4 -frames:v 1 whatsnew-output/check-<n>.png
```

Fix and re-render if you see: text overflowing or clipped, overlapping elements, unreadable contrast, an empty scene, or a claim that isn't in the diff. Delete the check images when done.

### 9. Write the share copy

Write `whatsnew-output/share.md` with:

- **Release note** — headline + 2–4 bullets.
- **Slack / Teams post** — 2–3 sentences, casual, mentions the video.
- **PR description snippet** — a "What's new" section in Markdown.

Same rules: only what is in the diff, matched to the audience.

### 10. Report

Tell the user, briefly:
- where the video is (`whatsnew-output/whatsnew.mp4`) and its length,
- the headline you chose,
- anything you cut or were unsure about.

Do not recap every step.
