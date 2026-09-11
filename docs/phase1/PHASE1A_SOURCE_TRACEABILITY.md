# Phase 1A scientific source-to-implementation traceability

**Revision:** `traceability-v1-calibration`  
**Date:** 2026-09-11  
**Repository baseline:** PR #9 head `4f20c23660d9e508c4d6724aedd7f1cb7a2c52ec`  
**Purpose:** bind each major scientific decision to a source passage, an executable
contract, a falsifying test and an evidence status. This revision records the
pre-human-review implementation boundary; it does not fabricate live or human
evidence.

## Governing sources

| ID | Source | Relevant locations |
|---|---|---|
| FND | `AGORA_Phase1_Scientific_Foundation_and_Experimental_Framework.pdf` | pp. 5-16: foundation, stages, roles, metric families, gates and calibration; pp. 17-22: closure, claim boundaries, roadmap and metric reference |
| RUB | `AGORA_Phase1A_Scientific_Basis_for_Behavioral_Rubric.pdf` | pp. 1-4: DQI/CACS/DCS provenance, AGORA adaptation, evidence contract, independent review, alpha and adjudication |
| SAP | `AGORA_Phase1A_Statistical_Analysis_Plan_v0.1_revised.pdf` | pp. 1-10: estimand, endpoints, unit, missingness, reliability, bootstrap, Holm, precision and reporting |
| AUD | `docs/phase1/AGORA_PHASE1_PR9_INDEPENDENT_REVIEW.md` | Findings C-01, H-01/H-02/H-03, M-01-M-08, L-01/L-02 and Steps 3-35 |

## Traceability matrix

Status is deliberately evidence-based: `IMPLEMENTED` means code exists,
`TECHNICALLY_VERIFIED` means the relevant test/oracle passed, and
`LIVE_OR_HUMAN_PENDING` means software cannot create the required empirical
evidence. `TECHNICALLY_VERIFIED` is an engineering status, not a claim that live
provider variance, human reliability or scientific validity has already been
observed.

| ID | Source -> scientific requirement | Implemented contract | Falsifying test/evidence | Status after current-branch verification |
|---|---|---|---|---|
| SCI-01 | FND pp. 3, 9; SAP pp. 1-2 -> one controlled role treatment with all non-treatment fields fixed | `PlanInput`, `Phase1ConfigSchema`, `compareConditions`, fixed-settings hash | `tests/phase1Campaign.test.ts`, `tests/phase1Canonical.test.ts` | TECHNICALLY_VERIFIED; calibration role pack remains explicitly versioned for human review |
| SCI-02 | FND pp. 7, 10; SAP pp. 2-4 -> five participants; run/predeclared paired block is the unit; messages are nested | `ExperimentConfig.participants`, `Plan.comparisons`, paired block IDs and run-level estimators | `tests/phase1Campaign.test.ts`, `tests/phase1Statistics.test.ts` | TECHNICALLY_VERIFIED |
| SCI-03 | FND pp. 7-8, 15 -> canonical S1-S8 boundaries, S6 before S7, S8 separate from participant behavior | `CanonicalProtocolSchema`, stage rows, `auditCollective`, deterministic S8 | `tests/phase1Canonical.test.ts` and canonical mock fixture | TECHNICALLY_VERIFIED; live campaign still pending |
| SCI-04 | FND p. 9 -> moderator is apparatus, scripted/tightly constrained and identical across paired cases | `scriptedModerator`, `moderator.mode=scripted`, zero moderator model calls | `tests/phase1Canonical.test.ts`, M29 evidence | TECHNICALLY_VERIFIED; provider-live execution still pending |
| SCI-05 | FND p. 9 -> five functional constructs: proposer, critic, evidence, integrator, consequences; no randomization claim without randomization | `FUNCTIONAL_ROLES`, role assignment/hash and control/treatment prompt separation | `tests/phase1Campaign.test.ts`, prompt provenance tests, `tests/phase1Instruments.test.ts` | TECHNICALLY_VERIFIED; assignment is deterministic/cyclic, not randomized |
| SCI-06 | FND pp. 8, 11-12; SAP pp. 4-6 -> S1/S6 expressed position, choice, confidence, rationale, ranking and explicit missingness | `PositionAnswer`, `positions.ts`, frozen questionnaire manifest | `tests/phase1Behavioral.test.ts`, `tests/phase1Instruments.test.ts` | TECHNICALLY_VERIFIED |
| SCI-07 | RUB pp. 1-4 -> DQI/CACS/DCS are construct provenance; AGORA rubric is a new adapted instrument, not externally validated by those sources | `FrozenInstrumentManifest`, AGORA rubric criteria with evidence IDs, quotes, stage windows and not-assessable | `tests/phase1Instruments.test.ts`, review evidence tests | TECHNICALLY_VERIFIED; construct validity remains an empirical question |
| SCI-08 | RUB pp. 3-4; SAP pp. 8, 13 -> two independent reviewers, same subset, hidden labels, alpha, disagreement inspection and append-only adjudication | authenticated assignments, blinded projection, independent submission, adjudication record/UI | `tests/phase1ReviewWorkspace.test.ts`, `tests/securityPhase1.test.ts` | TECHNICALLY_VERIFIED as workflow; human reliability still pending |
| SCI-09 | FND pp. 10-13, Appendix A -> seven metric families and metric-level numerator/denominator/exclusions/evidence/missingness | versioned outcome/metric registry and dataset reliability contract | `tests/phase1MetricsRegistry.test.ts`, `tests/phase1Science.test.ts` | TECHNICALLY_VERIFIED |
| SCI-10 | FND pp. 11-12; SAP pp. 4-5, 10 -> RF primary; ICR key secondary; Gini and position change secondary; other outcomes exploratory | frozen outcome registry and endpoint-family schema | `tests/phase1Statistics.test.ts`, `tests/phase1Reliability.test.ts`, metric registry test | TECHNICALLY_VERIFIED |
| SCI-11 | FND p. 11; SAP p. 4 -> weighted RF score, participant then run-level aggregation; missing review is not zero | `behavioralMeasures`, criterion-weighted RF and complete/assessed-only values | `tests/phase1Science.test.ts`, rubric scoring tests | TECHNICALLY_VERIFIED synthetically; human evidence pending |
| SCI-12 | FND pp. 11-13; SAP p. 5 -> ICR requires substantive dependence on earlier exposed peer content; chronology/parallel monologue is insufficient | exposure-aware interaction labels with source/target evidence and ICR denominator | `tests/phase1Science.test.ts`, semantic exposure checks | TECHNICALLY_VERIFIED as measurement logic; human evidence pending |
| SCI-13 | FND pp. 5-6; SAP pp. 6-7 -> behavioral zero, infrastructure missingness, measurement missingness and annotation missingness are distinct | shared terminal predicate, typed probe/ballot status, null endpoint policy | `tests/phase1TerminalOutcome.test.ts`, missingness/gate tests | TECHNICALLY_VERIFIED |
| SCI-14 | SAP pp. 2-4 -> no message-level pseudoreplication; paired block is the comparison unit | `pairedCalibrationEstimate`, run/block denominators and no message resampling | `tests/phase1Statistics.test.ts` | TECHNICALLY_VERIFIED for existing engine |
| SCI-15 | SAP pp. 9, 11 -> two-sided 95% paired-block bootstrap; default 10,000; block resampling only | frozen SAP bootstrap `resamples=10000`, paired block PRNG and interval contract | `tests/phase1Statistics.test.ts`, `tests/phase1Reliability.test.ts` | TECHNICALLY_VERIFIED |
| SCI-16 | SAP p. 10 -> alpha 0.05 for one primary; Holm for ICR/Gini/position-change secondary family | endpoint family registry plus Holm correction | `tests/phase1Statistics.test.ts`, `tests/phase1Reliability.test.ts` | TECHNICALLY_VERIFIED |
| SCI-17 | FND pp. 15-16; SAP pp. 1, 11 -> live calibration measures variance, computability, burden, RF/ICR distribution, change and contamination | frozen calibration manifest, provider readiness and live campaign package | `tests/phase1Calibration.test.ts`, live bundle if authorized | LIVE_OR_HUMAN_PENDING; live execution is required to observe calibration variance, burden and contamination |
| SCI-18 | SAP pp. 1, 11, 17 -> N/target precision is calibration-dependent and must be frozen after observed paired-RF variance | calibration report with `sigma_delta`, target half-width, planning equation and simulation check | precision calibration test and generated report | LIVE_OR_HUMAN_PENDING; observed variance is required before freezing N |
| SCI-19 | FND pp. 14, 17; SAP p. 13 -> P1-A/P1-B/P1-C machine gates; P1-D only requires frozen evidence and reliability, never significance | `phase1GateStatus` with `PENDING_HUMAN_VALIDATION` and null-effect rule | `tests/phase1Gates.test.ts` | TECHNICALLY_VERIFIED; P1-D remains human-pending by design |
| SCI-20 | FND pp. 8, 12, 17; SAP pp. 5, 7 -> sealed S7 input, deterministic S8, structural minority separate from semantic minority | typed S7 ballots, deterministic aggregation, schema-bound S8 and human semantic outcome | `tests/phase1BallotContract.test.ts`, canonical/S8 tests | TECHNICALLY_VERIFIED |
| SCI-21 | FND pp. 5, 20-22; SAP pp. 1, 15 -> no claims about consciousness, personality, persuasion, causality or generalization beyond the frozen measure | claim-boundary text in registry, UI, exports, gate report and closure report | `tests/phase1Documentation.test.ts`, export boundary assertions | TECHNICALLY_VERIFIED |
| SCI-22 | AUD C-01, M-05 -> sensitive Phase 1 GET routes and reviewer identity must be server-protected and role-aware | principal auth, protected path policy and blinded server projections | `tests/securityPhase1.test.ts`, `tests/phase1Ui.test.ts` | TECHNICALLY_VERIFIED |
| SCI-23 | AUD H-01/H-02/M-02/M-03 -> valid abstention/no-op completes behavior; incomplete S7 is not canonical scientific completion; ballot failures typed | shared predicate, typed ballot status, runtime/scientific completion separation | `tests/phase1TerminalOutcome.test.ts`, ballot/topology/gate tests | TECHNICALLY_VERIFIED |
| SCI-24 | AUD H-03/M-08 -> relation subtypes remain exploratory; reliability is computed/reported but not primary-gating | outcome registry family and relation reliability diagnostic | `tests/phase1Reliability.test.ts`, dataset report | TECHNICALLY_VERIFIED; exploratory/human evidence still pending |
| SCI-25 | AUD M-04/M-06 -> content-addressed locked snapshot and full opportunity-to-export trace | canonical snapshot bytes/hash, lock event, trace validator and manifest links | snapshot tamper and trace-gap tests | TECHNICALLY_VERIFIED |

## Frozen reviewer acceptance contract

This is the decision that closes the calibration-dependent reviewer threshold before
human coding:

- Two authenticated reviewers independently code the same frozen calibration
  package; a reviewer cannot see another reviewer's labels before submission.
- All RF and ICR eligible units are double-coded. A reliability stratum with fewer
  than 30 pairable units is `INSUFFICIENT_COVERAGE`, not a passing result.
- Krippendorff's alpha is calculated per criterion/category before adjudication.
  RF and ICR require alpha `>= 0.80`. Alpha `[0.667, 0.80)` requires codebook
  inspection and recalibration; alpha `< 0.667` fails the instrument. Relation
  subtype alpha is reported under the same bands but is exploratory and does not
  gate RF or ICR.
- Any disagreement on an RF/ICR unit is adjudicated after independent submission;
  original labels, rationales and pre-adjudication alpha remain immutable.
- Confirmatory coverage is 100% for RF/ICR eligible units, with no unresolved
  conflict. Reliability is necessary but not sufficient for construct validity.

## Current status boundary

At the initial PR #9 baseline, rows marked `IN_PROGRESS` or `LIVE_OR_HUMAN_PENDING`
were not claims of completion. The current branch may mark code and tests as
technically verified, but a live provider or human labels cannot be simulated by a
mock fixture. The scientific state therefore remains `PENDING_HUMAN_VALIDATION`.
