# ADR-006: Report-role allocation across replications

Status: **ACCEPTED, SCIENTIFIC REVIEW REQUIRED**  
Date: 2026-10-22  
Engineering owner: Simon Heilles / provisional WP03 maintainer

## Article claim supported

Report effects are not confounded with one model or one participant always
writing the draft.

## Context

The original report workflow designated one drafter and two independent
reviewers but did not freeze role allocation across replications. The study has
exactly three replications per condition and three participants, which permits a
complete cyclic counterbalance. PR #20 implemented that counterbalance as the
engineering baseline; WP01 scientific decision D08 remains proposed.

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

The cyclic mapping is implemented for mock and engineering runs. It remains a
scientific-review item until WP01 freezes the allocation rule.

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

Discussion provenance and implementation evidence:

- Community group message `209280` on 2026-10-09 records the decision that both
  reviewers receive the same original draft independently and never see each
  other's feedback before revision.
- Community group message `209305` on 2026-10-09 records speaking-order rotation
  as a control against permanent first-speaker bias.
- PR #20 records the report-role allocation in evidence and proves the three
  mappings, isolated reviews, revision ordering, and absence of report work in
  A/C.

## Revisit trigger

Review if the participant count or replication count changes.
