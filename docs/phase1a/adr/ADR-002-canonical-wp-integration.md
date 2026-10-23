# ADR-002: Canonical WP01-to-WP05 integration boundary

Status: **ACCEPTED, ENGINEERING BASELINE IMPLEMENTED**
Date: 2026-10-22  
Owner: Simon Heilles / WP02

## Article claim supported

Every workshop and replay can be traced to one versioned experimental contract,
rather than to parameters reconstructed after execution.

## Context

WP01 exports a study contract, campaign/run manifests, prompt references, an
agenda, and deployment bindings. `wp01-runtime-adapter-v1` now performs the
versioned projection and rejects scientific admission until the campaign and
all freeze-blocking decisions are frozen.

## Decision

WP01 is the canonical source of experimental meaning. WP02 must consume it
through a single versioned adapter that:

- verifies the frozen contract and manifest hashes;
- rejects unresolved required decisions;
- preserves run, opportunity, participant, prompt, and deployment identifiers;
- maps `T0`, `T6`, and `TR` explicitly to runtime checkpoint names;
- produces a deterministic execution plan before any provider call;
- records adapter version and input/output hashes in the evidence bundle.

WP03 supplies workflow semantics to the adapter. WP04 owns contexts and stored
evidence. WP05 may consume only committed WP04 evidence from an admitted run.

## Alternatives considered

- Continue using the test-only fixture projection in production. Rejected
  because tests cannot authenticate scientific approval.
- Let each work package translate WP01 independently. Rejected because several
  translations could produce incompatible experiments.

## Consequences

- A manifest mismatch becomes an admission failure, not a warning.
- WP05 can identify the exact parent contract and adapter version.
- Implementing the adapter is a blocker for live execution, not for mock tests.

## Evidence and acceptance

Implemented in `src/phase1a/wp02/adapter.ts`. Negative integration tests prove that a changed prompt hash,
unresolved freeze decision, unknown participant, or unsupported deployment
prevents all provider calls. Synthetic engineering admission remains visibly distinct
from scientific admission.

Discussion provenance:

- Community group message `WA-COM-210450` on 2026-10-13 records the modular split
  between experiment specification, orchestrator, model adapters, and evidence
  store.
- Community group message `WA-COM-213317` on 2026-10-20 records the common
  `src/phase1a/wp01` through `wp06` layout and the decision to reuse validated
  Phase 0 infrastructure rather than duplicate it.
- Community group message `WA-COM-213273` on 2026-10-20 requests an explicit WP01-to-WP05
  interface for parent context, experimental assumptions, and measured response.

## Revisit trigger

Supersede when WP01 publishes a backwards-incompatible contract version.
