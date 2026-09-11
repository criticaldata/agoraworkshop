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
- `READY_FOR_LIVE_CALIBRATION`: the frozen calibration package exists, but no real
  provider campaign has been executed in the current environment.
- `CALIBRATION_FROZEN`: the role pack, questionnaire, rubric, outcome registry and
  SAP are immutable for the calibration run.
- `READY_FOR_HUMAN_REVIEW`: a live campaign has been executed and a blinded package
  is locked for independent annotation.
- `BLOCKED_HUMAN_REVIEW`: technical prerequisites are complete but human labels,
  reliability or adjudication are still required.
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
The reliability threshold is a versioned field that remains `pending_human_approval`
until the human review protocol has approved it; this pending value cannot block
execution of calibration, but it does block confirmatory readiness.

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
- **P1-D analysis/scientific readiness:** ends as `BLOCKED_HUMAN_REVIEW` when
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
reports `READY_FOR_LIVE_CALIBRATION`; it must not create synthetic calibration
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
