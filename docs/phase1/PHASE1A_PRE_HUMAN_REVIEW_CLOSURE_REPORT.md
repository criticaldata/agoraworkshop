# AGORA Phase 1A — Pre-Human-Review Closure Report

**Report date:** 2026-09-11  
**Repository:** `criticaldata/agoraworkshop`  
**Branch:** `codex/phase1a-pre-human-review-closure`  
**Base:** PR #9 head `4f20c23660d9e508c4d6724aedd7f1cb7a2c52ec`  
**Implementation head at report creation:** to be updated after final verification
**Delivery model:** stacked pull request [#10](https://github.com/criticaldata/agoraworkshop/pull/10) on Simon's open PR #9; this report does not authorize or perform a merge.

## Executive disposition

The branch closes the Phase 1A engineering and pre-human-review scientific
contract and records a completed live calibration against the authorized AGORA
NVIDIA vLLM endpoint. The role treatment, canonical workshop stages, outcome
definitions, missingness policy, statistical analysis plan, calibration
instruments, reviewer workflow, adjudication workflow, protected projections,
dataset locking and Phase 1B transition predicate are explicit, versioned and
covered by executable tests.

This is not a claim that Phase 1A is scientifically closed. The exact current
boundary is:

| Area | Current state |
|---|---|
| Software and protocol contract | `CLOSED_FOR_HUMAN_VALIDATION` |
| Machine-verifiable P1-A/P1-B/P1-C contracts | `PASS` in the clean live calibration package |
| External live-provider evidence | `EXECUTED`; NVIDIA vLLM served `qwen3-32b` through the authorized tunnel |
| Human calibration/reliability | `PENDING_HUMAN_VALIDATION` |
| Phase 1B | `INACTIVE`; no eligibility until P1-D and Phase 1A closure are complete |

The branch therefore ends at the correct handoff: live machine calibration is
complete and the dataset is locked, while independent human coding,
reliability and adjudication remain the only scientific closure work.

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
| Frozen campaign manifest hash | `sha256:da16e9dcb14d682805d9dbb675f0743beb1e8c25d755e75b77068c28422d5b14` |
| Treatment config hash in calibration manifest | `sha256:9c6acb5bd75ff724623c15c471b37a9453c6706ea64eaf14ea024d4d7e638877` |
| Instrument manifest hash | `sha256:54a99890c07990f41df01d1122fdb7e8777243a027b5d1c0c415c08acb53f676` |

Instrument hashes:

| Instrument | SHA-256 |
|---|---|
| Role registry | `sha256:78541c247047429eadc0390738988b20e459fb0eed164ba4d05c65c92c3fdd10` |
| Expressed-position questionnaire | `sha256:c8ea97b4f1cabc2cdd12674d6c52292bffb3ab946175a5bbb28163f5304b33f7` |
| Behavioral rubric | `sha256:07a8940a0fabea413b8693ac434951ba52b0dd1083036b16717dac86900da5e9` |
| Outcome metric registry | `sha256:746099ebef4e405a830d329918b98c18d93dcdb2b1e7de0318854ba5bc4a461d` |
| Statistical analysis plan | `sha256:424a54778120297115c40353600ff82187d1806572c21d50051510a5a47cbadd` |

## Gate status at handoff

| Gate | Status | Interpretation |
|---|---|---|
| P1-A | `PASS` | Clean live campaign completed all canonical stages with valid S1/S6/S7 records, sealed ballots and deterministic S8 outputs |
| P1-B | `PASS` | Clean live campaign produced a locked, reconstructable dataset with machine provenance and annotation-supporting units; human labels remain pending |
| P1-C | `PASS` | Ten paired blocks completed the predeclared role rotation and AB–BA balance under the frozen treatment-only comparison |
| P1-D | `PENDING_HUMAN_VALIDATION` | Live/locked evidence is present; independent review, empirical reliability and adjudication remain; no significance result is required |
| Phase 1A | `CLOSED_FOR_HUMAN_VALIDATION` | No further scientific design blocker remains before launching the prescribed package |
| Phase 1B | `INACTIVE` | Eligibility requires P1-A/B/C PASS, P1-D PASS and explicit Phase 1A closure |

The gate implementation deliberately does not allow a mock to satisfy live
calibration or scientific validation. The clean live package is a machine-level
handoff state, not a fabricated human-scientific result.

## Current provider state and live evidence

The provider preflight succeeded against the authorized AGORA service through
the local SSH tunnel:

```text
endpoint: http://127.0.0.1:18000/v1
adapter: nvidia_vllm
model: qwen3-32b
vLLM: 0.25.1
models discovered: 1
max context: 8192
chat probe: finish=stop, input_tokens=31, output_tokens=5
```

The live campaign used only the AGORA service on remote port 8000, exposed
locally as port 18000. The separate Leoclaw service on port 8002 was not
invoked and is not part of this evidence.

### Clean live calibration package

| Item | Result |
|---|---|
| Campaign | `campaign_8fba623b-ce2c-497f-bd26-dcdb3cd91fe5` |
| Provider/model | `nvidia_vllm` / `qwen3-32b` |
| Planned/completed cases | `20 / 20` |
| Paired blocks | `10` |
| Provider attempts | `700` |
| Reported tokens | `1,296,818` |
| Unknown-usage attempts | `0` |
| Run failures/interruption/budget skips | `0 / 0 / 0` |
| Valid sealed ballots | `100 / 100` |
| Dataset snapshot | `dataset_62e76c3ecbfa21d9963` |
| Dataset SHA-256 | `sha256:62e76c3ecbfa21d99639597ccd66535aa45af49d3b8e35ca38f862f32924f569` |
| Human-validation package | `hvp_45ed182fec0fd5c1f2e` |
| Human package SHA-256 | `sha256:45ed182fec0fd5c1f2ebebc6ec626f85cb59842bff996c9c6df9aa04e76e36e7` |
| Calibration package | `data/phase1a_nvidia_vllm_calibration_20260911c_finalized/` |
| Remote archive | `/data/AGORA/temporary_artifacts/20260911_phase1a_nvidia_vllm_calibration_clean` |
| Export SHA-256 | `c30d149c347513d4fa621c896ba193c2fe0911dc9c724b81e632cc85dd40e714` |

The remote copy and export hash were independently checked over SSH. The
application records the handoff as `EXTERNAL_ARCHIVE_DECLARED`; immutable/WORM
confirmation remains an operator-level assertion and is not claimed here.

An initial live campaign was retained separately as a diagnostic because the
provider returned some valid ballot objects inside Markdown JSON fences. The
raw responses were preserved, the parser was corrected with a narrowly scoped
envelope normalizer and a regression test, and the clean campaign above was
rerun from a new frozen campaign. No metrics from the diagnostic campaign are
used in the closure claim.

The clean campaign's machine gates are:

```text
P1-A = PASS
P1-B = PASS
P1-C = PASS
P1-D = PENDING_HUMAN_VALIDATION
```

The locked package contains 1,156 coding units assigned to two independent
reviewers. No reviewer labels, reliability coefficient, adjudication result,
human RF/ICR estimate, precision estimate or final sample-size decision is
claimed yet. Those values remain unavailable until the prescribed human review
workflow is executed.

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
| Phase 0 regression package | PASS; `ready=true`, Gates 1–3 PASS, M1–M22 PASS |
| Phase 1 ballot contract tests | PASS; typed S7 terminal statuses, trace receipt and S1–S8 ordering |
| Phase 1 review UI/workspace tests | PASS; independent reviewer and adjudicator workflow |
| Restart/backup/recovery tests | PASS at the implemented contract level |
| Provider provenance tests | PASS; `nvidia_vllm`/`qwen3-32b` boundary enforced |

The tests are split between positive contracts and falsification paths. The
negative tests intentionally damage traces, hashes, topology, permissions,
missing deliveries, reviewer identity, package membership and stage ordering and
expect failure. This makes the tests evidence about the acceptance logic rather
than only smoke checks.

The Phase 0 regression package was rerun in a fresh database after the Phase 1A
changes. It produced baseline `run_15fca2df-8dd3-4ff2-aba4-238a931ef505`, exact
rerun `run_257c5f89-741d-4f7f-9822-5fff794a3898` and fault run
`run_92365bff-1c56-4caa-a0bb-d20824f79464`, all under the expected mock
configs. The stored report is in `data/phase0_regression_20260911/` and its
acceptance result is `phase0_validated=true` with no outstanding items.

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

Phase 1A is ready for the prescribed human-review workflow. The engineering
and scientific contract is no longer an open design problem, and the clean
NVIDIA vLLM calibration has produced a locked, auditable machine-evidence
package. The remaining evidence is external by nature: independent human
coding, empirical reliability and adjudication. Until those occur, the
scientifically honest status is `PENDING_HUMAN_VALIDATION`; no RF, ICR,
reliability, precision or Phase 1B eligibility claim is made.

### PR delivery

This report is committed on the stacked branch and submitted as
[PR #10](https://github.com/criticaldata/agoraworkshop/pull/10) against PR #9's
head branch. PR #9 remains open and no merge is performed by this task.
