# ADR-004: Run admission and provider-request parity

Status: **ACCEPTED, ENGINEERING BASELINE IMPLEMENTED; LIVE LIMITS PENDING**
Date: 2026-10-22  
Engineering owner: Simon Heilles / WP02

## Article claim supported

Observed differences arise from registered experimental conditions rather than
unrecorded provider settings or runtime substitutions.

## Context

The provider interface now passes and records the effective configuration. The
versioned adapter rejects unsupported parameters and non-frozen scientific runs;
the runtime rejects unknown participants and provider/model identity drift.

## Decision

A live run is admitted only when:

- the WP01 adapter has validated a frozen manifest;
- every provider/model revision and endpoint is explicit;
- every supported decoding parameter is sent and recorded exactly;
- unsupported parameters fail before the first call;
- unknown participant or operation IDs are rejected;
- token, attempt, cost, duration, and concurrency ceilings are enforced;
- request artifacts record the effective provider payload after adaptation.

The mock provider may use declared fixture values, but evidence must label the
run as a fixture and it cannot satisfy a live admission gate.

## Alternatives considered

- Record configuration without passing it. Rejected because provenance would
  describe an experiment that was not executed.
- Allow provider defaults. Rejected because defaults can change over time.

## Consequences

Provider adapters become small, independently tested boundary components. A
provider that cannot honor the frozen configuration cannot join that campaign.

## Evidence and acceptance

Contract tests compare the recorded request with the provider payload and fail on
modified or unsupported parameters. Exact cost, duration and concurrency ceilings
remain part of unresolved D09 and must be added before live admission.

Discussion provenance:

- Community group message `WA-COM-186071` on 2026-07-24 establishes provider-neutral
  adapters and gradual introduction of heterogeneous models.
- Community group message `WA-COM-210450` on 2026-10-13 selects Gemma, Gemini, and an
  unresolved `Model X`, prioritizes an open model runnable on the NVIDIA
  cluster, and leaves turn limits, timeouts, retries, and budgets for a technical
  follow-up.
- Because no later message in the two-group corpus freezes those exact values,
  they remain run-admission blockers rather than implicit provider defaults.

## Revisit trigger

Review when a provider introduces a materially different request model.
