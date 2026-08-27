# Known limitations — AGORA Phase 0

These are stated explicitly so that nobody reads more into a Phase 0 run than it supports.

## Scientific scope

- Phase 0 validates an **apparatus**. It does not establish anything about AI social
  behaviour. No claim about coalitions, persuasion, convergence, or emergence is
  supported by anything in this repository.
- The workshop topic was chosen to exercise the interaction system, not because the
  topic itself is scientifically informative.
- Repeated runs are **not** expected to produce identical text. Only the experimental
  conditions are reproducible; model output is stochastic by design.
- Moderator output is a model output like any other. It is not ground truth, and its
  summaries are not evidence of what participants meant.

## Instrument limitations

- **Sequential turn-taking.** Agents speak in a deterministic rotation. Real
  simultaneity, interruption, and self-selected turn-taking are not modelled.
- **Breakout groups are static.** Group membership comes from the config and does not
  change during a run.
- **Summarisation is opt-in and extractive.** The default keeps raw messages
  authoritative. Phase 0.1 can add channel-scoped rolling summaries with source ids,
  hashes and fidelity audits, but this is not a behavioural or semantic summariser.
- **Failed attempts consume call budget.** A repeatedly timing-out agent burns its call
  budget on attempts that produced nothing. This is deliberate (it bounds spend) but it
  means budget exhaustion and provider instability are correlated.
- **No mid-run configuration changes.** The config is frozen at run start, by design.
- **Single-process runtime.** Runs are executed in the web process. There is no queue or
  external supervisor, so a process restart does not resume itself automatically. Startup
  reconciliation marks such a run `INTERRUPTED`, records unresolved turns provisionally
  as the infrastructure category `interrupted`, appends a `run_interrupted` event, and
  preserves every event, message and invocation already written. Runs with
  `recovery.enabled=true` can be resumed explicitly through the runner and the four-point
  restart matrix; historical runs without recovery remain interrupted.
- **Moderator comparison is evidence-dependent.** The scripted moderator has a fixed
  provider/version and its privacy and state-boundary checks are executable. A live
  scripted-versus-LLM comparison still requires the paired provider campaign; a scripted
  mock result alone does not establish equivalence between moderator modes.
- **Failure-evidence runs are found by searching.** When no run is named explicitly, the
  validation set picks the most recent run that recorded infrastructure failures, which
  may be under a different configuration than the run being validated. The package
  always names the run it used, so the choice is visible, but it is a search result
  rather than a stated pairing.

- **NVIDIA/VLLM canary endpoint is external to AGORA.** The `nvidia_vllm` adapter
  records the endpoint and model identity but does not own the VLLM service lifecycle.
  A preflight can prove that the endpoint answered the required contract; it cannot
  prove who else may be using the service or that its weights will remain unchanged.
  The live package therefore records the observed server version, model id and node
  provenance and keeps the mock control as a separate condition.

## Provider-specific notes

- The canonical configs pin an OpenAI model. `model.provider` also accepts `anthropic`
  `nvidia_vllm` and `mock`; provider and model id are part of the hashed config, so switching either
  is a visible change of experimental conditions.
- NVIDIA/VLLM requests use the native `/v1/chat/completions` contract with a `system`
  message, `max_tokens`, and `chat_template_kwargs.enable_thinking=false`. The adapter
  is explicitly named `nvidia_vllm` even though the wire protocol is OpenAI-compatible.
- Sampling parameters (`temperature`, `top_p`, `top_k`) are recorded but default to
  `null`, meaning "not set". The OpenAI adapter omits null fields from the request
  rather than sending a provider default; `top_k` is never sent, because the Chat
  Completions API does not accept it. The Anthropic adapter refuses to start if any are
  set, because current Claude models reject them outright.
- `seed` is forwarded to OpenAI when set. It reduces variance between runs but does not
  guarantee identical output, and Phase 0 does not depend on it.
- Reasoning content is never requested or stored on any provider. `thinking: adaptive`
  maps to `reasoning_effort: <effort>`; `thinking: disabled` maps to
  `reasoning_effort: 'none'`.
- No model fallback is configured, because the spec forbids silently falling back to
  another model. A refusal (an OpenAI `refusal` message or a `content_filter` finish
  reason) is recorded as the infrastructure category `provider_refusal` and the turn is
  retried on the same model.
- SDK-level retries are disabled on every adapter so that every attempt appears in the
  event log.

## Analytics limitations

- `infrastructure_adjusted_participation` is `null` when an agent had zero
  behaviourally available opportunities. Reporting `0` there would be a behavioural
  claim the data does not support.
- Token counts come from the provider's usage block. When a provider does not report
  usage, the corresponding totals are zero rather than estimated.

## What a Phase 0 validation package does and does not say

- A package with all three gates `PASS` says the apparatus executed, recorded, and
  reproduced a bounded workshop. It says nothing about what the agents did or meant.
- `NOT_EXERCISED` on gate 2 means no infrastructure failure occurred in any run supplied.
  It is missing evidence, not a pass, and it never counts towards validation.
- A fault-injection run completing successfully is the intended outcome. Its recorded
  failures are declared experimental conditions, not defects.
- An interrupted run is never accepted as gate 2 evidence. Being stopped by a restart
  shows the apparatus noticed it was stopped, not that a provider timeout is told apart
  from an agent choosing to stay silent.
- Code provenance is recorded, never invented. A commit sha, deployment id, app version
  or environment that is genuinely unavailable is stored as null and displayed as
  `unavailable`.
