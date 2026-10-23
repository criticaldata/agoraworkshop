# ADR-008: Behavioral outcomes and technical failures

Status: **ACCEPTED**  
Date: 2026-10-22  
Engineering owner: Simon Heilles / WP02-WP05

## Article claim supported

The analysis does not interpret missing delivery or infrastructure failure as
agreement, refusal, abstention, or silence by the model.

## Context

The current crosswalk collapses an abstention into a delivered refusal in one
WP05 mapping. Those outcomes have different behavioral meanings. Timeouts and
provider failures are not delivered messages at all.

## Decision

Use distinct terminal outcomes throughout runtime, evidence, replay, export,
and analysis:

- `delivered_response`;
- `delivered_abstention`;
- `delivered_refusal`;
- `timeout`;
- `provider_error`;
- `cancelled`;
- `not_attempted`.

Only delivered outcomes create message and delivery records. Technical failures
retain attempt/error records but never fabricate response text. Retries link to
the original opportunity and do not erase earlier attempts.

## Alternatives considered

- Merge refusal and abstention. Rejected because it destroys a behavioral
  distinction required by the article.
- Represent timeout as an empty response. Rejected because it invents behavior.

## Consequences

WP06 can decide later how to aggregate outcomes, but raw categories remain
available. Historical data must be migrated or explicitly labelled ambiguous.

## Evidence and acceptance

Fault-injection tests must prove the record set for every outcome and prove that
no technical failure creates a message or delivery.

Discussion provenance:

- Historical Workshop group message `WA-OLD-189520` on 2026-08-09 makes retry and
  idempotency integrity part of the Phase 0 instrument gate.
- Community group message `WA-COM-213113` on 2026-10-20 states that a timeout has a
  complete failure record without requiring a message or delivery that never
  existed, and requests an explicit retryable-failure set, attempt limit, and
  delay.
- Community group message `WA-COM-213417` on 2026-10-21 records that this outcome-aware
  trace rule was incorporated into the repository baseline.

## Revisit trigger

Extend, rather than collapse, the taxonomy when a provider adds a new outcome.
