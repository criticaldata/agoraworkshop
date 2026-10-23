# ADR-007: Context-locked replay baseline and cue provenance

Status: **ACCEPTED, SCIENTIFIC REVIEW REQUIRED**  
Date: 2026-10-22  
Engineering owner: Simon Heilles / WP05 engineering

## Article claim supported

Replay cells differ only in the registered identity and endorsement cues, while
the argument and receiving agent's original context remain fixed.

## Context

The current WP05 renderer creates a normalized speaker/endorsement wrapper for
all cells. The team must decide whether the experimental baseline is that
representation or the request originally delivered to the model.

## Decision

The canonical parent baseline is the exact serialized provider request that the
receiving agent saw, including message order, roles, prompt, provider/model, and
effective decoding configuration.

Each replay cell is a derived request with:

- an immutable parent-request hash;
- immutable argument bytes and message order;
- an explicit machine-readable list of permitted cue spans;
- only identity visibility and endorsement presence varied;
- observed and synthetic endorsements registered as different provenance
  strata and never pooled silently;
- a human meaning-preservation approval before the first replay call;
- independent trials with a registered count, seed, order, and retry policy.

Identity embedded inside argument text is flagged for review and never silently
rewritten.

## Alternatives considered

- Use the normalized wrapper as the baseline. Rejected because it changes the
  parent representation before the experimental manipulation.
- Reconstruct context from public transcripts. Rejected because the receiving
  agent may have seen a different assembled request.

## Consequences

WP04 must preserve exact request bytes. WP05 must report every derived byte
difference and cannot run if parent evidence is incomplete.

## Evidence and acceptance

A byte-level diff must show that every change lies inside an approved cue span.
Damaged parent evidence, changed argument bytes, or missing human approval must
produce zero replay provider calls.

Discussion provenance:

- Community group message `209305` on 2026-10-09 adds identity and endorsement
  replay to the pilot as a way to isolate social cues.
- Community group messages `213108`, `213113`, and `213115` on 2026-10-20 retain
  the existing logging/context/export system, require an exact parent attempt,
  distinguish observed from synthetic endorsements, add human meaning review,
  and define the first four-cell mock milestone with independent trials.
- Community group message `213273` on 2026-10-20 requires a WP01-to-WP05
  scientific interface and separate provenance for recorded and injected cues.
- Community group message `213417` on 2026-10-21 records the incorporation of
  those clarifications into the repository baseline.

## Revisit trigger

Review if a provider API prevents exact request serialization or replay.
