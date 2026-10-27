# whatsnew

**Turn a feature branch into a short “what’s new” video, plus the release notes.**

<p align="center"><img src="docs/intro.gif" alt="How whatsnew works: run /whatsnew with two branches, tick the changes to show, pick a colour style, get a video and release notes" width="800"></p>

You finish a feature. Your PR description says “refactor checkout flow”. Your designer, product owner and users have no idea what changed.

`/whatsnew` is an agent skill for Claude Code (and Cursor, Codex and other agents) that compares two git branches and makes a 20–45 second video showing what's new: real before/after screenshots of your app, in your app's logo, fonts and colours. It also writes a release note, a Slack post and a PR description.

```
/plugin install whatsnew --marketplace Mohamad-Sobhie/whatsnew
```

Then, in any repo: `/whatsnew:whatsnew main your-feature-branch`. More install options are under [Install](#install).

## How it works

1. **Run it with two branches.** It reads the diff and works out which changes users will actually notice.
2. **Tick what to show.** You get the list of changes, with recommendations, and choose what goes in.
3. **Pick a style.** It previews your video in four colour styles made from your app's colours: light, dark, soft or bold.
4. **Get the video and the copy.** `whatsnew.mp4` plus `share.md` with a release note, a Slack/Teams post and a PR description.

It only shows what's in the diff, never invents features, and keeps branch names and internal details off screen. Pick the audience with `--for dev`, `design` or `product`.

## Example output

<p align="center"><img src="docs/demo.gif" alt="Example whatsnew video: title card, before/after wipe of a checkout page, spotlight on the new pay button, recap" width="720"></p>
<p align="center"><sub>Made with <code>/whatsnew</code> from a small demo shop's feature branch (a one-tap checkout).</sub></p>

> Status: v0.7. Web apps get real screenshots, even behind company SSO: it runs your existing production build with the API answered by mock data, so it needs no login, backend or database. Other projects get visuals built from the code. Music and voiceover are next.

Inspired by [brag](https://github.com/latent-spaces/brag), which makes launch videos for whole projects. `whatsnew` focuses on *the change*: what one branch adds on top of another.

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

Before it renders, `/whatsnew` asks you two things (skip them with `--yes`):

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

## Under the hood

1. `scripts/collect-diff.sh` gathers commits, diffstat and a trimmed diff (no lockfiles or build output).
2. The agent sorts changes into features / improvements / under-the-hood, **asks you which ones to include**, and plans 2–4 moments for the chosen audience (`references/storytelling.md`).
3. For web apps with UI changes, the agent goes down a capture ladder: environments you point it at, then the app running locally, then **your production build with every API call answered by mock data** (`scripts/mock-capture.mjs`), which is the default when a login, SSO or a backend gets in the way. For the local route, `scripts/worktrees.sh` checks out both versions side by side (outside your repo), the agent starts both apps (dev servers, or built output via `scripts/serve-static.mjs`), and `scripts/capture.mjs` screenshots the changed screens on each — recording where the changed element sits so the video can spotlight it (`references/capture.md`).
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
- [x] v0.7 — built app + mocked API as the default for apps behind SSO; page scenes that pan and zoom to the change; numbered before/after cards for bug fixes
- [x] v0.6 — apps behind a login (log in once in a real browser), already-built apps (`dist/`), login-page detection
- [x] v0.5 — you choose the changes and the colour style before rendering
- [x] v0.4 — branding: the app's logo, fonts and colours; no branch names on screen
- [x] Claude Code plugin marketplace install and `npx skills add`

## Releasing a new version

1. Bump `version` in `.claude-plugin/plugin.json` (users on the plugin only get changes when the version changes).
2. Run `claude plugin validate --strict .`
3. Commit, tag (`git tag v0.6.0`) and push with `--tags`.

The README intro (`docs/intro.gif`) is itself a whatsnew composition, `docs/intro.html`. To change it, edit the HTML, then:

```bash
node skills/whatsnew/scripts/render.mjs docs/intro.html /tmp/intro.mp4
ffmpeg -i /tmp/intro.mp4 -vf "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" docs/intro.gif
```

## License

MIT. Bundled fonts (Bricolage Grotesque, Instrument Sans, IBM Plex Mono) are under the SIL Open Font License — see `skills/whatsnew/assets/fonts/OFL.txt`.
