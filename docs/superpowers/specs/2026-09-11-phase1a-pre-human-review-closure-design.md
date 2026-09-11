# Phase 1A pre-human-review closure design

**Status:** APPROVED FOR IMPLEMENTATION  
**Date:** 2026-09-11  
**Base:** `codex/phase1a-canonical-closure` at `4f20c23660d9e508c4d6724aedd7f1cb7a2c52ec`  
**Target:** engineering-complete, calibration-frozen, protected human-review package  

## 1. Decision

This change closes the engineering and scientific-contract gaps identified in the
independent review of PR #9. It does not claim that Phase 1A has produced evidence
of role effects. It makes the instrument and the calibration contract ready for a
real calibration campaign and blinded human annotation.

The externally visible states are deliberately separate:

- `ENGINEERING_COMPLETE`: the implementation, controls, exports, tests and non-human
  gates are complete.
- `CALIBRATION_FROZEN`: the frozen calibration package exists; the live provider
  state is reported separately as available or `BLOCKED_EXTERNAL_LIVE_PROVIDER`.
- `CALIBRATION_FROZEN`: the role pack, questionnaire, rubric, outcome registry and
  SAP are immutable for the calibration run.
- `READY_FOR_HUMAN_REVIEW`: a live campaign has been executed and a blinded package
  is locked for independent annotation.
- `PENDING_HUMAN_VALIDATION`: technical prerequisites are complete but the frozen
  human labels, reliability and adjudication evidence are still required.
- `CONFIRMATORY_READY`: only available after the required human reliability and
  adjudication evidence is present.

No mock run, synthetic label, or unexecuted reliability value may move a campaign
to a scientifically validated or confirmatory state.

## 2. Scope and non-goals

### In scope

1. Protect all sensitive Phase 1 reads and writes with server-side principal-aware
   authorization.
2. Reconcile all successful, explicit-abstention and no-op outcomes through one
   shared behavioral-terminal predicate.
3. Give S7 ballots typed terminal outcomes and preserve infrastructure missingness.
4. Complete the opportunity-to-ballot-to-export trace chain.
5. Lock the calibration dataset with content-addressed, tamper-evident metadata.
6. Freeze the calibration instruments and their provenance.
7. Provide authenticated blinded review, independent submissions and adjudication.
8. Implement the prespecified outcomes, SAP and reliability contracts.
9. Harden P1-A through P1-D gates and distinguish observability from validation.
10. Add the deterministic five-participant calibration configuration and launch
    package without fabricating a live run.

### Out of scope

- Any Phase 1B design or execution.
- Training, fine-tuning or changing the model/provider deployment.
- Treating a mock provider as scientific evidence.
- Claiming that the role prompts have external psychological validation.
- Claiming semantic human reliability before independent human labels exist.
- A physical WORM guarantee when the deployment does not provide one.

## 2.1 Governing scientific sources and decisions

The implementation is governed by the following local sources, in precedence order:

1. `AGORA_Phase1_Scientific_Foundation_and_Experimental_Framework.pdf`, especially
   pp. 5-16 and 17-22: fixed environment plus one treatment, five participants,
   run/paired-block unit, S1-S8 boundaries, seven metric families, P1-A to P1-D,
   calibration before confirmatory claims and claim boundaries.
2. `AGORA_Phase1A_Scientific_Basis_for_Behavioral_Rubric.pdf`, pp. 1-4: DQI,
   CACS and DCS provide construct/coding provenance; the AGORA rubric is a new
   adapted instrument; independent review, Krippendorff alpha, disagreement
   inspection and append-only adjudication are required.
3. `AGORA_Phase1A_Statistical_Analysis_Plan_v0.1_revised.pdf`, pp. 1-10: run /
   paired-block analysis, RF primary endpoint, ICR/participation concentration/
   position change secondary family, paired-block bootstrap, Holm correction,
   missingness and calibration-dependent N/precision.
4. `docs/phase1/AGORA_PHASE1_PR9_INDEPENDENT_REVIEW.md`: current implementation
   evidence and defect reproduction, subordinate to the scientific sources.

The source-to-implementation matrix is committed at
`docs/phase1/PHASE1A_SOURCE_TRACEABILITY.md`. Each row binds a source requirement
to a concrete contract, test and status. Generic scientific knowledge cannot replace
an unavailable source.

The following choices close the scientific decisions that the sources intentionally
leave open before human coding:

- Role Fidelity is the sole primary endpoint. ICR is the key secondary. Gini and
  initial-to-final expressed position change form the prespecified secondary family.
  Fine relation subtypes, private/public uptake, divergence, modularity, coalition,
  structural minority and S8 quality remain exploratory/descriptive.
- The inferential unit is the predeclared paired block; messages and agents remain
  nested observations. The primary uncertainty method is a 10,000-resample,
  two-sided, 95% paired-block nonparametric bootstrap. Holm correction applies to
  the three prespecified secondary endpoints. Primary alpha is 0.05.
- Human validation requires at least two independent authenticated reviewers. All
  confirmatory RF and ICR eligible units in the frozen calibration package are
  double-coded; a reliability stratum must have at least 30 pairable units. The
  acceptance threshold is Krippendorff alpha >= 0.80 for every RF criterion and
  ICR presence/absence category. Alpha in [0.667, 0.80) is diagnostic and requires
  codebook review/recalibration; alpha < 0.667 is a reliability failure. These
  cutoffs are a conservative coding-reliability convention, not proof of validity.
  Relation-subtype alpha is computed and reported with the same diagnostic bands,
  but relation subtypes do not gate the primary endpoint.
- Confirmatory coverage is 100% for RF/ICR eligible units, with no unresolved
  independent conflicts after adjudication. Any disagreement on a confirmatory
  unit triggers adjudication; low alpha triggers a new instrument version and a
  recalibration cycle. Adjudication cannot erase the pre-adjudication alpha.
- Final N and target precision remain calibration-derived. After live calibration,
  freeze the observed paired-RF variability, target half-width and resulting block
  count under `B ≈ (z_0.975 * sigma_delta / h*)^2`, checked by simulation against
  the bounded outcome distribution. No operational block count is treated as a
  final scientific N before this calculation.
- P1-D is externally reported as `PENDING_HUMAN_VALIDATION` after all technical
  prerequisites are satisfied. Its only remaining blockers are the frozen human
  coverage, empirical reliability and required adjudication; it never requires a
  significant treatment effect.
- If the authorized live provider is unavailable, the exact provider state is
  `BLOCKED_EXTERNAL_LIVE_PROVIDER`; the frozen manifest and launch instructions are
  still produced, and no mock result is promoted to live calibration.

## 3. Experimental invariants

Phase 1A changes the role treatment only. The following remain equal across paired
conditions: model, provider, deployment/version, generation parameters, tools,
moderator, topic, public/private context rules, protocol version, schedule,
budgets, five-participant topology and stage boundaries S1-S8.

Breakout membership is frozen as exactly five participants, each appearing once,
with disjoint groups of sizes 2 and 3. The moderator never enters a breakout. S6
is completed before S7. S7 and S8 cannot write data that is read by S6. S8 is
deterministic and schema-bound and does not call a model or moderator.

The canonical run may preserve partial evidence after an interruption, but it is
scientifically complete only when every required stage, including S7, has a valid
terminal record. Runtime `COMPLETED` and canonical scientific completion are not
synonyms.

## 4. Authorization model

Replace the shared Basic-password interpretation for sensitive Phase 1 workflows
with an authenticated principal boundary. The implementation may retain Basic
authentication as a transport mechanism, but it must resolve a principal and role
before serving a protected route.

The supported principals are:

- `admin`: can manage assignments, lock snapshots, inspect the protected mapping,
  adjudicate and export administrative evidence.
- `reviewer`: can see only assigned blinded units and submit one independent label
  set per unit; cannot see condition, role name, prompt, evaluator target,
  aggregate outcome, other reviewer labels or the admin mapping.
- `adjudicator`: can see the original independent labels for a conflict after both
  submissions exist and can record an adjudication; cannot alter originals.
- `operator`: can launch and inspect operational runs but cannot read blinded
  reviewer identities or alter human labels.

Environment configuration is explicit and never rendered into HTML:

```text
AGORA_AUTH_USERS=<principal>:<role>:<password>,...
AGORA_AUTH_PASSWORD=<legacy operator secret, accepted only for operator access>
AGORA_AUTH_SCOPE=write|all
```

If a deployment has only the legacy password, sensitive review and science routes
fail closed with `403` and explain that a named principal is required. Existing
Phase 0 operational routes retain their current fail-closed behavior.

Every protected route declares its required permission. All Phase 1 GET routes for
campaigns, review pages, private messages, roles, annotations, ballots, datasets,
analysis and exports require authentication; default `scope=write` never makes
these routes public. Authorization is enforced in middleware and in route/service
functions so a direct API call cannot bypass the page guard.

Blinded projections are constructed server-side. Removing a field in client HTML
is not considered blinding.

## 5. Shared behavioral terminal semantics

Create one exported predicate, `isBehavioralTerminalOutcome`, used by the runner,
opportunities, analysis, deliveries, canonical stage checks, metrics, gates and
exports. It returns true only for:

- `success`
- `explicit_abstention`
- `no_op`

The following remain non-behavioral and never become behavioral observations:

- timeout, provider error, malformed response, tool failure, permission failure;
- budget exhaustion, deadline, cancellation, interruption or unknown/incomplete;
- delivery failure or missing context.

Each consumer must preserve the original outcome and failure category while using
the shared predicate for availability/terminality. This prevents infrastructure
failure from being counted as silence and prevents a valid abstention from being
counted as an experiment failure.

## 6. Trace and typed ballot contract

Every S7 ballot has a stable `ballot_id`, `trace_id`, `opportunity_id`,
`invocation_id` when applicable, `agent_id`, authorized context IDs and a typed
terminal status. The allowed statuses are:

| Status | Meaning |
|---|---|
| `valid` | a parseable expressed-position response |
| `explicit_abstention` | the participant explicitly declined to answer |
| `invalid` | a response exists but violates the ballot schema |
| `provider_failure` | the provider failed before a ballot result |
| `timeout` | the request exceeded its time limit |
| `deadline` | the stage deadline elapsed |
| `budget` | the configured budget prevented the request |
| `cancellation` | the run was cancelled |
| `unknown_incomplete` | evidence is insufficient to classify the result |

`invalid` is not abstention. A provider failure is not an abstention. Missingness
is preserved in the scientific dataset with its reason and provenance.

The required trace chain is:

```text
opportunity
 -> invocation
 -> retry/failure events
 -> authorized context and reservation
 -> ballot result and usage
 -> S7 stage record
 -> deterministic S8 artifact
 -> locked dataset snapshot
 -> export manifest
```

M06 and export validation fail if any required link is absent, including delivery,
retry, analysis-derived, or manifest entries.

## 7. Dataset locking and archive handoff

Create a content-addressed snapshot over canonical bytes containing:

- campaign and run IDs;
- exact membership and pair assignment;
- all included record IDs;
- protocol/config/prompt/role/rubric/questionnaire/SAP versions and hashes;
- source event and trace IDs;
- missingness and ballot status values;
- creation revision and lock event.

The snapshot ID is derived from the canonical bytes and is immutable in the
application. Locking appends a durable event and prevents mutation of membership,
versions, source records and labels. Any attempted change produces a hash mismatch
or a rejected revision. Every export manifest must include the exact snapshot ID
and SHA-256.

The application-level lock is not described as physical WORM. The manifest instead
contains an explicit external archive handoff with canonical bytes, hash, required
retention and a field stating whether an external immutable archive has confirmed
receipt.

## 8. Calibration instruments

All instruments are versioned, hashed and frozen before a live calibration run.
The canonical IDs are:

- role pack: `agora-functional-role-pack`, version `calibration-v1`;
- expressed-position questionnaire: `agora-expressed-position`, version
  `calibration-v1`;
- behavioral rubric: `agora-behavioral-annotation-rubric`, version
  `calibration-v1`;
- outcome registry: `agora-outcomes`, version `calibration-v1`;
- statistical analysis plan: `agora-phase1a-calibration-sap`, version
  `calibration-v1`.

Every instrument has status `draft`, `frozen_for_calibration` or
`confirmatory_ready`. `confirmatory_ready` requires a locked dataset, completed
human reliability, adjudication where required and an accepted analysis record.
The reliability threshold is frozen before reviewers code: Krippendorff alpha >=
0.80 for every RF criterion and ICR presence/absence category, with at least 30
pairable units per reliability stratum. The [0.667, 0.80) band is diagnostic and
requires codebook review/recalibration; below 0.667 fails reliability. Relation
subtype alpha is reported under the same bands but is exploratory and does not gate
the primary endpoint. This threshold cannot block execution of calibration, but it
does block confirmatory readiness.

### Role pack

The role pack contains the five current functional roles, conceptual mapping,
theory/source mapping, resolved system prompt, behavioral indicators, exclusions,
rubric references and content hash. It explicitly states that conceptual sources
motivate the design; they do not externally validate AGORA's exact prompts.

### Questionnaire

The questionnaire measures expressed position, not latent belief. S1 and S6 use
the same frozen options, choice field, confidence 0-100, rationale, optional
ranking/primary concern field and parsing rules. Missingness, invalid responses and
position change are represented separately.

### Behavioral rubric

The rubric uses DQI/CACS/Discussion Coding concepts as provenance and labels the
AGORA adaptation as new and versioned. Each criterion declares construct,
operational definition, unit, scale, positive evidence, negative evidence,
not-assessable rule, exact quote/evidence requirement, stage window, provenance
and version/hash. Human reviewers annotate evidence; the system never invents a
human label.

### Outcome registry and SAP

Primary outcome: Role Fidelity.  
Key secondary: Interpersonal Conflict Resolution (ICR), present or absent.  
Secondary: Gini of expressed positions and initial-to-final position change.  
Descriptive: confidence, preference switch, position shares, entropy and response
centrality.  
Exploratory: relation rates, uptake, private-public divergence, modularity,
coalition, semantic minority, final artifact quality and structural S7 outcomes.

ICR presence/absence is a relevant key secondary and reliability gate. Fine-grained
relation subtypes are computed and reported but are exploratory and do not gate the
primary confirmatory result. Structural minority counts are separate from the
semantic human outcome.

The calibration SAP uses paired blocks and declares:

```text
Delta_b = Y_treatment,b - Y_control,b
ATE_Role = mean(Delta_b)
```

Role Fidelity is primary. ICR is the key secondary. Gini and position change are
secondary. The remaining outcomes are exploratory/descriptive. Confidence
intervals use paired-block bootstrap with the block as the resampling unit; message
resampling is prohibited. Holm correction applies to the prespecified secondary
family. Incomplete pairs are unavailable for paired estimation and are reported in
missingness, not silently imputed. A sensitivity model is specified for available
paired data. The calibration campaign estimates variability, availability,
annotation burden, role-fidelity/ICR behavior and precision; it does not establish
confirmatory significance.

## 9. S7 context and human review workspace

Before S7, each participant receives exactly the authorized context projection:
public material plus that participant's own authorized private material. It cannot
contain another room's messages, ballots, collective outputs or S8. The projection
records source IDs, scope, content hashes and policy version.

The review workspace creates blinded units from the locked snapshot. A reviewer
sees an authenticated assignment, unit ID, permitted evidence and rubric labels,
but not condition, role name, prompt, evaluator target, aggregate outcome, other
labels or the admin mapping. The server rejects labels for unassigned units and
rejects a second independent submission by the same reviewer.

The adjudication page is a first-class UI route, not an API-only feature. It is
available only after independent submissions from the required reviewers. The
adjudicator sees the conflicting labels and source evidence, records a separate
adjudication, and cannot overwrite the originals. Admin pages show assignment
coverage, completion, disagreement, reliability, lock state and export state.

## 10. Gates and statuses

- **P1-A experimental integrity:** full S1-S8 coverage, frozen topology, pair
  assignment, protocol/config hashes, no phase contamination and complete trace.
- **P1-B behavioral observability:** the operational evidence and observability
  contract are present. It is explicitly not scientific validation.
- **P1-C run comparability:** provider/model/deployment/parameters/tools/moderator/
  topic/context/schedule/budget equality and attributable failures.
- **P1-D analysis/scientific readiness:** ends as `PENDING_HUMAN_VALIDATION` when
  technical prerequisites are satisfied but human labels, reliability or
  adjudication are pending. It never reports significance and never passes merely
  because a mock run exists.

M01 uses distinct statuses `NOT_EXERCISED`, `EXECUTED_BUT_INVALID`,
`EXECUTED_BUT_MISSING` and `VALID`. A metric may not be promoted from one to
another by a filename or a test fixture alone.

## 11. Calibration campaign package

Add a distinct calibration configuration with frozen protocol, role pack,
questionnaire, rubric, outcome registry, SAP, no tools, controlled moderator,
five participants and fixed environment parameters. The package records the
provider availability check without exposing credentials.

If an authorized live provider is reachable, the campaign runs under that frozen
configuration and produces baseline/treatment paired blocks, complete exports,
the locked snapshot and a blinded review package. If no live provider is reachable,
the implementation produces the exact frozen manifest and launch instructions and
reports `BLOCKED_EXTERNAL_LIVE_PROVIDER`; it must not create synthetic calibration
labels, reliability or live run IDs.

Mocks remain valid for infrastructure and adversarial tests only. They are marked
as synthetic fixtures in every export and cannot satisfy the live or human gates.

## 12. Verification and delivery

The implementation must add tests before production changes for each correction,
including adversarial route access, semantic terminal outcomes, typed ballot
failures, S7 completeness, snapshot tampering, trace gaps, blinded projections,
reviewer isolation, adjudication ordering, role-pack hashes, SAP classification,
restart/export compatibility and gate statuses.

Before delivery run a fresh:

```text
npm test
npm run build
git diff --check
npm audit --audit-level=high
npm audit --omit=dev
Phase 0 regression
Phase 1 canonical mock/infrastructure suite
security and route adversarial suite
review/blinding/reliability suite
```

Create the implementation branch from the current PR #9 head, push it without
rewriting or merging Simon's branch, and open a stacked PR against the current PR
#9 head branch. The final report must identify the PR base/head, commit, all finding
statuses, frozen instrument IDs/versions/hashes, dataset/review package IDs and
hashes, live provider availability/execution state, P1-A through P1-D states,
verification commands/results, explicit blockers and Phase 1B inactive status.

The strongest permitted completion statement before human review is:

> Engineering is complete, the Phase 1A calibration contract is frozen, all
> non-human gates pass, and the system is ready for live calibration and blinded
> human review.

After a live campaign but before labels, the permitted statement is:

> The calibration dataset is locked and ready for independent human annotation;
> scientific validation remains blocked pending reliability and adjudication.
