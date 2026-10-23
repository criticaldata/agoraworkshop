# ADR-003: Private baseline and report disclosure timing

Status: **ACCEPTED**  
Date: 2026-10-22  
Owner: Simon Heilles / study design

## Article claim supported

The initial private checkpoint measures the pre-treatment position, while the
subsequent change may include anticipation of the joint-report requirement.

## Context

Conditions B and D include a joint report. Announcing that requirement before
`t0` would change the baseline. A and C do not include a report condition.

## Decision

Collect and durably commit all three `t0` responses before any report-condition
disclosure or public discussion. Then:

- B and D receive one frozen report notice before public round 1;
- A and C receive no condition notice;
- a terminal `t0` failure blocks disclosure and all public calls;
- `t0` prompts and contexts contain no report metadata.

This ADR restates `DEC-09` and `EXP-14`; it does not create a second protocol.

## Alternatives considered

- Disclose before `t0`. Rejected because `t0` would no longer be a common
  pre-treatment baseline.
- Send A/C a no-report notice. Rejected because it introduces an unnecessary
  cue absent from the selected contrast.

## Consequences

The article must describe `t0` as pre-disclosure. `T6 - T0` may include report
anticipation in B/D; `TR - T6` isolates additional change after report work.

## Evidence and acceptance

Tests must prove event order, the absence of report text from all `t0` requests,
no disclosure in A/C, and no public call after terminal `t0` failure.

Discussion provenance:

- Community group message `WA-COM-209305` on 2026-10-09 establishes private responses
  before and after discussion and an additional post-report response in report
  conditions.
- Community group message `WA-COM-210450` on 2026-10-13 restates the 2x2 report
  conditions and private/public context separation.
- The two group histories do not settle whether the B/D report requirement is
  disclosed before or after `t0`. That timing was resolved later through Mateo's
  direct methodological question and recorded as `DEC-09` and `EXP-14`; it must
  not be attributed to the earlier WhatsApp summaries.

## Revisit trigger

Only a recorded protocol amendment approved by the study owner may supersede
this timing.
