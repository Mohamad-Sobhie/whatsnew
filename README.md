# whatsnew

**Turn a branch diff into a feature intro video.**

`/whatsnew` compares two git branches, works out what's actually new, and renders a short (20–45 s) "what's new" video plus ready-to-paste release notes — for developers, designers, and product owners.

<p align="center"><img src="docs/demo.gif" alt="A 20-second whatsnew video: title card, before/after wipe of a checkout page, spotlight on the new pay button, recap" width="800"></p>
<p align="center"><sub>Made with <code>/whatsnew</code> from a demo shop's feature branch: real screenshots of both branches, the app's own logo and colours.</sub></p>

Inspired by [brag](https://github.com/latent-spaces/brag), which makes launch videos for whole projects. `whatsnew` focuses on *the change*: what one branch adds on top of another.

> Status: v0.5 — captures real before/after screenshots of web apps and brands the video with the app's logo, fonts and colours. Music and voiceover are next.

## What you get

```
whatsnew-output/
├── diff-context.md   # what the agent read: commits, diffstat, trimmed diff
├── plan.md           # headline, audience, chosen moments, cut list
├── shots.json        # which screens to capture, and how to reach them
├── shots/            # before-*.png / after-*.png screenshots + manifests
├── brand/            # the app's logo, found in your repo
├── fonts/            # the app's fonts, or the bundled ones
├── previews/         # the four colour styles, for you to pick from
├── composition.html  # the video as an HTML page (edit and re-render)
├── whatsnew.mp4      # the video, 1920×1080
└── share.md          # release note, Slack post, PR snippet
```

## Usage

From inside any git repository, in Claude Code (or another agent that supports Agent Skills):

```
/whatsnew                                   # current branch vs main
/whatsnew main feature/one-tap-checkout
/whatsnew main HEAD --for product --length 20
/whatsnew v2.3.0 v2.4.0 --for dev
```

| Option     | Values                         | Default                |
|------------|--------------------------------|------------------------|
| `base`     | branch, tag or SHA             | repo default branch    |
| `head`     | branch, tag or SHA             | current branch         |
| `--for`    | `dev` `design` `product` `all` | `all`                  |
| `--length` | `20` `30` `45` (seconds)       | `30`                   |
| `--name`   | product name                   | from package.json/README |
| `--no-capture` | skip running the app       | capture when UI changed |
| `--before-url` / `--after-url` | capture from deployed environments (e.g. prod + PR preview) | run locally |
| `--theme`  | `dark` `light` `soft` `bold`   | ask                    |
| `--yes`    | skip both questions, use Claude's picks (use this in CI or scheduled runs) | ask |

Before it renders, `/whatsnew` asks you two things:

1. **Which changes go in the video.** It lists what it found in the diff, with its recommendations marked, and you tick the ones you want. Anything you leave out stays out of the video and the release notes.
2. **Which colour style.** It renders a preview of your video in four styles made from your app's colours (light, dark, soft and bold), opens the preview image, and you pick one, or describe what you want ("darker", "use #1E40AF").

## Requirements

- macOS or Linux (on Windows, use WSL)
- An agent that supports Agent Skills (e.g. Claude Code)
- Node.js 18+ (22 recommended)
- FFmpeg on your `PATH` — macOS: `brew install ffmpeg`
- Playwright Chromium — installed automatically on first run

## Install

### Claude Code plugin (recommended)

Inside Claude Code:

```
/plugin install whatsnew --marketplace Mohamad-Sobhie/whatsnew
```

Or in two steps, from your terminal:

```bash
claude plugin marketplace add Mohamad-Sobhie/whatsnew
claude plugin install whatsnew@whatsnew
```

Run it as `/whatsnew:whatsnew` (plugin skills are prefixed with the plugin name), or just ask Claude to "make a what's new video for this branch". Update later with `claude plugin marketplace update whatsnew`.

### Any agent (Claude Code, Cursor, Codex, Copilot, …)

```bash
npx skills add Mohamad-Sobhie/whatsnew --skill whatsnew
```

Add `-g` to install it for all your projects instead of just the current one. Run it as `/whatsnew`.

### Manual

```bash
git clone https://github.com/Mohamad-Sobhie/whatsnew.git
mkdir -p ~/.claude/skills
ln -s "$(pwd)/whatsnew/skills/whatsnew" ~/.claude/skills/whatsnew
```

## How it works

1. `scripts/collect-diff.sh` gathers commits, diffstat and a trimmed diff (no lockfiles or build output).
2. The agent sorts changes into features / improvements / under-the-hood, **asks you which ones to include**, and plans 2–4 moments for the chosen audience (`references/storytelling.md`).
3. For web apps with UI changes, `scripts/worktrees.sh` checks out both versions side by side (outside your repo), the agent starts both dev servers, and `scripts/capture.mjs` screenshots the changed screens on each — recording where the changed element sits so the video can spotlight it (`references/capture.md`).
4. The agent writes the video as a single HTML page with CSS animations (`references/composition.md`, starting from `assets/template.html`), with four colour themes built from your app's colours. `scripts/preview.mjs` renders stills of each, and **you pick one**.
5. `scripts/render.mjs` seeks every animation frame by frame in headless Chromium and pipes the frames to FFmpeg — deterministic, smooth output on any machine.
6. The agent checks sample frames, fixes layout issues, and writes share copy.

Render the example on its own:

```bash
cd skills/whatsnew/scripts && npm install && npx playwright install chromium
node render.mjs ../assets/template.html /tmp/example.mp4
```

## Roadmap

- [x] v0.1 — diff → plan → HTML composition → MP4 + share copy
- [x] v0.2 — real UI capture: both branches in git worktrees, Playwright screenshots, wipe + spotlight scenes
- [ ] Background music and sound effects
- [ ] Optional voiceover
- [ ] Vertical (9:16) and square formats
- [x] v0.5 — you choose the changes and the colour style before rendering
- [x] v0.4 — branding: the app's logo, fonts and colours; no branch names on screen
- [x] Claude Code plugin marketplace install and `npx skills add`

## Releasing a new version

1. Bump `version` in `.claude-plugin/plugin.json` (users on the plugin only get changes when the version changes).
2. Run `claude plugin validate --strict .`
3. Commit, tag (`git tag v0.3.0`) and push with `--tags`.

## License

MIT. Bundled fonts (Bricolage Grotesque, Instrument Sans, IBM Plex Mono) are under the SIL Open Font License — see `skills/whatsnew/assets/fonts/OFL.txt`.
