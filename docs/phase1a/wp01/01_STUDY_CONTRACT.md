# WP01.01 — Study contract

## Implemented contract

The machine-validatable contract is `StudyContractSchema` in
`src/phase1a/wp01/contracts/study.ts` and is constructed by
`createStudyContract()`.

| Contract area | Implemented declaration |
|---|---|
| Study identity | `agora-phase1a-reimagining-humans`, schema `wp01-study-contract-v1` |
| Design | composition × joint-report anticipation, four conditions A–D |
| Participants | P1, P2, P3; exactly three per run |
| Repetitions | three independent runs per condition; 12 planned runs |
| Agenda | private `T0`, six public rounds, private `T6`; report arms add draft, two reviews, revision, `TR` |
| Host | deterministic procedural host; no autonomous LLM moderator |
| Interaction | no tools, web, voting, external actions, mandatory breakouts, role personas or early stopping |
| Privacy | private outputs do not re-enter public context |
| Independent unit | run; participant, opportunity, message, report and review are nested units |
| Lifecycle | implementation-ready but scientific-freeze-pending |

## Condition matrix

| Condition | P1/P2/P3 logical families | Report |
|---|---|---|
| A | GEMMA / GEMMA / GEMMA | No |
| B | GEMMA / GEMMA / GEMMA | Yes |
| C | GEMMA / GEMINI / MODEL_X | No |
| D | GEMMA / GEMINI / MODEL_X | Yes |

`MODEL_X` is an unresolved logical reference. The contract does not select a
model, provider, endpoint, version, or credential.

## Planning counts

`expectedPlanningCounts()` derives, without calling a provider:

| Quantity | Count |
|---|---:|
| Runs | 12 |
| Public opportunities | 216 |
| Private elicitation opportunities | 90 |
| Report-production invocations | 24 |
| Expected model invocations before retries/replay | 330 |

These values are consistency targets for planning. They are not fabricated
events, messages, invocation results, or evidence of model behavior.

## Report-notice/t0 boundary

The contract stores `report_policy.notice_timing = UNRESOLVED`. The scheduler
can represent both approved candidates:

1. report notice before `T0`;
2. `T0`, then report notice before the first public contribution.

The synthetic campaign generator requires the candidate timing explicitly and
keeps `freeze_status = SCIENTIFIC_FREEZE_PENDING`. No sequence is silently
promoted to scientific approval.

## Scientific claim boundary

Three repetitions per condition are exploratory feasibility evidence, not a
powered causal study. Public agreement, position change, a missing report
proposition, silence, or a provider failure must not be interpreted as direct
evidence of an unobserved belief or intention.

## Sources

- Revised AGORA Phase 1A Technical-Scientific Blueprint, pilot design and
  measurement sections.
- *AGORA Workshop Technical Architecture and Experimental Protocol v0.9*,
  revised Phase 1A sections 2–4, 8, 10, 14–16.
- *AGORA Phase 1A Technical Implementation Meeting*, slides 2–12.
- WP01 Full Implementation Mandate, sections 3–8 and 11.
