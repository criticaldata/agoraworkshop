# ADR-002: Canonical WP01-to-WP05 integration boundary

Status: **ACCEPTED**  
Date: 2026-10-22  
Owner: Simon Heilles / WP02

## Article claim supported

Every workshop and replay can be traced to one versioned experimental contract,
rather than to parameters reconstructed after execution.

## Context

WP01 exports a study contract, campaign/run manifests, prompt references, an
agenda, and deployment bindings. The current runtime has an independent fixture
manifest. Tests project WP01 into that runtime, but production has no versioned
adapter or freeze-authorization gate.

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

Pass when a negative integration test proves that a changed prompt hash,
unresolved freeze decision, unknown participant, or unsupported deployment
prevents all provider calls.

## Revisit trigger

Supersede when WP01 publishes a backwards-incompatible contract version.
