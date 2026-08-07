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
- **Raw context only.** Context is assembled from raw messages with no summarisation.
  A long enough run will eventually exceed the context window; there is no compaction
  strategy yet, and `context_policy.max_messages` is a blunt fallback.
- **Failed attempts consume call budget.** A repeatedly timing-out agent burns its call
  budget on attempts that produced nothing. This is deliberate (it bounds spend) but it
  means budget exhaustion and provider instability are correlated.
- **No mid-run configuration changes.** The config is frozen at run start, by design.
- **Single-process runtime.** Runs are executed in the web process. There is no queue,
  and a process restart mid-run leaves the run row in RUNNING with a complete event log
  up to the interruption.

## Provider-specific notes

- The canonical configs pin an OpenAI model. `model.provider` also accepts `anthropic`
  and `mock`; provider and model id are part of the hashed config, so switching either
  is a visible change of experimental conditions.
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
