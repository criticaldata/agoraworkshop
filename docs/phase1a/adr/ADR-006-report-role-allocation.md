# ADR-006: Report-role allocation across replications

Status: **ACCEPTED, SCIENTIFIC REVIEW REQUIRED**  
Date: 2026-10-22  
Engineering owner: Simon Heilles / provisional WP03 maintainer

## Article claim supported

Report effects are not confounded with one model or one participant always
writing the draft.

## Context

The mock runtime fixes agent 1 as writer/reviser and agents 2/3 as reviewers.
WP01 leaves report allocation unresolved. The study has exactly three
replications per condition and three participants, which permits a complete
cyclic counterbalance.

## Decision

For B and D, rotate report roles across the three replications:

| Replication | Writer/reviser | Reviewer 1 | Reviewer 2 |
|---|---|---|---|
| 1 | P1 | P2 | P3 |
| 2 | P2 | P3 | P1 |
| 3 | P3 | P1 | P2 |

The manifest records the mapping before execution. Both reviewers receive the
same first draft independently and never receive the other review. The writer
receives both reviews only at the revision stage.

The current fixed mapping remains valid only for explicitly labelled test
fixtures until this rotation is implemented and scientifically approved.

## Alternatives considered

- Fixed writer. Rejected because writer/model effects would be inseparable from
  report-workflow effects, especially in heterogeneous condition D.
- Random assignment. Rejected for the core pilot because three replications
  permit exact deterministic balance and easier reproducibility.

## Consequences

Each participant/model occupies every report role once per report condition.
Order effects remain visible and must be retained in analysis.

## Evidence and acceptance

Tests must prove the three mappings, reviewer isolation, identical draft input,
and the absence of report stages in A/C.

## Revisit trigger

Review if the participant count or replication count changes.
