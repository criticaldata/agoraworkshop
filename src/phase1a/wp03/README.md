# WP03 — Workshop and report workflow

Status: `ENGINEERING_BASELINE_IMPLEMENTED_SCIENTIFIC_FREEZE_PENDING`

`workflow.ts` owns the provider-neutral workshop semantics consumed by the core
runtime:

- three private `t0` checkpoints before the report notice;
- six public rounds with the frozen speaking order;
- three private `t1`/`T6` checkpoints;
- report draft, two mutually isolated reviews, revision, then private `t2`/`TR`;
- counterbalanced writer and reviewer roles across replications 1–3;
- exact context construction for every checkpoint and report stage.

WP03 consumes the WP01 manifest, prompts and decision status. It returns a
deterministic operation plan and context messages without importing provider
credentials, deployment bindings or adapter code. WP02 remains responsible for
executing those operations against model providers. WP04 remains responsible for
durable evidence storage; the current ledger records the WP03 plan and role
allocation for integration testing.

The counterbalanced allocation is recorded as WP03-D01. It remains subject to
scientific review before a live pilot.
