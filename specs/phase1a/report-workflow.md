# Joint report workflow

Status: **PROPOSED**

## Applicability

This workflow runs only in report-arm cells B and D.

## Requirements

- `RPT-01` — The draft step receives the complete public workshop history and the approved report prompt.
- `RPT-02` — The draft artifact is immutable once committed.
- `RPT-03` — Two reviews are generated from isolated contexts containing the same draft and reviewer-specific prompt.
- `RPT-04` — Neither reviewer sees the other review.
- `RPT-05` — Revision begins only after both reviews have terminal outcomes.
- `RPT-06` — The revision context contains the immutable draft, both committed reviews, and the revision prompt.
- `RPT-07` — Draft, reviews, revised report, prompts, contexts, timings, hashes, and provider outcomes are preserved separately.
- `RPT-08` — `t2` is collected only after the revised report is committed.
- `RPT-09` — A reviewer refusal is preserved as an outcome; a provider failure follows the technical failure policy.

## Acceptance example

Given a report-arm run with a committed `t1`, when the draft and two reviews complete, then the revision receives exactly those three artifacts, the two reviewers remain mutually isolated, and `t2` becomes the next state.
