# WP03 — Workshop and report workflow

Status: **ENGINEERING BASELINE IMPLEMENTED — SCIENTIFIC FREEZE PENDING**

WP03 converts the WP01 study contract into a deterministic, provider-neutral
workshop plan. The core runtime now delegates workshop ordering, report-role
allocation, context construction, and the report-notice boundary to WP03.

## Shipped engineering behavior

- exactly three private `t0` checkpoints precede the report notice;
- exactly six public rounds execute in the declared speaking order;
- `t1`/`T6` occurs after round six;
- report arms execute draft, two isolated reviews, revision, then `t2`/`TR`;
- reviewer contexts contain one immutable draft and never the peer review;
- revision receives exactly draft, review 1, and review 2 in that order;
- a refusal is a terminal review artifact while technical failure remains WP02's
  retry/failure path;
- role allocation rotates across replications so P1, P2, and P3 each write once;
- the workflow version and selected role allocation are recorded in run evidence;
- no-report arms contain no report or `t2` operation.

## Package boundary

WP03 does not choose deployments, call a provider, hold credentials, or implement
transport retries. Those remain WP02 responsibilities. WP04 remains responsible
for durable storage and visibility enforcement outside the current ledger. WP06
owns behavioral interpretation and scientific claims.

## Scientific boundary

The counterbalanced rotation is an engineering baseline chosen to avoid a fixed
writer confound and to make all mock runs reproducible. WP01 decision D08 remains
`PROPOSED`; the research team must approve or supersede this policy before a live
pilot. The implementation therefore proves workflow mechanics, not a scientific
freeze or a behavioral result.

## Evidence

- implementation: `src/phase1a/wp03/workflow.ts`;
- focused acceptance tests: `tests/phase1aWp03.test.ts`;
- runtime integration tests: `tests/phase1aRuntime.test.ts`;
- executed acceptance record: `docs/phase1a/wp03/ACCEPTANCE.md`;
- normative requirements: `specs/phase1a/report-workflow.md`;
- requirement map: `specs/phase1a/requirement-test-matrix.md`.
