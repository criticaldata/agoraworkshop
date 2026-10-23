# Joint report workflow

Status: **ENGINEERING BASELINE IMPLEMENTED — SCIENTIFIC FREEZE PENDING**

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
- `RPT-10` — The engineering baseline counterbalances report roles across the three replications: P1/P2/P3 each writes once and reviews twice. The selected allocation and policy version are preserved as evidence. This allocation still requires scientific approval before a live pilot.

## Ownership boundary

WP03 produces a deterministic, provider-neutral operation plan and the exact
context for each stage. WP02 owns provider routing and invocation. WP04 owns
durable evidence persistence. WP03 does not contain credentials, deployment
selection, retry transport, or model-specific request code.

## Acceptance example

Given a report-arm run with a committed `t1`, when the draft and two reviews complete, then the revision receives exactly those three artifacts, the two reviewers remain mutually isolated, and `t2` becomes the next state.
