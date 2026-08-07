# AGORA — Phase 0

A small, controlled, replayable multi-agent workshop, plus enough instrumentation to
trust it as a research instrument.

Five participant agents and one moderator hold a bounded discussion across public and
breakout channels. Every state transition, context assembly, provider call, message,
delivery, retry and failure is recorded as a structured event, so that after a run you
can answer:

> What happened, under exactly which conditions, what did each agent actually receive,
> which actions succeeded or failed, and can we run the same experiment again in a
> scientifically comparable way?

**Phase 0 validates the apparatus. It establishes nothing about AI social behaviour.**
See [`docs/known-issues.md`](docs/known-issues.md) for the limits, stated explicitly.

---

## Quick start

```bash
npm install

# 1. Cheap end-to-end check on the deterministic mock provider — no tokens spent.
npm run agora -- validate --config configs/agora_phase0_smoke.yaml

# 2. The web UI.
npm run dev            # then open http://localhost:3000
```

The smoke config injects infrastructure faults on purpose, so a first run exercises the
failure-attribution machinery as well as the happy path.

### A live run against the pinned model

```bash
export ANTHROPIC_API_KEY=sk-ant-...

npm run agora -- hash --config configs/agora_phase0_v1.yaml     # inspect before spending
npm run agora -- run  --config configs/agora_phase0_v1.yaml

# The full validation package: baseline + rerun + fault run + exported bundle + gates.
npm run agora -- validate \
  --config configs/agora_phase0_v1.yaml \
  --fault-config configs/agora_phase0_faultdemo.yaml
```

---

## What exists

| Concern | Where |
| --- | --- |
| Immutable experiment config, deterministic hash | `src/config/` |
| Explicit finite state machine | `src/orchestrator/stateMachine.ts` |
| Turn scheduling, retries, budgets, routing | `src/orchestrator/runner.ts` |
| Context assembly + provenance | `src/orchestrator/context.ts` |
| Single visibility rule (public/private separation) | `src/orchestrator/visibility.ts` |
| Provider adapter (Anthropic, mock, fault injection) | `src/providers/` |
| Structured event log + SQLite persistence | `src/events/`, `src/db/` |
| Analytics, including infrastructure-adjusted participation | `src/analytics/summary.ts` |
| The three Phase 0 acceptance gates | `src/acceptance/gates.ts` |
| Artifact bundle + self-contained replay page | `src/export/` |
| Web UI and JSON API | `src/server/` |

### Commands

```
agora run --config <path>          Launch a workshop from a frozen config
agora rerun <run_id>               Re-launch the same frozen config as a new run
agora replay <run_id>              Print the chronological event timeline
agora export <run_id>              Write the full artifact bundle to disk
agora accept <run_id>              Evaluate the three Phase 0 gates
agora analytics <run_id>           Print the analytics summary
agora hash --config <path>         Print the config hash without running anything
agora list                         List recorded runs
agora validate                     Produce the whole validation package
```

`export` and `accept` take `--fault-run <run_id>` (gate 2 evidence) and
`--rerun <run_id>` (gate 3 evidence).

---

## The five design decisions that matter

**1. Configuration is experimental data.** Everything that could change agent behaviour
lives in one YAML file: provider, exact model id, generation parameters, prompt
versions, context policy, retry policy, budgets, channel permissions, tool manifest,
scheduling rule. A run stores an immutable snapshot of it and a deterministic
`sha256` over its canonical serialization. Two runs with the same hash were executed
under identical conditions; any edit anywhere produces a different hash.

**2. Deterministic orchestration, stochastic agents.** Scheduling, phase transitions,
timers, permissions and bookkeeping are plain code. The moderator model is used only
where language actually has to be generated — it never counts, routes, or changes
state. Speaking order rotates by round, deterministically, so no agent has a permanent
first-speaker advantage.

**3. Failure is first-class data.** A missing response is never assumed to be
disengagement. Every response opportunity resolves to exactly one of:

- **behavioural** — `success`, `explicit_abstention` (the agent emitted `[ABSTAIN]`),
  `no_op` (the agent emitted `[PASS]`);
- **infrastructure** — `timeout`, `rate_limit`, `provider_error`, `provider_refusal`,
  `network_error`, `malformed_response`, `routing_error`, `permission_denied`,
  `budget_exhausted`, `retry_exhausted`.

An **empty** provider response is classified as `malformed_response`, not as silence:
guessing the other way would manufacture abstentions out of provider bugs. Analytics
report `infrastructure_adjusted_participation` (successes ÷ opportunities the agent was
actually able to act on) alongside the naive figure, purely so the two can be compared.

**4. One visibility rule, checked twice.** Routing (write time) and context assembly
(read time) both call the same `isVisibleTo` function, so a leak would have to be a bug
in one function rather than a disagreement between two. The acceptance report then
**re-derives** visibility for every context reference from stored data and reports the
violation count — it does not simply trust the routing decision made at the time.

**5. Faults are declared, not simulated behind your back.** `fault_injection` is part
of the config, so it is part of the hash. A run with injected failures can never be
mistaken for a clean baseline.

---

## The three acceptance gates

`agora accept` emits a machine-readable report with evidence per gate.

| Gate | Passes when |
| --- | --- |
| **1 — Infrastructure validated** | Run reached a clean terminal state; event sequence contiguous; public and private messages routed and delivered; private channel actually exercised; **zero** re-derived visibility violations; all state transitions completed; artifacts exported; no unclassified execution errors. |
| **2 — Failure attribution validated** | No opportunity conflates infrastructure failure with abstention; no failed turn counted as behaviourally available; infrastructure events present as distinct types; retry behaviour visible. |
| **3 — Baseline reproducible** | Config frozen and snapshotted; hash recorded; model, generation, prompt, context, retry and budget settings documented; ≥2 runs with distinct run ids and an identical config hash. |

`ready_for_controlled_behavioral_experiment` is set to `true` only when all three pass.
A run with no observed infrastructure failure **fails gate 2** rather than passing it by
default — which is why the fault-injection config exists.

---

## Model configuration

The canonical baseline pins `claude-opus-5` via a thin provider-neutral adapter.

- **No silent fallback.** Server-side refusal fallbacks are deliberately not enabled. A
  policy refusal is recorded as the infrastructure category `provider_refusal`; it is
  never rescued by a different model behind the researcher's back.
- **No hidden reasoning.** Thinking runs with `display: omitted`. No reasoning content is
  requested, returned, or stored.
- **Sampling parameters are recorded as `null`.** Current Claude models reject them; the
  adapter refuses to start rather than silently discarding a recorded parameter.
- **SDK retries are off.** Retries are the orchestrator's job, so every attempt appears
  in the event log.

Swap `model.provider` to `mock` for a deterministic, free run of the same machinery.

---

## Demo script

1. `agora hash --config configs/agora_phase0_v1.yaml` — show the frozen config and hash.
2. Launch a run from the UI and watch the timeline fill in.
3. Point at a public message and its per-recipient delivery events.
4. Point at a breakout message — then open a non-member's invocation and show its
   context does not contain it.
5. Show a fault-run timeline: a timeout, a retry, a recovery, and a retry exhaustion,
   each recorded separately from abstention.
6. Open any invocation to reconstruct the exact context that produced a message.
7. Show `analytics.json` — naive vs infrastructure-adjusted participation.
8. Rerun the frozen config: new run id, identical config hash.
9. Show the three gates.

---

## Deployment

Deployed on Railway from this repository.

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required for live runs; not needed for the mock config. |
| `AGORA_DATA_DIR` | SQLite location. **Point at a mounted volume** (e.g. `/data`) or runs are lost on redeploy. |
| `AGORA_EXPORT_DIR` | Export bundle location; also belongs on the volume. |
| `AGORA_CONFIG_DIR` | Where the server looks for frozen configs (default `./configs`). |
| `PORT` | Set by Railway. |

Health check: `GET /healthz`.

---

## Testing

```bash
npm test
```

59 tests covering config integrity and immutability, state-machine validity and
termination, public/private routing and leak detection, failure attribution across every
category, retry bounds, context provenance and reconstruction, export ordering, and
reproducibility.

Run the mock-provider tests and the smoke config before ever starting a live workshop.
