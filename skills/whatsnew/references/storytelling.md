# Storytelling for feature videos

A feature video answers one question for one viewer: **"What can I do now that I couldn't before — and why should I care?"**

## Pick the hook first

The headline names the benefit, not the implementation.

| Weak (implementation)          | Strong (benefit)                     |
|--------------------------------|--------------------------------------|
| Added CSV export endpoint      | Take your data anywhere              |
| Refactored checkout component  | Checkout in two taps                 |
| New `useDebounce` hook in search | Search that keeps up with you      |

For `--for dev`, it is fine to be more literal ("Typed API client, zero config") — developers like specifics.

## Tailor to the audience

| Audience  | Cares about                                   | Show                                       | Avoid                         |
|-----------|-----------------------------------------------|--------------------------------------------|-------------------------------|
| `dev`     | APIs, DX, performance, breaking changes       | Code snippets, request/response, numbers   | Marketing language            |
| `design`  | Flows, layout, states, consistency, a11y      | Before/after UI, interaction states        | Code                          |
| `product` | User outcomes, fewer steps, new capabilities  | The user journey, the "aha" moment         | File names, technical terms   |
| `all`     | The single biggest change, explained simply   | UI first, one technical note at most       | Anything needing context      |

## Choosing moments

1. Rank changes by how much they change a user's day.
2. Keep the top 2–4. Everything else goes in the cut list (and can go in the release note).
3. Each moment needs a *visual*. If you cannot show it, it is a bullet in the release note, not a scene.

## Structure (30 s default)

| Scene      | Length | Purpose                                         |
|------------|--------|-------------------------------------------------|
| Title      | 3–4 s  | Product name + headline                         |
| Moment 1   | 6–8 s  | The biggest change — usually a before/after     |
| Moment 2–3 | 5–6 s each | Supporting changes                          |
| Recap      | 4 s    | 2–4 short lines of what's new                   |
| Outro      | 3 s    | The app's logo, and where to try it (if known)  |

Scale proportionally for 20 s (drop a moment) or 45 s (add one, give moments more room).

Never show branch names, commit SHAs, PR numbers or file paths on screen — viewers don't care how it was built. They belong in `share.md` (the PR snippet), not the video. Exception: `--for dev` may name an API or function that users call.

## Tone

Confident, short sentences, no hype words ("revolutionary", "game-changing"). On-screen text: ≤ 8 words per line, ≤ 2 lines per block. If a viewer needs to pause to read it, it is too long.
