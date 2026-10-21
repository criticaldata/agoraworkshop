# Evidence schema

Status: **PROPOSED**

## Event envelope

Every persisted event contains:

```json
{
  "schema_version": "phase1a-0.1",
  "event_id": "uuid",
  "run_id": "uuid",
  "sequence": 1,
  "event_type": "run.created",
  "visibility": "public|private-agent|reviewer-isolated|operator",
  "actor_id": "host-or-agent-id",
  "created_at": "RFC3339 timestamp",
  "payload": {},
  "artifact_refs": [],
  "previous_event_hash": "sha256-or-null",
  "event_hash": "sha256"
}
```

## Provider-call record

- `EVD-01` — Record provider, exact model identifier, configuration, attempt number, request start/end, and terminal status.
- `EVD-02` — Record hashes for system prompt, user prompt, assembled context, and raw response.
- `EVD-03` — Store token/usage data when returned; absence is explicit, not zero.
- `EVD-04` — Keep raw provider responses in an access-controlled artifact and normalized fields in the event stream.
- `EVD-05` — Preserve all attempts and link a successful retry to preceding failures.

## Required event families

`run.*`, `checkpoint.*`, `round.*`, `provider_call.*`, `report.*`, `validation.*`, `protocol_deviation.*`, `run.completed`, `run.failed`.

## Integrity

- `EVD-06` — Sequence numbers are unique and monotonic within a run.
- `EVD-07` — Hash chaining detects removal or reordering of events.
- `EVD-08` — Derived metrics reference the exact event IDs and algorithm version used.
- `EVD-09` — Exports include the manifest, schema version, artifacts index, and integrity verification result.
