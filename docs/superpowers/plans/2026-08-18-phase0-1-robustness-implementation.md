# Phase 0.1 Robustness Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend Phase 0 to verify context summaries, end-to-end traces, deterministic tool failures, restart recovery, a context-contract mock, moderator boundaries, and a separately gated live canary.

**Architecture:** Preserve existing Phase 0 baseline evidence. Add versioned opt-in Phase 0.1 config blocks. Persist new operational records beside raw events/messages. The deterministic tool probe is runtime-scheduled, never LLM-selected; the context-contract mock proves inputs mechanically rather than simulating social intelligence.

**Tech Stack:** TypeScript, Zod, better-sqlite3, Vitest, YAML.

---

### Task 1: Extend frozen configuration

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `tests/config.test.ts`
- Add: `configs/agora_phase0_1_context_contract.yaml`
- Add: `configs/agora_phase0_1_tool_faultdemo.yaml`
- Add: `configs/agora_phase0_1_moderator_scripted.yaml`
- Add: `configs/agora_phase0_1_live_canary.yaml`

1. Write failing parser tests for versioned summary, structured tool manifest/probe, recovery, and live-canary conditions. Reject a private summary exposed publicly, unauthorized probes, and mock live canaries.
2. Run `npm test -- tests/config.test.ts`; verify the missing contract fails.
3. Add typed `ToolManifestEntry`, `SummaryPolicy`, `ToolProbePolicy`, `RecoveryPolicy`; preserve legacy manifests and hash compatibility.
4. Rerun the focused tests.
5. Commit: `git commit -m "Add Phase 0.1 configuration contracts"`.

### Task 2: Persist causal traces and channel-aware summaries

**Files:**
- Modify: `src/db/schema.ts`, `src/db/index.ts`, `src/db/queries.ts`, `src/events/types.ts`
- Modify: `src/orchestrator/context.ts`
- Add: `src/orchestrator/summaries.ts`
- Add: `tests/contextSummaries.test.ts`
- Modify: `tests/routing.test.ts`

1. Write failing tests: one opportunity creates immutable trace ID; context has hash/source IDs; summaries contain only visible messages; private summaries cannot reach public contexts; tampering fails fidelity audit.
2. Run `npm test -- tests/contextSummaries.test.ts tests/routing.test.ts`; verify failure.
3. Add only additive SQLite migrations/tables: summaries, summary sources, checkpoints, tool calls, deliveries. Add nullable trace IDs to opportunities/invocations/messages/events. Generate one trace per opportunity and propagate it through all downstream records. Add scope-separated rolling summaries and visibility checks.
4. Rerun focused tests.
5. Commit: `git commit -m "Add traceable channel-aware context summaries"`.

### Task 3: Add context-contract mock

**Files:**
- Add: `src/providers/mockContextContract.ts`
- Modify: `src/providers/registry.ts`, `src/providers/types.ts`, `src/config/schema.ts`
- Add: `tests/contextContractProvider.test.ts`
- Modify: `tests/provenance.test.ts`

1. Write failing tests for deterministic JSON output hashed from system prompt, rendered messages, visible IDs, summaries, config, capabilities, and trace.
2. Run `npm test -- tests/contextContractProvider.test.ts`; verify it fails because provider is absent.
3. Implement `mock_context_contract` using canonical JSON plus SHA-256, not natural-language simulation.
4. Rerun provider and provenance tests.
5. Commit: `git commit -m "Add context-contract mock provider"`.

### Task 4: Add deterministic tool gateway and fault injection

**Files:**
- Add: `src/tools/types.ts`, `src/tools/gateway.ts`, `src/tools/deterministicEcho.ts`
- Modify: `src/config/schema.ts`, `src/events/types.ts`, `src/orchestrator/runner.ts`, `src/export/exporter.ts`
- Add: `tests/toolGateway.test.ts`, `tests/toolFaultAttribution.test.ts`

1. Write failing tests for a scheduled echo probe with trace ID; unauthorized tool; timeout/invalid/unavailable tool failures; retry without duplicate action; private tool result isolation.
2. Run `npm test -- tests/toolGateway.test.ts tests/toolFaultAttribution.test.ts`; verify failure.
3. Implement allow-list gateway with only deterministic echo. Record start/success/failure events and typed tool-call records. Schedule configured probes after context assembly and expose only authorized output. Add tool fault kinds and distinguish tool vs provider attempts.
4. Run focused tests plus `tests/failureAttribution.test.ts`.
5. Commit: `git commit -m "Add deterministic tool gateway validation"`.

### Task 5: Add checkpoint/resume and backup/restore verification

**Files:**
- Modify: `src/orchestrator/runner.ts`, `src/orchestrator/reconcile.ts`, `src/db/queries.ts`, `src/cli.ts`
- Add: `src/orchestrator/recovery.ts`, `tests/recoveryResume.test.ts`
- Modify: `tests/reconcile.test.ts`

1. Write failing test that interrupts after a checkpoint, resumes frozen state/history/budgets, skips resolved opportunities, and emits no duplicate messages/deliveries. Add backup/restore hash round-trip test.
2. Run `npm test -- tests/recoveryResume.test.ts tests/reconcile.test.ts`; verify failure.
3. Persist checkpoint transactions after each resolution/state transition. Keep legacy reconcile behavior when recovery is disabled. Add resume only for explicitly enabled runs and CLI backup/restore verification.
4. Rerun focused tests.
5. Commit: `git commit -m "Add recoverable Phase 0.1 checkpoints"`.

### Task 6: Add exports and M23-M30

**Files:**
- Modify: `src/acceptance/metrics.ts`, `src/acceptance/gates.ts`, `src/acceptance/summary.ts`
- Modify: `src/export/exporter.ts`, `src/export/bundleContract.ts`, `src/export/replayHtml.ts`
- Modify: `tests/acceptanceMetrics.test.ts`, `tests/exportBundle.test.ts`

1. Write failing tests that M23 context material, M24 summary provenance, M25 trace completeness, M26 tool attribution, M27 recovery idempotency, M28 backup/restore, M29 moderator boundary, M30 live canary report NOT_EXERCISED absent evidence. Assert new bundle artifacts.
2. Run focused metric/export tests; verify failure.
3. Add M23-M30 separately from existing Gates 1-3. Export `summaries.jsonl`, `tool_calls.jsonl`, `checkpoints.jsonl`, `trace_index.jsonl` and hashes.
4. Rerun focused tests and ensure M1-M22 expectations remain unchanged.
5. Commit: `git commit -m "Export Phase 0.1 provenance metrics"`.

### Task 7: Validate moderator boundary and live-canary contract

**Files:**
- Modify: `src/providers/scriptedModerator.ts`, `src/orchestrator/runner.ts`, `src/scripts/validate.ts`
- Modify: `docs/known-issues.md`, `README.md`, `tests/scriptedModerator.test.ts`
- Add: `tests/liveCanaryContract.test.ts`

1. Write failing tests for moderator private-access boundary, traced scripted interventions, and live canary requiring actual adapter credentials plus linked baseline/rerun/fault/export evidence.
2. Run `npm test -- tests/scriptedModerator.test.ts tests/liveCanaryContract.test.ts`; verify failure.
3. Persist moderator policy/script version and add explicit live-canary command. Never freeze/export secrets. Keep live canary NOT_EXERCISED until the operator supplies a paid adapter.
4. Rerun focused tests.
5. Commit: `git commit -m "Add moderator and live canary Phase 0.1 gates"`.

### Task 8: Deterministic validation and evidence report

**Files:**
- Add: `docs/phase0-1-validation.md`
- Modify: `docs/known-issues.md`

1. Run `npm test` and `npm run build`.
2. Execute a linked deterministic validation package from the new context-contract and tool-fault configs.
3. Inspect report, manifest, trace index, summaries, tool calls, checkpoint artifacts, and `git diff --check`.
4. Document only measured status. Retain explicit limitations: this verifies apparatus, not roles, social behavior, CommonTrace value, or real-provider performance.
5. Commit: `git commit -m "Document Phase 0.1 validation evidence"`.
