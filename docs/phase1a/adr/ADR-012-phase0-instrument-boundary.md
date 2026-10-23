# ADR-012: Phase 0 instrument-validation boundary

Status: **ACCEPTED**  
Date: 2026-08-10  
Engineering decision owner: Simon Heilles / Phase 0

## Article claim supported

Phase 0 validates the execution instrument and its trace, without making claims
about agent social behavior or role fidelity.

## Context

The early Workshop discussions considered adding persona calibration before the
baseline run. That would have changed the prompts while the team was still
trying to validate routing, isolation, failure attribution, and reproducibility.
The group corrected this conflation on 10 August: identical prompts are the
control for the instrument baseline, while role-conditioned prompts belong to a
later experimental condition.

## Decision

Phase 0 keeps participant prompts and capabilities symmetric. It validates:

- routing and state-machine correctness;
- authorized context isolation and zero private-channel leakage;
- complete event, provider-call, retry, and failure records;
- retry/idempotency behavior without duplicate committed actions;
- reproducibility of experimental conditions and execution-trace structure.

Reproducibility does not mean identical stochastic model output. Role packs,
persona-fidelity checks, heterogeneous models, and behavioral conclusions begin
only after the Phase 0 instrument baseline is frozen.

## Alternatives considered

- Add role cards before completing Phase 0. Rejected because the role treatment
  would break the symmetric control and mix instrument validation with behavior.
- Define reproducibility as identical generated text. Rejected because model
  sampling may remain stochastic under the same registered conditions.

## Consequences

Phase 0 evidence may support claims about execution integrity. It cannot support
claims about persuasion, conformity, role adherence, or social dynamics.

## Evidence and acceptance

- `WA-OLD-189497`-`189502` on 2026-08-09 propose the instrument metrics and
  three validation gates.
- `WA-OLD-189520` adds context isolation, state-machine correctness, and
  retry/idempotency integrity, and defines trace-level reproducibility.
- `WA-OLD-189895` proposes persona calibration before the Workshop.
- `WA-OLD-189901`-`189905` correct that sequencing and retain identical prompts
  as the Phase 0 control.

Acceptance is the existing Phase 0 validation package and explicit separation
of engineering evidence from later behavioral results.

## Revisit trigger

Supersede only if the study contract deliberately redefines Phase 0 and records
how the original control remains reproducible.
