# Presentations

## `phase0-closure-deck.html`

The Phase 0 / 0.1 closure deck. Thirteen slides, built to be understood by someone who has
never worked on the project.

Open the file in any browser. No build step, no dependencies, no network needed beyond the
Google Fonts link.

| Key | Does |
| --- | --- |
| `→` / `←` / `Space` | Next / previous slide |
| `Home` / `End` | First / last slide |
| `N` | Toggle speaker notes |

The URL tracks the slide (`#7`), so a link can point at one slide. On a tablet, swipe.

### The argument the deck makes

It is built around one question, and every slide is evidence for it:

> An agent said nothing. Did it choose to — or did the system break and never ask it?

The arc runs: the silence → two worlds with identical transcripts → so we built an instrument
before studying behaviour → what it does → we broke it on purpose → it caught all five →
how we knew before that (stand-in models) → every check must be able to fail → what we
measured on the real model → the live campaigns → what we still cannot say → three
decisions → the callback.

Slides 5 and 6 are a setup and a punchline. Pause before advancing to 6.

### Editing it

Each slide is one `<section class="slide" data-title="…">`. Add a slide by copying an existing
section; the navigation, counter, progress bar and notes pick it up automatically — nothing
is hardcoded to a slide count.

Two conventions worth keeping:

- **One idea per slide.** The audience is a reader who has not seen this codebase. Depth
  belongs in `docs/audits/`, which the deck points at rather than reproduces. An earlier
  version carried the full M1–M30 matrix and was cut for exactly this reason.
- **Speaker notes go in `<div class="note">`,** with a `<b>Talk track</b>` label. They are
  hidden until someone presses `N`.

Colours and type come from CSS custom properties at the top of the file. Use the existing
tokens rather than literal colours — every one is defined for both light and dark, and a
raw hex will break in one of them.

The file is deliberately a fragment: no `<!doctype>`, `<html>`, `<head>` or `<body>`. Browsers
supply those, and leaving them out keeps the file publishable as-is. Please keep it that way.

### The published link

The deck is published as a Claude artifact at a **stable URL**:

```
https://claude.ai/code/artifact/33e81333-0fdf-4be5-ae06-3f90de66543c
```

That URL does not change. It is the link to share, and it keeps working across edits.

It does **not** update by itself. There is no hook from a git push to the published page —
the page changes only when someone republishes this file. After editing, ask Claude Code:

> Republish `docs/presentations/phase0-closure-deck.html` to
> `https://claude.ai/code/artifact/33e81333-0fdf-4be5-ae06-3f90de66543c`

Passing that URL updates the existing artifact in place. Publishing *without* it creates a
second artifact on a new URL, which is how a shared link silently goes stale — so always pass
the URL.

Two consequences worth knowing:

- **A push is not a publish.** Merging a change to this file updates the repository, not the
  link. Whoever merges should republish, or say in the PR that it still needs doing.
- **The artifact is the copy people see.** If the two drift, the repository is the source of
  truth and the artifact is out of date — not the other way round.

If a link that tracks `master` automatically is worth more than the presentation polish, the
alternative is GitHub Pages, which does rebuild on push. It would need this file converted to
a standalone document and the repository's visibility settled, since Pages on a private
repository is a paid feature.

### Known gap

Slide 9, *What we measured once a real model was in the loop*, covers the preflight but not
model inference behaviour. The latency, throughput and generation measurements from the
campaigns still need to be added there.

The campaign figures on slide 10 are transcribed from
`docs/audits/PHASE_0_AND_0_1_FINAL_CLOSURE_AUDIT_2026-08-27.md`. If that document changes,
update the slide with it.
