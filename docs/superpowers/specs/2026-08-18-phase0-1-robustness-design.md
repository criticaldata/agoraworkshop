# AGORA Phase 0.1 robustness design

## Purpose

Phase 0.1 strengthens the research instrument before any role, memory, CommonTrace,
or capability treatment is introduced. It must make the exact material visible to an
agent, every attempted external action, and recovery after interruption auditable.
It does not make claims about agent social behaviour.

Phase 0 remains the technical control. Phase 1A will vary role packs only. Phase 1B
will vary capabilities only. CommonTrace is out of scope for Phase 0.1.

## Scope and success criteria

Phase 0.1 adds five core capabilities:

1. Channel-aware rolling summaries with immutable source provenance and fidelity audit.
2. A logical-turn `trace_id` propagated through opportunities, invocations, retries,
   messages, deliveries, summaries, tool probes, and derived analyses.
3. A deterministic tool gateway and fault-injection contract, without granting any
   participant a real external tool.
4. Durable checkpoints, resume-safe message/delivery persistence, and SQLite
   backup/restore verification.
5. A context-contract mock provider that proves the full rendered request matches the
   authorized configuration and visible history.

The release also supplies, but does not automatically execute, a three-agent live
canary configuration and scripted-versus-LLM moderator validation configurations.
They require an operator-provided provider key and remain clearly separate from mock
evidence.

Phase 0.1 is accepted only when all existing M1-M22 checks remain green and the new
robustness checks pass on their dedicated validation set. A missing live credential is
reported as `NOT_EXERCISED`, never as a mock pass.

## Non-goals

- No participant role packs, personalities, goals, or memory treatments.
- No CommonTrace or other live retrieval service.
- No free-form LLM tool-calling loop; Phase 0 tests the gateway through deterministic
  probes only.
- No voting, coalition incentive, or behavioural outcome claim.
- No silent model fallback or unrecorded recovery action.

## Architecture

```text
Frozen configuration
  -> logical response opportunity (trace_id)
  -> checkpointed invocation / retry attempts
  -> optional deterministic tool probe
  -> context assembly (authorized raw messages + authorized summaries)
  -> provider response
  -> idempotent message and delivery persistence
  -> events, exports, acceptance metrics, analysis
```

Every component receives the same immutable run configuration. Derived data never
replaces raw messages; it references them by identifier and is exported as an
additional artifact.

## 1. Context and summary integrity

### Configuration

Add a versioned `context_policy.summarization` block:

- `enabled`: boolean.
- `checkpoint_every_messages`: positive integer.
- `recent_raw_messages`: positive integer.
- `provider`: `deterministic_contract` or a declared model-backed summarizer.
- `prompt_version`: required version string.
- `visibility_domains`: public, breakout-specific, and agent-private.

Existing Phase 0 configurations retain `enabled: false`, preserving their current hash
and meaning. Dedicated Phase 0.1 configurations enable deterministic summaries.

### Storage and provenance

Persist one summary record per visibility domain and checkpoint with:

- `summary_id`, `run_id`, and `trace_id`.
- visibility scope and, when applicable, breakout group or agent id.
- ordered `source_message_ids`.
- content, `content_hash`, summarizer provider/model, prompt version and prompt hash.
- generated event sequence and refresh checkpoint.

Raw messages remain immutable. A context record states exactly which raw messages and
summary ids were rendered. No summary can be selected unless every source message is
authorized for that context.

### Fidelity audit

Automated audit verifies source completeness, order, scope, hashes, and that no
private source is reachable from a public context. A sampled export includes summary,
source records, and a human-review rubric for semantic fidelity; it does not claim an
automatic semantic proof.

## 2. End-to-end traceability

`trace_id` identifies one logical response opportunity and is generated before any
provider or tool attempt. Attempt ids remain distinct but reference the same trace.

The following records must carry it: opportunity, invocation, retry event, tool probe,
tool result, summary created during the turn, final message, each delivery, semantic
extraction, and export manifest entry. Existing event sequence remains the temporal
order; `trace_id` is the causal join key.

New acceptance checks require 100% trace propagation and reject orphan records. The
replay and exports expose the chain for a selected trace.

## 3. Deterministic tool gateway

Introduce a provider-neutral `ToolGateway` with a structured manifest and a
deterministic `echo` probe tool. It is invoked by a frozen Phase 0 probe schedule, not
by an LLM choosing tools.

Each probe records authorization decision, input hash, result hash, visibility scope,
latency, attempt, and failure category. The gateway must reject unauthorized agent,
channel, and tool requests before execution.

Fault injection adds `tool_timeout`, `tool_unavailable`, `tool_malformed_result`, and
`tool_permission_denied`. Retried probes use a stable idempotency key derived from
`trace_id`, tool id, and attempt. Tool results are visible only to the configured
scope; a public context cannot include a private result.

The gateway is an infrastructure contract for Phase 0. It is not CommonTrace and does
not add a real external capability to a participant.

## 4. Checkpoint, recovery, and backup

Persist a checkpoint after each durable state transition and after each terminal
attempt outcome. A checkpoint records current state, next scheduled opportunity,
in-flight trace/attempt when present, and a monotonic checkpoint sequence.

Resume rules are conservative:

- An opportunity with a committed final message is never invoked or delivered again.
- Deliveries have a unique message-recipient key; resume fills only missing deliveries.
- An in-flight external provider request without a durable terminal result is marked
  `indeterminate`; it may be retried as a new recorded attempt, but duplicate message
  persistence is prevented by the opportunity idempotency key.
- Deterministic tools receive stable idempotency keys and may resume safely.
- Every recovery action is an event linked to the original trace.

Provide `backup` and `restore --verify` CLI actions. Restore verification checks
SQLite integrity, required tables, artifact hashes, event continuity, and the ability
to replay the restored run.

Fault tests simulate interruption before invocation, after invocation, after message
persistence, and during delivery. They assert no duplicate stored message, delivery,
or terminal transition.

## 5. Context-contract mock provider

Retain the current `mock-deterministic-v1` for basic apparatus tests. Add
`mock-context-contract-v1`, which returns a deterministic payload derived from:

- agent id and trace id;
- frozen config hash and capability-manifest hash;
- system prompt hash;
- ordered context message ids and full rendered-context hash;
- included summary ids and hashes;
- final turn instruction and visibility scope.

Acceptance recomputes this payload independently from stored artifacts. A mismatch
proves that the assembled request, not merely its event count, was wrong. This mock is
not a behavioural simulator and must never support a claim about deliberation.

## Validation matrix and new metrics

| Check | Dedicated evidence | Pass condition |
| --- | --- | --- |
| M23 Context material equality | context-contract run | rendered prompt, authorized raw ids, summary ids, and hashes match independently recomputed material |
| M24 Summary scope and provenance | summary run | source ids, order, hashes, checkpoint, and visibility scope are complete; zero private-to-public leaks |
| M25 Trace completeness | all Phase 0.1 runs | every required persisted record joins to exactly one trace; no orphan trace records |
| M26 Tool-gateway attribution | tool-fault run | each declared tool fault is classified, retried as configured, and never exposed outside its scope |
| M27 Recovery idempotency | restart matrix | zero duplicate final messages, deliveries, or terminal transitions after resume |
| M28 Backup/restore integrity | restore run | database and exported artifacts verify after restore and replay remains available |
| M29 Moderator boundary integrity | scripted and LLM moderator runs | moderator neither sees unauthorized private content nor changes scheduling/state outside the runtime |
| M30 Live-adapter canary | operator-run live package | baseline, rerun, fault run, export, and existing gates pass under a declared live provider |

M23-M29 are required for mock Phase 0.1 closure. M30 is an operational requirement and
remains `NOT_EXERCISED` until a key is deliberately supplied; it cannot be substituted
with mock evidence.

## Configurations

- `agora_phase0_1_context_contract.yaml`: deterministic summary and context contract.
- `agora_phase0_1_tool_fault_matrix.yaml`: authorized and unauthorized deterministic tool
  probes with all tool fault classes.
- `agora_phase0_1_restart_matrix.yaml`: fault points for checkpoint/resume tests.
- `agora_phase0_1_nvidia_vllm_moderator_scripted.yaml`: fixed protocol moderator.
- `agora_phase0_1_nvidia_vllm_live_canary.yaml`: 2-3 participants, one short round, provider key
  required; paired with a live fault configuration.

The existing five-agent mock package remains a stress/compatibility validation. The
three-agent live canary is the minimum provider-path check. Five-role experiments
belong to Phase 1A, not this design.

## Security and failure handling

- Tool manifests are frozen and hashed with the run configuration.
- Tool input/output content is redacted from public exports when its visibility scope
  is private; hashes and provenance remain auditable.
- Provider and tool credentials remain environment-only and are never exported.
- Recovery refuses unknown checkpoint versions, altered config hashes, and missing
  trace links rather than guessing.
- Live canary runs require explicit operator configuration and never fall back to a
  different model or provider.

## Test strategy

Tests precede implementation and cover schema migration, summary scope, context
contract payload, tool authorization/faults, checkpoint boundaries, restore failure,
and moderator isolation. Existing M1-M22 tests remain unchanged and must pass.

Integration validation runs the full mock matrix, exports all artifacts, verifies
every manifest hash, and replays restored data. Live validation is a separately
reported, opt-in operational test.

## Delivery sequence

1. Schema/config/provenance and trace propagation.
2. Context summaries and context-contract mock.
3. Tool gateway and declared tool faults.
4. Checkpoint/resume plus backup/restore.
5. Moderator boundary configuration and tests.
6. New acceptance metrics, export/replay views, documentation, and validation matrix.
7. Live canary once a provider key is intentionally configured.

## Decision record

The current Phase 0 mock result remains valid evidence for its frozen configuration.
Phase 0.1 creates new configurations and acceptance evidence; it does not rewrite or
upgrade old runs. Role packs and CommonTrace remain excluded so later behavioural or
capability effects can be attributed without confounding.
