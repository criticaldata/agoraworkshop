# ADR-009: Validation and release evidence

Status: **ACCEPTED, IMPLEMENTATION PENDING**  
Date: 2026-10-22  
Engineering owner: Simon Heilles

## Article claim supported

Every reported engineering milestone is backed by an executed validation path
and inspectable evidence, rather than by the presence of tests or a successful
module import.

## Context

GitHub Actions publishes structured Vitest results for the acceptance workbook.
However, `npm run validate` currently imports a module without invoking the
validation campaign. A zero exit code therefore does not prove validation ran.

## Decision

A releasable baseline requires:

- a validation CLI that executes `runValidationPackage()` with explicit inputs;
- non-zero exit on failed gates or missing required evidence;
- structured test and validation artifacts published by CI even on failure;
- source commit, manifest, adapter, and evidence hashes in the release record;
- a human review verdict distinct from automated test status;
- the acceptance workbook reading the latest default-branch artifacts rather
  than displaying hard-coded totals.

Mock, engineering dry-run, and scientific-pilot evidence remain separate release
classes and must never be presented as interchangeable.

## Alternatives considered

- Count `npm run validate` exit zero as proof. Rejected because the campaign is
  not currently invoked.
- Put current test totals in documentation or UI copy. Rejected because those
  numbers become stale immediately.

## Consequences

The dashboard can update automatically after CI while preserving human business
review. The article can cite a frozen release record rather than a mutable UI.

## Evidence and acceptance

Acceptance requires a deliberately failing validation fixture that makes the
CLI and CI fail, plus a successful artifact consumed by the dashboard.

Discussion provenance:

- Historical Workshop group messages `189497`-`189520` on 2026-08-09 define
  Phase 0 completion through instrument gates rather than behavioral results.
- Community group messages `213091`-`213116` on 2026-10-20 distinguish a draft
  specification from confirmed decisions and add explicit human review before
  experimental cue edits are approved.
- Community group message `213417` on 2026-10-21 records which review
  clarifications entered the implemented baseline.

## Revisit trigger

Review whenever the release pipeline or validation entrypoint changes.
