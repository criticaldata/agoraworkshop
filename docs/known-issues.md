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

- Sampling parameters (`temperature`, `top_p`, `top_k`) are recorded but must be
  `null`: current Claude models reject them. The adapter refuses to start rather than
  silently dropping a recorded experimental parameter.
- Thinking output is requested with `display: omitted`. No reasoning content is
  captured or stored. Phase 0 deliberately does not depend on private reasoning traces.
- Server-side refusal fallbacks are **not** enabled, because the spec forbids silently
  falling back to another model. A policy refusal is therefore recorded as the
  infrastructure category `provider_refusal` and the turn is retried on the same model.
- SDK-level retries are disabled so that every attempt appears in the event log.

## Analytics limitations

- `infrastructure_adjusted_participation` is `null` when an agent had zero
  behaviourally available opportunities. Reporting `0` there would be a behavioural
  claim the data does not support.
- Token counts come from the provider's usage block. When a provider does not report
  usage, the corresponding totals are zero rather than estimated.
