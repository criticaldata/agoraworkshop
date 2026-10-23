# ADR-004: Run admission and provider-request parity

Status: **ACCEPTED, IMPLEMENTATION PENDING**  
Date: 2026-10-22  
Engineering owner: Simon Heilles / WP02

## Article claim supported

Observed differences arise from registered experimental conditions rather than
unrecorded provider settings or runtime substitutions.

## Context

The evidence ledger records participant configuration, but the current initial
provider interface does not pass every decoding parameter to the provider. The
runtime also needs an explicit admission boundary for models, budgets, and IDs.

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

Contract tests must compare the recorded request with the provider payload and
must fail on an omitted, modified, defaulted, or unsupported parameter.

## Revisit trigger

Review when a provider introduces a materially different request model.
