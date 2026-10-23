# ADR-005: Evidence durability and integrity

Status: **ACCEPTED, IMPLEMENTATION PENDING**  
Date: 2026-10-22  
Engineering owner: Simon Heilles / provisional WP04 maintainer

## Article claim supported

AGORA can distinguish behavioral outcomes from missing calls, retries, storage
loss, and later alteration of the evidence.

## Context

The current ledger preserves events, artifacts, requests, responses, hashes,
and restore behavior in memory. Its verifier does not yet bind every call
metadata field, and serialization tests do not prove durability after process
termination.

## Decision

Before live execution, WP04 must provide:

- an append-only durable store with atomic commit boundaries;
- write-before-advance semantics for every provider result;
- a hash-linked event and artifact chain covering request, context, provider,
  model, effective configuration, response, outcome, timings, and parentage;
- explicit visibility and access-control metadata;
- restart from the last committed operation without repeating a completed call;
- immutable export plus independent verification on a second process.

Raw credentials and secrets never enter evidence artifacts.

## Alternatives considered

- Treat JSON serialization as durable persistence. Rejected because it does not
  exercise a real crash or transactional boundary.
- Hash only message content. Rejected because provider/model tampering could
  remain undetected.

## Consequences

Storage is part of the experimental instrument. The pilot cannot begin merely
because in-memory tests pass.

## Evidence and acceptance

Acceptance requires kill/restart tests, metadata-tampering negative tests, an
independent bundle verifier, and an access-control review.

## Revisit trigger

Review when storage technology or the evidence schema changes.
