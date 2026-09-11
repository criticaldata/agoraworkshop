# Phase 1A pre-human-review closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close PR #9's Phase 1A engineering and calibration-contract gaps, produce a protected blinded-review workflow, and stop honestly at live-calibration or human-review readiness without fabricating scientific evidence.

**Architecture:** Extend the existing SQLite/Express/TypeScript Phase 1 workflow with focused contracts: one shared behavioral-terminal predicate, principal-aware route authorization, typed S7 ballot records, content-addressed dataset locks, frozen instrument manifests, and a server-created blinded review workspace. Keep Phase 0 behavior and legacy hashes unchanged, preserve the existing PR #9 analysis model, and make all new readiness states explicit.

**Tech Stack:** TypeScript 7, Node.js 22+, Express 5, SQLite via better-sqlite3, Zod 4, Vitest 4, YAML configs, existing AGORA runner/providers/exporters.

**Spec:** `docs/superpowers/specs/2026-09-11-phase1a-pre-human-review-closure-design.md`

## Global Constraints

- Work only on `codex/phase1a-pre-human-review-closure`, based on PR #9 head `4f20c23660d9e508c4d6724aedd7f1cb7a2c52ec`.
- Do not cherry-pick PR #7; inspect and reimplement only compatible semantic/auth corrections.
- Preserve five participants, S1-S8, S6 before S7, disjoint 2+3 breakouts and deterministic S8.
- Use `success`, `explicit_abstention` and `no_op` as the only behavioral terminal outcomes.
- Keep timeout, provider/tool failure, invalid response, deadline, budget, cancellation and incomplete evidence non-behavioral.
- Mocks are infrastructure fixtures only and cannot satisfy live, human reliability or confirmatory gates.
- Do not add a dependency unless the existing lockfile and `npm audit` justify it.
- Do not put credentials, reviewer mappings or private transcripts in committed manifests.
- Do not call Phase 1A scientifically validated before independent human review, reliability and required adjudication.
- Every implementation task follows RED test, failing test run, minimal GREEN implementation, passing test run and commit.

## File map

- `src/phase1/terminalOutcome.ts`: shared behavioral-terminal semantics and typed failure classification.
- `src/server/auth.ts`, `src/server/principal.ts`: principal parsing, permissions and fail-closed middleware.
- `src/db/schema.ts`, `src/phase1/campaign.ts`: additive schema migration and Phase 1 records.
- `src/phase1/collective.ts`, `src/phase1/analysis.ts`, `src/phase1/export.ts`: typed S7 ballots and causal trace links.
- `src/phase1/scientificDataset.ts`, `src/phase1/scienceStore.ts`: canonical snapshot bytes, lock and archive handoff.
- `src/phase1/instruments.ts`, `src/phase1/evaluationContract.ts`, `src/phase1/scienceContract.ts`: frozen instruments and analysis contract.
- `src/phase1/reviewWorkspace.ts`, `src/server/phase1.ts`: assigned blinded units, independent labels and adjudication UI/API.
- `src/phase1/reliability.ts`, `src/phase1/statistics.ts`, `src/phase1/analysis.ts`: human reliability and calibration SAP outputs.
- `src/acceptance/phase01.ts`, `src/acceptance/gates.ts`: M01-M08 and P1-A through P1-D status logic.
- `configs/agora_phase1a_calibration.yaml`, `src/phase1/calibration.ts`, `src/phase1/cli.ts`: frozen calibration manifest and honest provider readiness.
- `tests/phase1*.test.ts`, `tests/auth.test.ts`, `tests/securityPhase1.test.ts`: regression, adversarial and contract tests.
- `docs/phase1/*.md`, `docs/phase1/PHASE1A_CLOSURE_STATUS.md`: protocol and final readiness report.

---

### Task 1: Add the shared behavioral-terminal contract

**Files:**
- Create: `src/phase1/terminalOutcome.ts`
- Modify: `src/phase1/analysis.ts`, `src/phase1/behavioralAnalysis.ts`, `src/phase1/campaign.ts`, `src/phase1/collective.ts`, `src/acceptance/metrics.ts`, `src/acceptance/phase01.ts`, `src/acceptance/gates.ts`
- Test: `tests/phase1TerminalOutcome.test.ts`

**Interfaces:**
- Produce `BEHAVIORAL_TERMINAL_OUTCOMES` containing `success`, `explicit_abstention` and `no_op`.
- Produce `isBehavioralTerminalOutcome(outcome: string | null | undefined): boolean`.
- Produce `classifyTerminalOutcome(outcome: string | null | undefined, failureCategory?: string | null): 'behavioral' | 'infrastructure' | 'incomplete'`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, it } from 'vitest';
import { classifyTerminalOutcome, isBehavioralTerminalOutcome } from '../src/phase1/terminalOutcome.js';

it.each(['success', 'explicit_abstention', 'no_op'])('%s is behavioral', value => {
  expect(isBehavioralTerminalOutcome(value)).toBe(true);
  expect(classifyTerminalOutcome(value)).toBe('behavioral');
});

it.each(['timeout', 'provider_error', 'tool_timeout', 'invalid', 'budget', 'deadline', 'cancellation'])('%s is not behavioral', value => {
  expect(isBehavioralTerminalOutcome(value)).toBe(false);
  expect(classifyTerminalOutcome(value)).not.toBe('behavioral');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/phase1TerminalOutcome.test.ts`  
Expected: FAIL because `src/phase1/terminalOutcome.ts` does not exist.

- [ ] **Step 3: Implement the minimal contract**

Implement the exported constants and predicates. Treat null, undefined and unknown
values as `incomplete`; treat known operational failures as `infrastructure`.

- [ ] **Step 4: Replace local semantic checks**

Replace direct `outcome === 'success'` checks in the listed modules with the shared
predicate while preserving original failure/category fields. Do not change legacy
Phase 0 records.

- [ ] **Step 5: Run focused and regression tests**

Run: `npx vitest run tests/phase1TerminalOutcome.test.ts tests/phase1Canonical.test.ts tests/phase1Science.test.ts`  
Expected: PASS, with explicit abstention and no-op accepted as terminal behavioral
records and infrastructure failures excluded.

- [ ] **Step 6: Commit**

```bash
git add src/phase1/terminalOutcome.ts src/phase1 src/acceptance tests/phase1TerminalOutcome.test.ts
git commit -m "fix: unify Phase 1 behavioral terminal semantics"
```

### Task 2: Implement principal-aware fail-closed authorization

**Files:**
- Create: `src/server/principal.ts`
- Modify: `src/server/auth.ts`, `src/server/phase1.ts`, `src/server/index.ts`
- Test: `tests/auth.test.ts`, `tests/securityPhase1.test.ts`

**Interfaces:**
- Produce `PrincipalRole = 'admin' | 'reviewer' | 'adjudicator' | 'operator'`.
- Produce `AuthPrincipal { id: string; role: PrincipalRole }`.
- Produce `parseUsersFromEnv(env): Map<string, { role: PrincipalRole; password: string }>`.
- Produce `requirePermission(permission: 'operate'|'review'|'adjudicate'|'admin')`.
- Attach `req.agoraPrincipal?: AuthPrincipal` only after successful server-side authentication.

- [ ] **Step 1: Add adversarial failing tests**

Test every sensitive GET with default `scope=write`: `/phase1/campaigns/:id`,
`/review`, `/science`, `/annotations`, `/artifact-reviews`, `/snapshots`, and
equivalent API routes. Assert unauthenticated and operator-only requests cannot
read reviewer labels, private messages, role/prompt fields or dataset mappings.

- [ ] **Step 2: Run security tests to verify failure**

Run: `npx vitest run tests/auth.test.ts tests/securityPhase1.test.ts`  
Expected: FAIL because current middleware authenticates only state-changing routes
and uses a shared credential.

- [ ] **Step 3: Implement env-backed principals**

Parse `AGORA_AUTH_USERS` as comma-separated `id:role:password` entries, reject
duplicate IDs, unknown roles and malformed entries at startup. Retain the legacy
password only for operator permissions. Use constant-time password comparison.

- [ ] **Step 4: Protect routes twice**

Declare route permission in middleware and call `requirePermission` inside service
handlers. Use server-created projections for reviewer pages; never rely on hidden
HTML fields. Return `401` for missing authentication and `403` for an authenticated
principal without the required role.

- [ ] **Step 5: Run focused and full auth tests**

Run: `npx vitest run tests/auth.test.ts tests/securityPhase1.test.ts tests/phase1Ui.test.ts`  
Expected: PASS; health and public documentation remain available according to the
existing deployment scope, while all Phase 1 sensitive reads are protected.

- [ ] **Step 6: Commit**

```bash
git add src/server/auth.ts src/server/principal.ts src/server/phase1.ts src/server/index.ts tests/auth.test.ts tests/securityPhase1.test.ts
git commit -m "fix: protect Phase 1 routes with named principals"
```

### Task 3: Add additive database fields and migration helpers

**Files:**
- Modify: `src/db/schema.ts`, `src/db/index.ts`, `src/phase1/campaign.ts`
- Test: `tests/phase1SchemaMigration.test.ts`

**Interfaces:**
- Produce `ensureColumn(db, table, column, definition)` with an allowlisted table/
  column map; never interpolate user-provided identifiers.
- Add `phase1_ballots`: `trace_id`, `opportunity_id`, `invocation_id`,
  `terminal_status`, `failure_category`, `authorized_context_json`, `usage_json`.
- Add tables: `phase1_instrument_locks`, `phase1_dataset_snapshots`,
  `phase1_review_assignments`, `phase1_review_submissions`,
  `phase1_adjudications`, `phase1_archive_handoffs`.

- [ ] **Step 1: Write the migration test**

Create a temporary database, initialize the old schema, run `initializePhase1`,
then assert all new columns/tables exist and a second initialization is idempotent.

- [ ] **Step 2: Run the test to verify failure**

Run: `npx vitest run tests/phase1SchemaMigration.test.ts`  
Expected: FAIL because the new fields/tables are absent.

- [ ] **Step 3: Add allowlisted additive migration**

Use `PRAGMA table_info` and `ALTER TABLE ... ADD COLUMN` only for literal
allowlisted identifiers. Create new tables with primary keys, foreign keys,
unique constraints and append-only timestamps. Preserve existing columns and
legacy schema behavior.

- [ ] **Step 4: Run migration and regression tests**

Run: `npx vitest run tests/phase1SchemaMigration.test.ts tests/phase1Campaign.test.ts`  
Expected: PASS without changing existing fixture hashes.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/index.ts src/phase1/campaign.ts tests/phase1SchemaMigration.test.ts
git commit -m "feat: add Phase 1 calibration and review schema"
```

### Task 4: Type S7 ballots and complete causal trace links

**Files:**
- Modify: `src/phase1/collective.ts`, `src/phase1/analysis.ts`, `src/phase1/export.ts`, `src/export/bundleContract.ts`, `src/events/types.ts`
- Test: `tests/phase1BallotContract.test.ts`, `tests/phase1TraceCompleteness.test.ts`

**Interfaces:**
- Produce `BallotTerminalStatusSchema` with `valid`, `explicit_abstention`,
  `invalid`, `provider_failure`, `timeout`, `deadline`, `budget`, `cancellation`
  and `unknown_incomplete`.
- Produce `S7BallotSchema` with IDs, trace, authorized context, terminal status,
  failure category and usage.
- Produce `validateBallotTrace(db, runId): { valid: boolean; missing: string[] }`.
- Make M06 fail for orphaned opportunity, invocation, retry, context, reservation,
  result, usage, S7, S8, snapshot or manifest links.

- [ ] **Step 1: Write typed-ballot and trace tests**

Exercise each typed status. Add fixtures with one missing trace edge and assert M06
fails for missing delivery, retry, analysis-derived and manifest trace entries.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/phase1BallotContract.test.ts tests/phase1TraceCompleteness.test.ts`  
Expected: FAIL because current ballots have free-form status and M06 omits several
exported record classes.

- [ ] **Step 3: Implement typed ballot persistence**

Parse provider responses through the schema, preserve raw outcome and failure
category, write authorized context IDs and usage, and insert trace IDs into every
related record. Never map a provider failure to `explicit_abstention`.

- [ ] **Step 4: Implement complete trace validation and export links**

Re-derive links from SQLite rather than trusting a submitted manifest. Add trace
IDs to delivery, retry, analysis and manifest entries and reject missing/mismatched
links.

- [ ] **Step 5: Run focused, canonical and export tests**

Run: `npx vitest run tests/phase1BallotContract.test.ts tests/phase1TraceCompleteness.test.ts tests/phase1Canonical.test.ts tests/exportBundle.test.ts`  
Expected: PASS, including negative fixtures that fail when any required edge is
removed.

- [ ] **Step 6: Commit**

```bash
git add src/phase1 src/export src/events tests/phase1BallotContract.test.ts tests/phase1TraceCompleteness.test.ts
git commit -m "feat: type S7 outcomes and enforce causal traces"
```

### Task 5: Enforce canonical topology, breakout membership and S7 completeness

**Files:**
- Modify: `src/phase1/canonicalContract.ts`, `src/phase1/campaign.ts`, `src/phase1/closure.ts`, `src/acceptance/phase01.ts`
- Test: `tests/phase1Topology.test.ts`, `tests/phase1Canonical.test.ts`

**Interfaces:**
- Produce `validateBreakoutAssignment(assignments): { valid: boolean; errors: string[] }`.
- Produce `canonicalScientificCompletion(db, runId): 'complete'|'partial'|'invalid'`.
- Require exactly five participant IDs, exactly one assignment per participant,
  disjoint 2+3 groups and no moderator in a group.

- [ ] **Step 1: Add topology and S7 failure tests**

Test duplicate membership, missing member, group size 1+4, group size 2+2+1,
moderator membership and a run with four completed S7 ballots. Assert all fail.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/phase1Topology.test.ts tests/phase1Canonical.test.ts`  
Expected: FAIL because current checks accept incomplete S7 and do not independently
validate all breakout invariants.

- [ ] **Step 3: Implement validation and status separation**

Use a deterministic assignment function from the frozen manifest. Preserve partial
records with `runtime_finished`, `canonical_complete` and `scientific_status`
fields. A runtime-completed run with incomplete S7 becomes partial, not complete.

- [ ] **Step 4: Run focused tests and Phase 0 regression**

Run: `npx vitest run tests/phase1Topology.test.ts tests/phase1Canonical.test.ts tests/phase1Campaign.test.ts`  
Expected: PASS with legacy Phase 0 configs unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/phase1 src/acceptance tests/phase1Topology.test.ts tests/phase1Canonical.test.ts
git commit -m "fix: enforce canonical Phase 1 topology and completeness"
```

### Task 6: Implement immutable content-addressed dataset snapshots

**Files:**
- Modify: `src/phase1/scientificDataset.ts`, `src/phase1/scienceStore.ts`, `src/phase1/export.ts`, `src/server/phase1.ts`
- Test: `tests/phase1DatasetLock.test.ts`, `tests/phase1ExportIntegrity.test.ts`

**Interfaces:**
- Produce `canonicalDatasetBytes(payload): Buffer` with recursively sorted keys.
- Produce `createDatasetSnapshot(db, campaignId): { id: string; sha256: string; bytes: Buffer }`.
- Produce `lockDataset(db, campaignId): LockedDataset`.
- Produce `verifyDatasetLock(db, snapshotId): { valid: boolean; errors: string[] }`.
- Produce `archiveHandoff(db, snapshotId): ArchiveHandoff` with explicit external
  immutable-archive confirmation state.

- [ ] **Step 1: Write tamper and lock tests**

Lock a fixture, assert canonical bytes/hash, attempt membership/version/source
mutation, verify rejection, alter snapshot bytes in a test copy and assert
`verifyDatasetLock` fails. Assert every export manifest contains the exact ID/hash.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/phase1DatasetLock.test.ts tests/phase1ExportIntegrity.test.ts`  
Expected: FAIL because the current lock stores a payload snapshot but does not
enforce content-addressed immutable metadata and archive handoff.

- [ ] **Step 3: Implement canonical bytes and append-only lock event**

Canonicalize the payload, hash the bytes, derive the immutable snapshot ID, insert
the lock record and an event containing the exact hash. Refuse later changes to
membership, instrument versions, source records and human labels.

- [ ] **Step 4: Implement verification and export handoff**

Recompute the hash from stored bytes, check required tables/record counts/source
hashes, write the manifest reference and expose
`requires_external_immutable_archive`. Do not label the application lock as WORM.

- [ ] **Step 5: Run focused and UI tests**

Run: `npx vitest run tests/phase1DatasetLock.test.ts tests/phase1ExportIntegrity.test.ts tests/phase1ScienceUi.test.ts`  
Expected: PASS, with lock state blocking mutations and analysis/export using the
same snapshot hash.

- [ ] **Step 6: Commit**

```bash
git add src/phase1 src/server/phase1.ts tests/phase1DatasetLock.test.ts tests/phase1ExportIntegrity.test.ts
git commit -m "feat: lock Phase 1 datasets by canonical content hash"
```

### Task 7: Freeze role, questionnaire, rubric and outcome instruments

**Files:**
- Create: `src/phase1/instruments.ts`, `tests/phase1Instruments.test.ts`
- Modify: `src/phase1/contracts.ts`, `src/phase1/evaluationContract.ts`, `src/phase1/scienceContract.ts`
- Docs: `docs/phase1/BEHAVIORAL_PROTOCOL.md`, `docs/phase1/SCIENTIFIC_ANALYSIS.md`

**Interfaces:**
- Produce `InstrumentStatus = 'draft'|'frozen_for_calibration'|'confirmatory_ready'`.
- Produce `FrozenInstrumentManifest` with ID, version, canonical JSON, SHA-256,
  status and provenance.
- Produce `freezeCalibrationInstruments(input): FrozenInstrumentManifest[]`.
- Produce `assertConfirmatoryReady(manifest, evidence): void`.

- [ ] **Step 1: Write instrument contract tests**

Assert the five canonical IDs, five roles, exact questionnaire option reuse in S1
and S6, criterion metadata (construct, definition, unit, scale, positive,
negative, not-assessable, evidence, stage window, provenance), and rejection of
confirmatory readiness without human reliability/adjudication.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/phase1Instruments.test.ts`  
Expected: FAIL because current schemas permit only draft/reviewed and lack hashes,
instrument status transitions and complete criterion metadata.

- [ ] **Step 3: Implement frozen manifest generation**

Use recursively canonical JSON and SHA-256. Store the manifest in the campaign
freeze record and include content hashes in every run and dataset export. Mark
scientific sources as design provenance, not external validation of exact prompts.

- [ ] **Step 4: Implement questionnaire and rubric semantics**

Represent expressed position, confidence, rationale, optional ranking/primary
concern, invalid response and missingness consistently across S1/S6. Keep role
criteria ordinal 0-2 with `not_assessable` distinct from absent.

- [ ] **Step 5: Run focused and existing schema tests**

Run: `npx vitest run tests/phase1Instruments.test.ts tests/phase1Campaign.test.ts tests/config.test.ts`  
Expected: PASS with old behavioral-v1 configs still accepted unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/phase1 tests/phase1Instruments.test.ts docs/phase1/BEHAVIORAL_PROTOCOL.md docs/phase1/SCIENTIFIC_ANALYSIS.md
git commit -m "feat: freeze Phase 1A calibration instruments"
```

### Task 8: Add reliability and calibration SAP outputs

**Files:**
- Create: `src/phase1/reliability.ts`, `tests/phase1Reliability.test.ts`
- Modify: `src/phase1/statistics.ts`, `src/phase1/scienceContract.ts`, `src/phase1/analysis.ts`
- Test: `tests/phase1Statistics.test.ts`, `tests/phase1Science.test.ts`

**Interfaces:**
- Produce `computeOrdinalReliability(labels, options)` returning alpha per criterion/
  family, missing counts and threshold status.
- Produce `computeNominalAgreement(labels, options)` for interaction categories.
- Produce `calibrationOutcomeRegistry()` separating primary, key secondary,
  secondary, descriptive and exploratory families.
- Produce `pairedCalibrationEstimate(blocks, metric)` with Delta, ATE, paired-block
  bootstrap CI, Holm-adjusted secondary results and explicit unavailable pairs.

- [ ] **Step 1: Write numerical contract tests**

Use small deterministic fixtures to assert ordinal 0-2 reliability, nominal
agreement, missingness, paired-block bootstrap unit, no message resampling and
secondary-family Holm ordering. Assert exploratory relation subtypes never set the
primary gate.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/phase1Reliability.test.ts tests/phase1Statistics.test.ts`  
Expected: FAIL because relation reliability is currently computed/omitted and no
full primary/key-secondary registry or paired bootstrap contract exists.

- [ ] **Step 3: Implement reliability calculations**

Compute alpha only where the declared scale permits it; use nominal agreement for
interaction labels; preserve `not_assessable` and unreviewed as missingness. Store
threshold as pending until human approval and expose whether evidence is sufficient.

- [ ] **Step 4: Implement SAP classification and estimates**

Use run/block as the unit, calculate `Delta_b` and `ATE_Role`, resample blocks only,
apply Holm to prespecified secondary outcomes and report incomplete pairs without
imputation. Keep fine relation subtypes exploratory.

- [ ] **Step 5: Run focused and analysis tests**

Run: `npx vitest run tests/phase1Reliability.test.ts tests/phase1Statistics.test.ts tests/phase1Science.test.ts`  
Expected: PASS with `BLOCKED_HUMAN_REVIEW` when labels are absent.

- [ ] **Step 6: Commit**

```bash
git add src/phase1 tests/phase1Reliability.test.ts tests/phase1Statistics.test.ts tests/phase1Science.test.ts
git commit -m "feat: add calibration reliability and paired SAP outputs"
```

### Task 9: Build protected blinded review and adjudication workspace

**Files:**
- Create: `src/phase1/reviewWorkspace.ts`, `tests/phase1ReviewWorkspace.test.ts`
- Modify: `src/semantic/phase1Annotations.ts`, `src/phase1/artifactReview.ts`, `src/server/phase1.ts`
- Test: `tests/phase1ScienceUi.test.ts`, `tests/securityPhase1.test.ts`

**Interfaces:**
- Produce `createReviewAssignments(db, snapshotId, reviewers): ReviewAssignment[]`.
- Produce `blindedReviewProjection(db, assignmentId, principal): BlindedUnit`.
- Produce `submitIndependentReview(db, assignmentId, principal, label): string`.
- Produce `listAdjudicationCandidates(db, snapshotId): string[]`.
- Produce `submitAdjudication(db, candidateId, adjudicator, decision): string`.

- [ ] **Step 1: Write isolation and ordering tests**

Assert reviewer A cannot read reviewer B's label, condition, role, prompt, target,
aggregate outcomes or admin mapping; unassigned submissions fail; duplicate
independent submissions fail; adjudication is unavailable before both independent
labels and cannot overwrite originals.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/phase1ReviewWorkspace.test.ts tests/securityPhase1.test.ts`  
Expected: FAIL because current review uses a self-declared query parameter and
renders unblinded campaign context.

- [ ] **Step 3: Implement assignment and projection services**

Create assignments only from locked snapshot IDs. Join evidence server-side, remove
condition/role/prompt/target/aggregate fields and authenticate the principal before
returning a projection.

- [ ] **Step 4: Implement immutable labels and adjudication**

Insert independent submissions as append-only records. Enforce one submission per
reviewer/unit, require two independent submissions for a conflict, append a separate
adjudication record and preserve all originals.

- [ ] **Step 5: Add first-class UI routes**

Add reviewer assignment page, review page, submit route, adjudication queue and
adjudication form. Use `requirePermission('review')` and
`requirePermission('adjudicate')`; admin pages show only permitted operational
summaries.

- [ ] **Step 6: Run review/UI/security tests**

Run: `npx vitest run tests/phase1ReviewWorkspace.test.ts tests/phase1ScienceUi.test.ts tests/securityPhase1.test.ts`  
Expected: PASS with no sensitive data in blinded HTML or JSON.

- [ ] **Step 7: Commit**

```bash
git add src/phase1/reviewWorkspace.ts src/semantic/phase1Annotations.ts src/phase1/artifactReview.ts src/server/phase1.ts tests/phase1ReviewWorkspace.test.ts tests/phase1ScienceUi.test.ts tests/securityPhase1.test.ts
git commit -m "feat: add authenticated blinded review and adjudication"
```

### Task 10: Harden M01-M08 and P1-A through P1-D gates

**Files:**
- Modify: `src/acceptance/phase01.ts`, `src/acceptance/gates.ts`, `src/phase1/analysis.ts`, `src/phase1/closure.ts`
- Test: `tests/phase1Gates.test.ts`, `tests/acceptanceMetrics.test.ts`

**Interfaces:**
- Use external statuses `NOT_EXERCISED`, `EXECUTED_BUT_INVALID`,
  `EXECUTED_BUT_MISSING`, `VALID` for M01.
- Produce `phase1GateStatus(db, campaignId): { P1A; P1B; P1C; P1D; blockers }`.
- Produce `BLOCKED_HUMAN_REVIEW` for P1-D whenever human labels, reliability or
  adjudication are absent; never return scientific pass from a mock-only run.

- [ ] **Step 1: Write gate regression tests**

Test missing S7, malformed ballot, orphan trace, unlocked dataset, unassigned
review and no human labels. Assert P1-B may pass observability while P1-D is
`BLOCKED_HUMAN_REVIEW`; assert M01 states are distinct.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/phase1Gates.test.ts tests/acceptanceMetrics.test.ts`  
Expected: FAIL because current gates conflate runtime completion and scientific
readiness and use only older M01 labels.

- [ ] **Step 3: Implement gate status derivation**

Make gates rederive source records, trace, snapshot lock and reviewer evidence.
P1-D may be ready only for human review; it never performs a significance test or
converts absence of labels into zero agreement.

- [ ] **Step 4: Run focused and full acceptance tests**

Run: `npx vitest run tests/phase1Gates.test.ts tests/acceptanceMetrics.test.ts tests/phase1Canonical.test.ts`  
Expected: PASS with explicit statuses and useful blocker codes.

- [ ] **Step 5: Commit**

```bash
git add src/acceptance src/phase1 tests/phase1Gates.test.ts tests/acceptanceMetrics.test.ts
git commit -m "fix: separate Phase 1 observability and human-review gates"
```

### Task 11: Add frozen calibration configuration and honest provider readiness

**Files:**
- Create: `configs/agora_phase1a_calibration.yaml`, `src/phase1/calibration.ts`, `tests/phase1Calibration.test.ts`
- Modify: `src/phase1/cli.ts`, `src/phase1/campaign.ts`, `docs/phase1/REVIEW.md`

**Interfaces:**
- Produce `calibrationManifest(config): FrozenCalibrationManifest` containing
  protocol/config/provider/model/deployment/params/tools/moderator/topic/schedule/
  budget/topology and all instrument hashes.
- Produce `providerReadiness(manifest, env): 'AVAILABLE'|'UNAVAILABLE'` without
  printing secrets.
- Produce `launchInstructions(manifest): string` for an authorized live provider.
- Produce CLI commands `phase1 calibration-manifest`, `phase1 calibration-ready`
  and `phase1 calibration-launch`; launch refuses unavailable live providers.

- [ ] **Step 1: Write config/readiness tests**

Assert five participants, no tools, fixed moderator, role-treatment-only
differences, frozen instrument hashes and `READY_FOR_LIVE_CALIBRATION` when the
provider URL/key is absent. Assert a mock provider cannot return live readiness.

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/phase1Calibration.test.ts`  
Expected: FAIL because no distinct calibration manifest/readiness contract exists.

- [ ] **Step 3: Add frozen YAML and manifest generator**

Use the existing config loader and provider registry. Keep credentials in environment
variables, record provider/model/deployment/version and fixed parameters, and include
all frozen instrument hashes. Do not include the separate LeoClaw service.

- [ ] **Step 4: Add honest readiness and launch behavior**

Preflight the configured live endpoint. If unavailable, emit a manifest and launch
instructions only. If available, run the campaign under the frozen config and write
run IDs, hashes and exports; never synthesize a live result.

- [ ] **Step 5: Run config, CLI and regression tests**

Run: `npx vitest run tests/phase1Calibration.test.ts tests/config.test.ts tests/phase1Campaign.test.ts`  
Expected: PASS with explicit unavailable state when no authorized live provider is
configured in the execution environment.

- [ ] **Step 6: Commit**

```bash
git add configs/agora_phase1a_calibration.yaml src/phase1/calibration.ts src/phase1/cli.ts src/phase1/campaign.ts tests/phase1Calibration.test.ts docs/phase1/REVIEW.md
git commit -m "feat: freeze Phase 1A calibration manifest and readiness"
```

### Task 12: Update protocol, review and closure documentation

**Files:**
- Create: `docs/phase1/PHASE1A_CLOSURE_STATUS.md`
- Modify: `docs/phase1/BEHAVIORAL_PROTOCOL.md`, `docs/phase1/CANONICAL_PROTOCOL.md`, `docs/phase1/SCIENTIFIC_ANALYSIS.md`, `docs/phase1/REVIEW.md`
- Test: `tests/phase1Documentation.test.ts`

**Interfaces:**
- Document `ENGINEERING_COMPLETE`, `READY_FOR_LIVE_CALIBRATION`,
  `READY_FOR_HUMAN_REVIEW`, `BLOCKED_HUMAN_REVIEW` and `CONFIRMATORY_READY`.
- State that role prompts are design instruments, not externally validated exact
  psychological measures.
- State that Phase 1B is inactive and that live/human evidence is required for
  scientific closure.

- [ ] **Step 1: Write documentation assertions**

Assert the closure report contains the PR base/head, branch/SHA, PR7 semantic
decision, all finding statuses, frozen instrument IDs/versions/hashes, P1-A to
P1-D statuses, test/build/audit commands, dataset/review package fields, live
availability and explicit blockers.

- [ ] **Step 2: Run the documentation test to verify failure**

Run: `npx vitest run tests/phase1Documentation.test.ts`  
Expected: FAIL because the closure report and new state vocabulary are absent.

- [ ] **Step 3: Write the closure report from generated evidence**

Use a reproducible report template with no hard-coded live run IDs or fabricated
human values. Put unavailable provider state and remaining human blockers in the
report when those conditions are true.

- [ ] **Step 4: Run documentation and link checks**

Run: `npx vitest run tests/phase1Documentation.test.ts tests/phase1ScienceUi.test.ts`  
Expected: PASS with all claims bounded to available evidence.

- [ ] **Step 5: Commit**

```bash
git add docs/phase1 tests/phase1Documentation.test.ts
git commit -m "docs: define Phase 1A calibration closure states"
```

### Task 13: Execute verification, independent review and GitHub delivery

**Files:**
- Modify: implementation files only when a verified review finding requires it.
- Create: generated local evidence outside Git or the committed closure report.

- [ ] **Step 1: Run complete local verification**

```powershell
npm test
npm run build
git diff --check origin/codex/phase1a-canonical-closure...HEAD
npm audit --audit-level=high
npm audit --omit=dev
```

Expected: tests/build/audit return zero and diff check returns zero. Run the Phase
0 mock regression and the Phase 1 canonical, mock, security and review suites
separately.

- [ ] **Step 2: Run an independent code/security review**

Inspect the branch diff against PR #9 for authorization bypasses, sensitive GET
leaks, trace omissions, semantic outcome conflation, snapshot mutation and claims
that exceed evidence. Re-run every finding as a test or record it as an explicit
remaining blocker; a green build is not a security review.

- [ ] **Step 3: Check live provider without exposing credentials**

Inspect only whether the authorized provider endpoint and required key are present.
Run preflight through the configured provider if available. If unavailable, create
the frozen manifest and launch instructions and report `READY_FOR_LIVE_CALIBRATION`.
Never replace the provider with a mock and never fabricate labels, reliability or
live run IDs.

- [ ] **Step 4: Create the stacked PR**

```powershell
git push -u origin codex/phase1a-pre-human-review-closure
gh pr create --repo criticaldata/agoraworkshop --base codex/phase1a-canonical-closure --head codex/phase1a-pre-human-review-closure --title "Phase 1A: close engineering and calibration review gates" --body-file docs/phase1/PR_BODY.md
```

Use the current PR #9 head as base; do not merge PR #9, close it, rewrite Simon's
branch or claim that the new PR is merged. Re-query PR #9 before creating the PR
and adjust the base only if its state changed.

- [ ] **Step 5: Record the final report**

Include exact branch/head/PR URL, verification outputs, finding dispositions,
instrument hashes, dataset/review package status, live availability/execution
state, P1-A/P1-B/P1-C/P1-D, human-review blockers and Phase 1B inactive status.

- [ ] **Step 6: Commit only final report corrections and push**

```powershell
git add docs/phase1/PHASE1A_CLOSURE_STATUS.md
git commit -m "docs: record Phase 1A pre-human-review verification"
git push
```

## Self-review checklist

- [ ] Every spec section has an implementation task.
- [ ] Every task contains concrete implementation content and explicit error behavior.
- [ ] All named interfaces are defined before a later task consumes them.
- [ ] Each production change has a failing test before implementation.
- [ ] Live provider unavailability has a truthful output path and cannot satisfy scientific gates.
- [ ] Phase 1B remains out of scope and inactive.
