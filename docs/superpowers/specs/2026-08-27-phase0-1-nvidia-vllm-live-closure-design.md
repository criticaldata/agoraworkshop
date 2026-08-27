# AGORA Phase 0.1 NVIDIA VLLM Live Closure Design

## Decision

Use the NVIDIA-hosted VLLM service on `mit-critical-data-1` as the primary live
provider for the Phase 0.1 canary. Use AWS Bedrock only as a later independent
cross-provider confirmation; it is not part of this closure package.

The currently observed service is VLLM `0.25.1`, listening on `127.0.0.1:8002`,
serving `leoclaw-qwen3-32b` with a maximum context length of 16,384 tokens. The
service is already running as a root-owned process and consumes GPU 0 (and its
existing allocation). AGORA must not stop, restart, resize, or reconfigure it.
The live run reaches it through an SSH tunnel and records the endpoint/model
metadata as an external deployment dependency.

This is an infrastructure validation condition. It must not be described as a
dedicated AGORA deployment or as evidence of social intelligence.

## Goals

1. Add a truthful `nvidia_vllm` provider identity to AGORA's provider registry.
2. Make the VLLM request contract explicit and testable:
   - `POST /v1/chat/completions`;
   - system prompt represented as a `system` message;
   - `max_tokens`, not OpenAI-only `max_completion_tokens`;
   - `chat_template_kwargs.enable_thinking=false`;
   - only configured `temperature`, `top_p`, and `seed` are forwarded;
   - no silent model or provider fallback.
3. Add a secretless local-tunnel preflight that verifies `/v1/models`,
   `/version`, and one bounded chat request before any canary run.
4. Produce separate baseline, exact-config rerun, and live fault evidence with
   linked config hashes, provider metadata, trace IDs, exports, and acceptance
   reports.
5. Harden M30 so one completed live run cannot pass by itself: M30 requires the
   linked baseline, rerun, fault package, complete export, and Gates 1–3 in PASS.
6. Keep all existing mock evidence unchanged and separately identifiable.

## Non-goals

- Do not use CommonTrace, external tools, or historical behavioural data.
- Do not introduce agent role packs, personalities, or behavioural claims.
- Do not stop or restart the existing VLLM service.
- Do not put provider tokens, SSH keys, or raw credentials into config files,
  bundles, logs, or Git.
- Do not treat the current VLLM service as proof of deterministic model output.
- Do not add Bedrock to the same experimental condition.

## Provider boundary

The provider enum includes `nvidia_vllm`, distinct from `openai`. Reusing the
OpenAI label would make the run provenance false even though the wire protocol
is compatible. The adapter uses the existing provider-neutral
`AgentProvider` interface and returns the same classified failure categories.

Runtime configuration is supplied only through environment variables:

- `NVIDIA_VLLM_BASE_URL`: required, expected to end in `/v1`;
- `NVIDIA_VLLM_API_KEY`: optional for the current no-auth tunnel; if absent, the
  adapter uses a non-secret placeholder only to satisfy the SDK HTTP contract.

The adapter persists provider name, requested/responded model, VLLM system
fingerprint when present, response id, finish reason, usage, and non-secret
endpoint metadata. It never persists the authorization header or token.

The adapter must reject a missing base URL before a run starts. It must classify
timeouts, HTTP 429, network failures, HTTP provider failures, empty choices,
refusals, and malformed responses without throwing through the orchestrator.

## Preflight and run protocol

The operator first opens a temporary SSH tunnel from the local machine:

```text
ssh -T -N -o ControlMaster=no -o ControlPath=none \
  -L 18002:127.0.0.1:8002 mit-critical-data-1
```

The preflight records, without secrets:

- canonical host and remote hostname;
- GPU inventory and the fact that GPU 0 was already occupied;
- `GET /v1/models` model id and maximum context length;
- `GET /version` VLLM version;
- one short chat response with thinking disabled;
- local code commit, config hash, command, timestamp, and output directory.

The validation package uses `NVIDIA_VLLM_BASE_URL=http://127.0.0.1:18002/v1`
and the observed model id. It uses synthetic workshop text only.

The minimum live evidence consists of:

1. baseline: three participants and a model-backed moderator;
2. rerun: rehydrated from the baseline's stored config with an identical hash;
3. fault run: the same live provider with deterministic adapter/tool faults,
   retries, and successful provider calls where the fault clears;
4. moderator-boundary run: scripted moderator paired with the same apparatus;
5. export and restore verification for the linked package.

The five-participant mock package remains the stress/compatibility condition.
The three-participant live package is the provider-path canary and is not a
replacement for the mock control.

## Closure requirements for the audit findings

The implementation and evidence package must address:

- F-01/F-04: M30 checks all linked run IDs, matching provider/model/config
  identity, baseline/rerun/fault exports, and Gates 1–3 PASS;
- F-03: dedicated live baseline, live fault, scripted moderator, and provider
  preflight configurations exist;
- F-05: scripted and LLM moderator conditions are separately represented;
- F-06: timeout, unavailable, invalid response, and permission denial are all
  classified in the tool-gateway matrix;
- F-07: recovery tests exercise interruption before invocation, after
  invocation, after message persistence, and during delivery;
- F-08: restore regenerates exports and verifies their hashes plus replay
  availability;
- F-09: M25 rejects orphan deliveries, retry events, analysis records, and
  manifest entries, not only the current record types;
- F-10: extractive hash integrity is named correctly and a sampled semantic
  review rubric is exported without claiming automatic semantic proof;
- F-11/F-12/F-13: CI/review state, artifact counts, and development dependency
  audit are recorded in the final report.

## Acceptance

The live provider work is complete only when all of the following are true:

- provider contract tests and all existing tests pass;
- TypeScript build passes;
- preflight succeeds and is archived;
- the linked live baseline, rerun, and fault runs complete;
- M1–M22 are PASS for the live baseline package;
- M23–M29 have explicit status and evidence, with no unreported
  `NOT_EXERCISED` condition;
- M30 is PASS only from the linked package contract above;
- every manifest entry, export, and trace index hash verifies;
- the final audit truthfully distinguishes mock, NVIDIA VLLM, and later Bedrock
  evidence.

If the current service cannot be treated as an authorized AGORA provider
deployment, the run is recorded as a provider preflight only and M30 remains
`NOT_EXERCISED`; no process lifecycle action is inferred from failure.

## Evidence layout

Large and mutable runtime evidence goes under:

```text
/data/AGORA/temporary_artifacts/20260827_agora_phase0_1_nvidia_vllm/
```

The report records the node, hostname, GPU UUID/index, command, commit, config
hashes, model id, VLLM version, endpoint scope, run IDs, output paths, and
warnings. The Git repository stores code, configurations, schemas, tests, and
the final audit summary; it does not store raw provider secrets or unbounded
runtime bundles.
