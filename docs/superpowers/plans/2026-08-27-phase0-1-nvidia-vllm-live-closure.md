# AGORA Phase 0.1 NVIDIA VLLM Live Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a truthful NVIDIA VLLM provider path, complete the Phase 0.1 acceptance contract, and run auditable mock, preflight, and live canary evidence through the authorized Brev service.

**Architecture:** Keep the existing mock providers and M1–M22 behavior unchanged. Add a provider-specific `nvidia_vllm` adapter over the VLLM OpenAI-compatible HTTP endpoint, with an explicit Qwen3 no-thinking request contract. Link baseline, rerun, fault, and export evidence through the acceptance layer so M30 cannot pass from one live run.

**Tech Stack:** TypeScript, native `fetch`, Zod, better-sqlite3, Vitest, YAML, SSH local forwarding, VLLM 0.25.1.

**Spec:** `docs/superpowers/specs/2026-08-27-phase0-1-nvidia-vllm-live-closure-design.md`

## Global Constraints

- The canonical remote resource is `mit-critical-data-1`; do not create, stop, restart, resize, or reconfigure a Brev instance.
- GPU 0 was observed occupied by an existing root-owned VLLM service; use its authorized loopback endpoint through SSH and do not touch its process lifecycle.
- The live endpoint is `http://127.0.0.1:8002/v1`, model `leoclaw-qwen3-32b`, VLLM `0.25.1`, and the adapter identity is `nvidia_vllm`.
- The NVIDIA request uses `/v1/chat/completions`, a `system` message, `max_tokens`, and `chat_template_kwargs.enable_thinking=false`.
- `NVIDIA_VLLM_BASE_URL` is required; `NVIDIA_VLLM_API_KEY` is optional and credentials never enter logs, exports, configs, or Git.
- Keep the existing mock validation package and its hashes unchanged; new evidence must be stored in a new task directory under `/data/AGORA/temporary_artifacts/`.
- M30 requires linked baseline, same-config rerun, fault run, complete exports, and Gates 1–3 PASS; one completed live run is insufficient.
- Tests precede production changes; every new behavior has a failing test run recorded before implementation.

---

### Task 1: Add the explicit NVIDIA VLLM provider contract

**Files:**
- Create: `src/providers/nvidiaVllm.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/providers/registry.ts`
- Create: `tests/nvidiaVllmAdapter.test.ts`
- Modify: `tests/config.test.ts`

**Interfaces:**
- Consumes: `AgentInvocationRequest`, `AgentInvocationResult`, `AgentProvider`, and `failureResult` from `src/providers/types.ts`.
- Produces: `NvidiaVllmProvider`, `buildNvidiaVllmRequestPayload(request)`, and `NvidiaVllmProviderOptions { baseURL?: string; apiKey?: string; fetchImpl?: typeof fetch }`.

- [ ] **Step 1: Write the failing contract tests.** Add tests that assert `nvidia_vllm` is accepted by the config schema and registry, that a payload contains `model`, `max_tokens`, a leading `system` message, and `chat_template_kwargs.enable_thinking=false`, and that `max_completion_tokens`, `reasoning_effort`, and `top_k` are absent. Add an injected-fetch invocation test for a valid VLLM response, HTTP 429, timeout/abort, malformed JSON, and an empty choices array.

- [ ] **Step 2: Run the focused tests and verify RED.** Run `npm test -- tests/nvidiaVllmAdapter.test.ts tests/config.test.ts`. The failure must identify the missing provider or payload contract, not a test syntax error.

- [ ] **Step 3: Implement the minimal adapter.** Use native `fetch` with `AbortController`; join `NVIDIA_VLLM_BASE_URL` with `/chat/completions`; use `NVIDIA_VLLM_API_KEY` or the non-secret `local-no-auth` placeholder; disable SDK retries; parse the VLLM response into the existing result shape; classify timeout, 429, network, provider, malformed response, and refusal categories; persist only response id, model, fingerprint, finish reason, usage, wire protocol, and thinking-control metadata.

- [ ] **Step 4: Run focused tests and verify GREEN.** Run the same focused command and then `npm run build`.

- [ ] **Step 5: Commit.** Run `git add src/providers/nvidiaVllm.ts src/config/schema.ts src/providers/registry.ts tests/nvidiaVllmAdapter.test.ts tests/config.test.ts` and commit with `feat: add NVIDIA VLLM provider contract`.

### Task 2: Add provider preflight and dedicated canary configurations

**Files:**
- Create: `src/providers/nvidiaVllmProbe.ts`
- Modify: `src/cli.ts`
- Create: `tests/nvidiaVllmProbe.test.ts`
- Create: `configs/agora_phase0_1_nvidia_vllm_live_canary.yaml`
- Create: `configs/agora_phase0_1_nvidia_vllm_live_fault.yaml`
- Create: `configs/agora_phase0_1_nvidia_vllm_moderator_scripted.yaml`
- Modify: `README.md`
- Modify: `docs/known-issues.md`

**Interfaces:**
- Consumes: `NvidiaVllmProviderOptions` and `freezeConfig` conventions.
- Produces: `probeNvidiaVllm(options): Promise<NvidiaVllmProbeResult>` and CLI command `agora provider-probe --provider nvidia_vllm --model leoclaw-qwen3-32b --out ./phase0_1_provider_preflight`.

- [ ] **Step 1: Write failing preflight tests.** Test that the probe calls `/models`, `/version`, and one chat completion with the exact endpoint and no-thinking body; rejects a model mismatch and an HTTP failure; and redacts any authorization value from its returned JSON.

- [ ] **Step 2: Run `npm test -- tests/nvidiaVllmProbe.test.ts` and verify RED.** The expected failure is the absent probe function/CLI behavior.

- [ ] **Step 3: Implement the probe and CLI.** Require `NVIDIA_VLLM_BASE_URL`, accept the model as an argument, record only non-secret endpoint/model/version/fingerprint/chat result metadata, write a JSON preflight receipt to the requested directory, and return nonzero on failed qualification. Do not auto-start VLLM or create a Brev node.

- [ ] **Step 4: Add three-agent configs.** The baseline and fault configs use provider `nvidia_vllm`, model `leoclaw-qwen3-32b`, `thinking: disabled`, `temperature: 0`, a short one-round workshop, three participants, and an LLM moderator. The fault config adds a recoverable provider fault while preserving the same model endpoint; the scripted config uses the same apparatus with `moderator.mode: scripted`.

- [ ] **Step 5: Run focused tests, parse every config, and build.** Run `npm test -- tests/nvidiaVllmProbe.test.ts tests/config.test.ts`, `npm run agora -- hash --config configs/agora_phase0_1_nvidia_vllm_live_canary.yaml`, `npm run agora -- hash --config configs/agora_phase0_1_nvidia_vllm_live_fault.yaml`, `npm run agora -- hash --config configs/agora_phase0_1_nvidia_vllm_moderator_scripted.yaml`, and `npm run build`.

- [ ] **Step 6: Commit.** Commit as `feat: add NVIDIA VLLM preflight and canary configs`.

### Task 3: Harden the linked live-canary and provenance acceptance contract

**Files:**
- Modify: `src/acceptance/phase01.ts`
- Modify: `src/acceptance/gates.ts`
- Modify: `src/acceptance/metrics.ts`
- Modify: `src/export/exporter.ts`
- Modify: `src/scripts/validate.ts`
- Modify: `src/export/bundleContract.ts`
- Create: `tests/liveCanaryAcceptance.test.ts`
- Modify: `tests/phase01.test.ts`
- Modify: `tests/exportBundle.test.ts`

**Interfaces:**
- Produces: `LiveCanaryLink { baselineRunId: string; rerunRunId: string; faultRunId: string; }` passed through `ExportOptions`, `EvaluateGatesOptions`, and `Phase01EvaluationOptions`.
- Produces: M30 evidence that names all linked runs, their providers/models/config hashes, required bundle files, and the three core gate statuses.

- [ ] **Step 1: Write failing acceptance tests.** Test that M30 is `FAIL` when only one live run is exported; that it is `NOT_EXERCISED` when no live provider exists; that baseline and rerun must share a config hash; that the fault run must be a completed non-mock run with a different fault-enabled config; and that missing required exports or any core gate status other than PASS fails M30.

- [ ] **Step 2: Run `npm test -- tests/liveCanaryAcceptance.test.ts tests/phase01.test.ts tests/exportBundle.test.ts` and verify RED.** Confirm the existing single-run M30 behavior is what the new test catches.

- [ ] **Step 3: Implement the link contract.** Thread `LiveCanaryLink` through validation/export/gate calls; write `live_canary_link.json` into the package; make M30 validate all runs and hashes without recursively evaluating itself; make the validator pass the link for baseline/rerun/fault; add the link artifact to the bundle contract and README.

- [ ] **Step 4: Strengthen M25–M29 checks in the same acceptance path.** M25 must inspect deliveries, retry events, semantic extraction rows, and manifest trace entries; M26 must distinguish all declared tool fault classes; M27 must count duplicate final messages as well as deliveries/transitions; M28 must verify restored export hashes and replay availability; M29 must expose scripted versus LLM moderator status rather than reporting a scripted-only PASS.

- [ ] **Step 5: Run focused tests and build.** Run the command from Step 2 plus `npm run build`.

- [ ] **Step 6: Commit.** Commit as `test: require linked evidence for Phase 0.1 closure`.

### Task 4: Complete the deterministic robustness matrices and audit documentation

**Files:**
- Modify: `src/tools/gateway.ts`
- Modify: `src/providers/faultInjection.ts`
- Modify: `src/orchestrator/recovery.ts`
- Modify: `src/db/backup.ts`
- Modify: `src/acceptance/phase01.ts`
- Create: `tests/toolFaultMatrix.test.ts`, `tests/restartMatrix.test.ts`, `tests/backupRestoreReplay.test.ts`, `tests/traceCompleteness.test.ts`
- Create: `configs/agora_phase0_1_tool_fault_matrix.yaml`
- Create: `configs/agora_phase0_1_restart_matrix.yaml`
- Modify: `docs/audits/PHASE_0_AND_0_1_CLOSURE_AUDIT_2026-08-26.md`

**Interfaces:**
- Consumes: existing gateway, recovery, backup, event, and export records.
- Produces: independent end-to-end evidence for every declared Phase 0.1 fault/restart/restore condition and a documented semantic-review limitation for extractive summaries.

- [ ] **Step 1: Write failing matrix tests.** Add one test per tool fault (`tool_timeout`, `tool_unavailable`, `tool_invalid_response`, and permission denial), four restart cut points, restore export hash equality/replay, orphan delivery/retry/analysis/manifest trace rejection, and a sampled summary rubric artifact.

- [ ] **Step 2: Run focused matrix tests and verify RED.** Run `npm test -- tests/toolFaultMatrix.test.ts tests/restartMatrix.test.ts tests/backupRestoreReplay.test.ts tests/traceCompleteness.test.ts`.

- [ ] **Step 3: Implement only the missing checks and fixtures.** Keep deterministic tool scheduling; add missing fault injection and authorization evidence; make restart fixtures use the production resume path; make restore verification reopen the database, regenerate the bundle, compare hashes, and render replay; make M25 independent of the manifest's own trace assertion.

- [ ] **Step 4: Run all focused tests and the full suite.** Run the focused command, `npm test`, and `npm run build`.

- [ ] **Step 5: Commit.** Commit as `test: close deterministic Phase 0.1 robustness matrices`.

### Task 5: Execute mock, preflight, and NVIDIA GPU 0 evidence campaign

**Files:**
- Create: `ops/phase0-1-nvidia-vllm-preflight.ps1`
- Create: `ops/phase0-1-nvidia-vllm-live.ps1`
- Modify: `docs/phase0-1-validation.md`
- Create: `docs/audits/PHASE_0_AND_0_1_NVIDIA_VLLM_CAMPAIGN_2026-08-27.md`

**Interfaces:**
- Consumes: the committed configs, CLI, provider probe, local SSH tunnel, and `/data/AGORA` storage contract.
- Produces: a task-scoped preflight receipt, mock validation package, live baseline/rerun/fault/scripted packages, hash manifest, and a campaign report.

- [ ] **Step 1: Run the full local verification before remote calls.** Run `npm test`, `npm run build`, `git diff --check`, and hash/parse every new config.

- [ ] **Step 2: Run the required remote preflight.** Check `brev ls` if authenticated, `hostname`, `df -h /data`, `nvidia-smi`, and GPU-process ownership. Use the already authorized SSH endpoint only; write under `/data/AGORA/temporary_artifacts/20260827_agora_phase0_1_nvidia_vllm/`.

- [ ] **Step 3: Run the mock validation package.** Execute the existing five-participant mock config and the full deterministic matrices. Preserve its output and record exact IDs/hashes.

- [ ] **Step 4: Open a temporary SSH tunnel and run NVIDIA preflight.** Use `NVIDIA_VLLM_BASE_URL=http://127.0.0.1:18002/v1`, model `leoclaw-qwen3-32b`, and archive `/v1/models`, `/version`, and no-thinking chat qualification without credentials.

- [ ] **Step 5: Run the linked live campaign.** Run baseline, exact-config rerun, recoverable fault run, scripted moderator run, exports, backup/restore verification, and replay. Do not stop or restart the existing VLLM process. If the existing service changes or becomes unavailable, record a blocked preflight and leave M30 `NOT_EXERCISED`.

- [ ] **Step 6: Verify evidence independently.** Recompute config/artifact hashes, confirm no secret strings, inspect all M1–M30 statuses, and record model/server/GPU provenance and limitations.

- [ ] **Step 7: Commit the report and scripts.** Commit as `docs: record NVIDIA VLLM Phase 0.1 campaign`.
