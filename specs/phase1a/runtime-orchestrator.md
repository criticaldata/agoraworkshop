# Runtime orchestrator

Status: **PROPOSED**

## State machine

`CREATED → T0 → ROUND_1 … ROUND_6 → T1 → [REPORT_DRAFT → REVIEW_1/REVIEW_2 → REPORT_REVISED → T2] → COMPLETE`

`FAILED` and `CANCELLED` are terminal states. Partial evidence is retained.

## Requirements

- `ORCH-01` — The host advances the state machine from the approved run manifest.
- `ORCH-02` — A state transition is committed only after its required evidence records are persisted.
- `ORCH-03` — Public turns receive only the public history and explicitly approved common context.
- `ORCH-04` — Private checkpoints receive the common prompt and agent-specific context, never another agent’s private output.
- `ORCH-05` — Provider adapters return a common response envelope while preserving provider-native raw fields.
- `ORCH-06` — Each call records model identifier, parameters, prompt/context hash, start/end time, result status, attempt count, and raw artifact reference.
- `ORCH-07` — Retries follow the approved retry policy and are separate attempts, not overwritten records.
- `ORCH-08` — `abstained` or `refused` is a completed model outcome; `timeout`, `provider_error`, and `invalid_response` are technical failures.
- `ORCH-09` — The core protocol never shortens a run automatically.
- `ORCH-10` — Resuming a run reconstructs state from persisted evidence and cannot duplicate an already committed turn.
- `ORCH-11` — Budget and rate-limit enforcement emits explicit events and never silently truncates context.

## Minimal interfaces

```text
create_run(manifest) -> run_id
advance(run_id) -> committed_state
dispatch(call_spec) -> response_envelope
resume(run_id) -> reconstructed_state
export_evidence(run_id) -> evidence_bundle
```

## Failure examples

- Provider timeout: preserve the attempt, apply retry policy, and record the final transition.
- Invalid structured response: retain raw output, mark validation failure, and do not treat it as abstention.
- Host restart: reconstruct the last committed state and continue without replaying committed calls.
