# AGORA Phase 1A — Pre-Human-Review Closure Report

**Report date:** 2026-09-11  
**Repository:** `criticaldata/agoraworkshop`  
**Branch:** `codex/phase1a-pre-human-review-closure`  
**Base:** PR #9 head `4f20c23660d9e508c4d6724aedd7f1cb7a2c52ec`  
**Implementation head at report creation:** `bd08fa98738927bb7d07aea0f16d5d65a1ba8007`  
**Delivery model:** stacked pull request on Simon's open PR #9; this report does not authorize or perform a merge.

## Executive disposition

The branch closes the Phase 1A engineering and pre-human-review scientific
contract. The role treatment, canonical workshop stages, outcome definitions,
missingness policy, statistical analysis plan, calibration instruments,
reviewer workflow, adjudication workflow, protected projections, dataset
locking and Phase 1B transition predicate are now explicit, versioned and
covered by executable tests.

This is not a claim that Phase 1A is scientifically closed. The exact current
boundary is:

| Area | Current state |
|---|---|
| Software and protocol contract | `CLOSED_FOR_HUMAN_VALIDATION` |
| Machine-verifiable P1-A/P1-B/P1-C contracts | Technically verified by tests |
| External live-provider evidence | `BLOCKED_EXTERNAL_LIVE_PROVIDER` until the authorized NVIDIA vLLM endpoint and key are available |
| Human calibration/reliability | `PENDING_HUMAN_VALIDATION` |
| Phase 1B | `INACTIVE`; no eligibility until P1-D and Phase 1A closure are complete |

The branch therefore ends at the correct handoff: there is no remaining
scientific design decision required before launch, but live execution and human
review must produce evidence that software cannot honestly fabricate.

## Scope and non-claims

Phase 1A evaluates whether a frozen role treatment can be measured under a
controlled workshop design. It does not establish consciousness, personality,
general intelligence, persuasion, causality, human equivalence or generalization
outside the frozen instrument and protocol. The five roles are functional
constructs, not demographic or psychological identities:

1. proposer;
2. critic;
3. evidence;
4. integrator;
5. consequences.

The role assignment is deterministic/cyclic and explicitly is not described as
randomized. The treatment changes the role pack only; provider, model,
deployment, parameters, tools, moderator, topic, timing, budgets and workshop
structure remain frozen across paired conditions.

## Governing sources and traceability

The implementation was checked against the following sources before closure:

| Source | Role in this closure |
|---|---|
| `AGORA_Phase1_Scientific_Foundation_and_Experimental_Framework.pdf` | Phase structure, canonical S1–S8 sequence, roles, metrics, gates and claim boundaries |
| `AGORA_Phase1A_Scientific_Basis_for_Behavioral_Rubric.pdf` | DQI/CACS/DCS construct provenance, AGORA adaptation, independent review, alpha and adjudication |
| `AGORA_Phase1A_Statistical_Analysis_Plan_v0.1_revised.pdf` | Estimand, paired-block unit, endpoints, missingness, bootstrap, multiplicity, precision and reporting |
| `docs/phase1/AGORA_PHASE1_PR9_INDEPENDENT_REVIEW.md` | Independent review findings C-01, H-01–H-03, M-01–M-08 and L-01–L-02 |

The complete source-to-implementation matrix is in
[`PHASE1A_SOURCE_TRACEABILITY.md`](./PHASE1A_SOURCE_TRACEABILITY.md). Each
scientific decision is linked to an implementation contract and a falsifying
test. `TECHNICALLY_VERIFIED` in that matrix means that the executable contract
passed; it does not mean that live provider variance or human reliability has
already been observed.

## What was implemented

### 1. Scientific contract and fixed treatment

- Frozen protocol revision `protocol-v1` with canonical S1–S8 ordering.
- S6 occurs before S7; S7 is sealed before collective aggregation; S8 is a
  deterministic, schema-bound operation with no model or moderator call.
- Five functional roles and a versioned role registry.
- Expressed-position questionnaire for S1 and S6 with exact wording/options,
  choice, confidence, rationale, optional ranking/primary concern, and explicit
  invalid, missing and not-exercised statuses.
- One role treatment with all non-treatment settings held constant.
- Breakout topology validates two disjoint groups of sizes 2 and 3, excluding
  the moderator.

### 2. Measurement instruments

- AGORA-specific behavioral rubric adapted from DQI/CACS/DCS construct
  provenance; the source instruments are not presented as having validated the
  AGORA rubric.
- Seven metric families with version, numerator, denominator, exclusions,
  evidence requirements and missingness policy.
- Primary endpoint: Role Fidelity (RF).
- Key secondary endpoint: Interaction Contingency/Responsiveness (ICR).
- Secondary endpoints: expressed-position change and Gini/distributional
  measures.
- Other measures remain descriptive or exploratory.
- Human labels require evidence IDs, stage windows and an explicit
  not-assessable path.

### 3. Statistical analysis plan

- Comparison unit: predeclared paired block; messages are nested observations,
  not independent replicates.
- Estimand: mean paired treatment-control difference at the paired-block level.
- Two-sided 95% paired-block bootstrap, default 10,000 resamples, fixed seed
  `20260911`, percentile interval and centered-bootstrap p-value.
- Holm correction across the secondary endpoint family; alpha `0.05` for the
  primary endpoint.
- No message-level resampling and no conversion of missing measurements to
  zero.
- Final sample size and precision target remain calibration-dependent and are
  intentionally null until observed paired-RF variance is available.

### 4. Missingness and terminal semantics

The implementation distinguishes:

- behavioral zero, including valid abstention/no-op;
- infrastructure missingness, such as provider failure or timeout;
- measurement missingness, when an outcome is not assessable;
- annotation missingness, when required human coding is absent.

An incomplete S7 ballot is not silently converted into a valid behavioral
observation. Ballots carry typed terminal statuses including valid,
explicit-abstention, invalid, provider-failure, timeout, deadline, budget,
cancellation and unknown-incomplete.

### 5. Review, reliability and adjudication workflow

- Human validation package creation is content-addressed and tied to a locked
  dataset snapshot.
- At least two independent authenticated reviewers receive the same calibration
  subset.
- Reviewer projections hide condition, target role, role prompt, other labels,
  ballots, collective output and aggregate effects.
- Labels are append-only and cannot be edited after submission.
- Krippendorff's alpha is computed per criterion/category. RF and ICR require
  alpha `>= 0.80` and at least 30 pairable units; lower bands trigger inspection
  or failure rather than silent acceptance.
- Disagreements are adjudicated only after independent submission. Adjudication
  stores rationale and source submission IDs without mutating the original
  labels.
- Reliability is necessary for the gate but is not treated as construct
  validity.

### 6. Dataset locking and provenance

- Canonical dataset bytes and hash are generated before confirmatory analysis.
- Lock records include the snapshot hash and archive handoff state.
- An archive URI alone is not treated as an immutable archive confirmation;
  explicit confirmation is required.
- Export bundles include dataset snapshots, archive handoffs, instrument
  manifests/hashes and human-validation package metadata.

### 7. Security and review-surface controls

- Phase 1 routes require named authenticated principals and role-aware policy.
- Reviewer assignment and adjudication operations are separated from ordinary
  operator access.
- Annotation and artifact review submissions bind authors to the authenticated
  server principal, rather than trusting caller-provided identity.
- Sensitive reviewer pages use protected server projections.

## Frozen campaign manifest

The calibration manifest currently freezes the following conditions:

| Field | Value |
|---|---|
| Provider adapter | `nvidia_vllm` |
| Model | `qwen3-32b` |
| Deployment | not specified in the manifest |
| Tools | disabled |
| Moderator | scripted |
| Participants | 5 |
| Breakouts | 2 + 3 |
| Topic | “How might humans evolve to coexist better with agents and the living world?” |
| Max output | 512 |
| Temperature | 0 |
| Top-p / top-k | null / null |
| Seed | `20260911` |
| Thinking | disabled/omitted |
| Effort | low |
| Config hash | `sha256:411bd3386c10a63d024d0a4cc23399775d1d3820fdec054cab6073cc9a51a9ab` |
| Instrument manifest hash | `sha256:8080f1498c87c67baa5ae642b10eda38736ead878bcacbb95b94a6a297867727` |

Instrument hashes:

| Instrument | SHA-256 |
|---|---|
| Role registry | `sha256:0ff1d4a6506fa5df130a403f9e8a8ddc730d5d5f50b2c9220209df111904df55` |
| Expressed-position questionnaire | `sha256:c8ea97b4f1cabc2cdd12674d6c52292bffb3ab946175a5bbb28163f5304b33f7` |
| Behavioral rubric | `sha256:0037e244e5837b028c8861d612a97a6fc9aa4a06675b26ed65e648cfcdc06115` |
| Outcome metric registry | `sha256:746099ebef4e405a830d329918b98c18d93dcdb2b1e7de0318854ba5bc4a461d` |
| Statistical analysis plan | `sha256:424a54778120297115c40353600ff82187d1806572c21d50051510a5a47cbadd` |

## Gate status at handoff

| Gate | Status | Interpretation |
|---|---|---|
| P1-A | Technically verified | Canonical protocol, runtime integrity and deterministic S8 contracts pass executable checks |
| P1-B | Technically verified as a contract | Behavioral observability, typed outcomes and coverage rules are implemented; empirical labels remain pending |
| P1-C | Technically verified as a contract | Paired comparability, role/topology and AB–BA balance rules are implemented |
| P1-D | `PENDING_HUMAN_VALIDATION` | Requires live/locked evidence, independent review, reliability and adjudication; no significance result is required |
| Phase 1A | `CLOSED_FOR_HUMAN_VALIDATION` | No further scientific design blocker remains before launching the prescribed package |
| Phase 1B | `INACTIVE` | Eligibility requires P1-A/B/C PASS, P1-D PASS and explicit Phase 1A closure |

The gate implementation deliberately does not allow a mock to satisfy live
calibration or scientific validation. The machine status is a handoff state,
not a fabricated scientific result.

## Current provider state and evidence boundary

The provider preflight was run with:

```text
npx tsx src/cli.ts phase1 calibration-ready --config configs/agora_phase1a_calibration.yaml
```

Current result:

```text
state: BLOCKED_EXTERNAL_LIVE_PROVIDER
provider: nvidia_vllm
model: qwen3-32b
config_hash: sha256:411bd3386c10a63d024d0a4cc23399775d1d3820fdec054cab6073cc9a51a9ab
```

No `NVIDIA_VLLM_BASE_URL` or `NVIDIA_VLLM_API_KEY` was present in the execution
environment. Consequently this report records no live run IDs, live response
counts, calibration variance, latency, throughput, burden, contamination,
human reliability or final sample-size estimate. The deterministic mocks and
fixtures verify contracts only; they are not scientific observations.

The exact launch procedure is:

1. Provide the authorized NVIDIA vLLM endpoint and credential through the
   environment, never through Git or a configuration file committed to the
   repository.
2. Run provider preflight and retain its receipt.
3. Run the frozen baseline.
4. Run the identical paired rerun with the same configuration hash.
5. Run a separate fault campaign with controlled failure injection.
6. Export and verify all packages, traces, hashes and gates.
7. Lock the calibration dataset and create the content-addressed human package.
8. Have two independent reviewers code the common subset.
9. Compute reliability, inspect disagreements, adjudicate append-only and
   recompute P1-D.
10. Freeze precision and sample size only after calibration variance is observed.

If the endpoint is unavailable, the correct state remains exactly
`BLOCKED_EXTERNAL_LIVE_PROVIDER`; the launch package can be prepared, but the
campaign must not be represented as executed.

## Test and verification evidence

Final local verification on this branch:

| Check | Result |
|---|---|
| `npm ci` | PASS; 141 packages installed; 0 install vulnerabilities |
| `npm test` | PASS; 60 test files, 511 tests |
| `npm run build` | PASS |
| `npm audit --audit-level=high` | PASS; 0 vulnerabilities |
| `npm audit --omit=dev` | PASS; 0 vulnerabilities |
| `git diff --check` | PASS |
| Phase 1 ballot contract tests | PASS; typed S7 terminal statuses, trace receipt and S1–S8 ordering |
| Phase 1 review UI/workspace tests | PASS; independent reviewer and adjudicator workflow |
| Restart/backup/recovery tests | PASS at the implemented contract level |
| Provider provenance tests | PASS; `nvidia_vllm`/`qwen3-32b` boundary enforced |

The tests are split between positive contracts and falsification paths. The
negative tests intentionally damage traces, hashes, topology, permissions,
missing deliveries, reviewer identity, package membership and stage ordering and
expect failure. This makes the tests evidence about the acceptance logic rather
than only smoke checks.

## Independent review disposition

The independent PR #9 review is included in the branch as
`docs/phase1/AGORA_PHASE1_PR9_INDEPENDENT_REVIEW.md`. Its findings are handled
as follows:

| Finding group | Disposition |
|---|---|
| C-01 security boundary | Remediated with named principals, protected projections and server-bound authorship; regression tests pass |
| H-01/H-02/H-03 terminal/completion semantics | Remediated with shared terminal predicates and typed ballot statuses; regression tests pass |
| M-01–M-08 scientific and data-integrity findings | Closed at the contract/implementation level with frozen instruments, traceability, locking, review workflow and explicit evidence boundaries |
| L-01/L-02 documentation and claim boundaries | Closed in the canonical protocol, SAP, source matrix and this report |

A historical security-diff scan was run against an earlier working-tree
snapshot and reported four low-severity findings. The affected reviewer route,
caller-supplied author fields and assignment permissions were subsequently
remediated; the current tests cover those paths. The historical scan result is
not presented as a scan of this exact final commit.

## Required artifacts delivered by this branch

The branch contains the contract and handoff artifacts required for the next
stage:

- scientific contract;
- canonical protocol;
- role registry;
- expressed-position questionnaire;
- behavioral rubric;
- outcome and metric registry;
- statistical analysis plan;
- codebook;
- reliability/adjudication protocol;
- calibration manifest and report;
- locked snapshot manifest;
- human-validation package manifest;
- Phase 1 gate report;
- Phase 1B transition contract;
- source-to-implementation traceability matrix;
- this closure report.

The application can create the human-validation package only after a real
dataset snapshot is locked. Test fixtures demonstrate the workflow but are not
substituted for the eventual live package.

## Final conclusion

Phase 1A is ready to launch the prescribed live calibration and human-review
workflow. The engineering and scientific contract is no longer an open design
problem. The remaining evidence is external by nature: an authorized live
provider run and independent human coding/adjudication. Until those occur, the
scientifically honest status is `PENDING_HUMAN_VALIDATION`, with provider state
`BLOCKED_EXTERNAL_LIVE_PROVIDER` when the endpoint is unavailable.

### PR delivery

This report is committed on the stacked branch and is intended to be submitted
as a new pull request against PR #9's head branch. The PR URL will be recorded
here after the remote push and creation step; PR #9 remains open and no merge is
performed by this task.
