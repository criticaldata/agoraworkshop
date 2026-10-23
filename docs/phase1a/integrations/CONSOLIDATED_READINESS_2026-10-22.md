# Phase 1A consolidated engineering readiness

Date: 2026-10-22 (America/Guayaquil)

Scientific status: **SCIENTIFIC_FREEZE_PENDING**

Release class: **offline engineering baseline; no behavioral result and no live pilot approval**

## Consolidation source

Mateo's draft PR #18 supplied a useful twelve-run integration test and an audit of
the gap between WP01, the runtime and WP05. This branch retains that test intent but
uses the production `wp01-runtime-adapter-v1` instead of PR #18's explicitly test-only
projection. PR #18 was not merged as-is because it was behind `master`, conflicted
with the merged WP03 documentation, and several findings had changed after PR #20.

WP01 remains the canonical scientific contract. The integration work does not close
or silently decide its open scientific questions.

## Review findings and disposition

| Prior finding | Disposition in this consolidation | Remaining boundary |
|---|---|---|
| WP01 and runtime used independent manifests | Versioned adapter verifies WP01 hashes and preserves campaign, run, slot, prompt and deployment provenance | Scientific admission remains closed until the campaign and freeze decisions are genuinely frozen |
| Provider configuration was recorded but not sent | `ProviderCallSpec.configuration` is sent, archived and compared with the recorded request | Real provider adapters and exact approved deployments still require qualification |
| Report roles were hard-coded | WP03 counterbalances writer/reviewers by replication and records the allocation | D08 still requires scientific approval |
| Evidence verifier ignored call metadata | Request, configuration, model/provider, context, raw response, retry and terminal-event links are verified; tampering tests fail | Live-data access and retention review remains required |
| Abstention collapsed into refusal | WP05 preserves `abstained` separately from delivered and provider refusal | WP06 must approve the analysis aggregation |
| Phase 1A evidence existed only in memory | Append-only SQLite snapshots use atomic transactions, WAL and full sync; an abrupt-process kill/restart test resumes without repeating committed calls | Production storage location, backup and authorization policy remain deployment decisions |
| `npm run validate` was a no-op import | The script now calls the real validation CLI and propagates gate failure through its exit code | Human release verdict remains separate from automation |
| CI actions emitted Node 20 warnings | Checkout, setup-node and artifact upload use their current Node 24 major versions | Self-hosted runners must meet the versions required by those actions |

## What the offline baseline proves

- the four WP01 cells and three replications project deterministically into the
  executable WP02/WP03 plan;
- report disclosure occurs only in B/D, after every `t0` commit and before public
  discussion;
- provider parameters received by the adapter equal the parameters in evidence;
- private checkpoint and isolated review artifacts do not enter unauthorized context;
- technical failures, refusal and abstention retain different trace semantics;
- committed work survives abrupt process termination and resumes without duplicate
  committed calls;
- WP05 starts from a verified parent request and remains gated by human cue review.

## What is not yet approved

The exact live Gemma/Gemini/Model X deployments, prompt registry, speaking order,
report allocation, numeric cost/time/concurrency budgets, replay sampling plan,
private probes, behavioral codebook, scientific freeze authority, archive policy and
WP06 analysis remain open in the WP01 decision register. No mock or engineering test
is presented as evidence that those scientific choices are complete.

## Release rule

This branch may merge after green CI and human review. A live pilot may not start
until the scientific admission gate accepts a frozen WP01 campaign and the named
reviewers approve the deployment and evidence controls.
