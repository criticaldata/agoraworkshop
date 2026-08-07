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

# 1. The whole Phase 0 validation package on the mock provider. No tokens spent.
#    Produces a baseline run, a rerun of the same frozen config, a fault-injection run,
#    an exported bundle, and the gate report.
npm run agora -- validate

# 2. The web UI.
npm run dev            # then open http://localhost:3000
```

| Route | For |
| --- | --- |
| `/` | Plain-language overview for reviewers who do not read code. Plots the real trace of the most recent run rather than an illustration. |
| `/docs` | Architecture, data model, execution model, current limits, and the proposed work in the order it should be done. |
| `/runs` | Operator view. Runs are grouped by settings fingerprint, because runs sharing one are the ones worth comparing. |
| `/runs/:id` | Checks first, then statistics, timeline, and every individual turn. |
| `/runs/:id/invocations/:id` | The exact material one agent was given before it responded. |
| `/runs/:id/validation` | The Phase 0 validation package: configuration, execution summary, the three gates with their evidence, provenance, and links to every artifact. |

Five configurations ship. Three run on the deterministic mock provider and cost nothing:

| Config | Provider | Purpose |
| --- | --- | --- |
| `agora_phase0_mock_baseline.yaml` | mock | A normal run with nothing injected. Gate 1 and, paired with a rerun, gate 3. |
| `agora_phase0_faultdemo_mock.yaml` | mock | Injects timeout, rate limit, provider error, and malformed response. Gate 2. |
| `agora_phase0_smoke.yaml` | mock | Pre-flight check. Injects a few faults, so it exercises both paths at once. |
| `agora_phase0_v1.yaml` | openai | The canonical baseline. Spends money. |
| `agora_phase0_faultdemo.yaml` | openai | The canonical baseline plus injected faults. Spends money. |

Faults are declared in the config, so a fault run carries its own config hash and can
never be mistaken for a baseline run.

### A live run against the pinned model

```bash
export OPENAI_API_KEY=sk-...

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
| Provider adapters (OpenAI, Anthropic, mock, fault injection) | `src/providers/` |
| Structured event log + SQLite persistence | `src/events/`, `src/db/` |
| Analytics, including infrastructure-adjusted participation | `src/analytics/summary.ts` |
| The three Phase 0 acceptance gates | `src/acceptance/gates.ts` |
| The Phase 0 validation set (which run evidences which gate) | `src/acceptance/validationSet.ts` |
| Code and deployment provenance | `src/core/provenance.ts` |
| Startup reconciliation of interrupted runs | `src/orchestrator/reconcile.ts` |
| Scripted neutral moderator | `src/providers/scriptedModerator.ts` |
| Required contents of an artifact bundle | `src/export/bundleContract.ts` |
| Artifact bundle + self-contained replay page | `src/export/` |
| Plain-language overview page | `src/server/home.ts` |
| Technical documentation page | `src/server/docs.ts` |
| Phase 0 validation package view | `src/server/validation.ts` |
| Shared visual system | `src/server/theme.ts` |
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

`validate` defaults to the mock configs, so it spends nothing unless you point it at a
model-backed config with `--config` and `--fault-config`.

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
| **2 — Failure attribution validated** | No opportunity conflates infrastructure failure with abstention; no failed turn counted as behaviourally available; infrastructure events present as distinct types; retry behaviour visible. Reports `NOT_EXERCISED` when no failure ever occurred. |
| **3 — Baseline reproducible** | Config frozen and snapshotted; hash recorded; model, generation, prompt, context, retry, budget settings and code revision documented; two or more runs with distinct run ids and an identical config hash. |

Each gate reports one of three statuses:

| Status | Meaning |
| --- | --- |
| `PASS` | The gate was exercised and every check passed. |
| `FAIL` | The gate was exercised and at least one check failed. |
| `NOT_EXERCISED` | The conditions the gate judges never occurred in the runs supplied. Missing evidence, not a pass. |

`ready_for_controlled_behavioral_experiment` is set to `true` only when all three
**PASS**. A run in which nothing failed reports gate 2 as `NOT_EXERCISED`: that is not a
defect in the instrument and not a pass, which is why the fault-injection configs exist.

### The validation set

One run is not expected to demonstrate all three gates. `agora validate` and
`/runs/:id/validation` assemble a **validation set** and name which run stands behind
which verdict:

| Evidence | Run |
| --- | --- |
| Infrastructure integrity | A normal run |
| Reproducibility | A rerun of the same frozen config |
| Failure attribution | A fault-injection run |

A run-level result and Phase 0 evidence are reported separately. A fault-injection run
full of recorded failures completed exactly as intended; that is not a failed run.

An interrupted run is never accepted as gate 2 evidence. Being stopped by a restart shows
the apparatus noticed it was stopped, not that a provider timeout is told apart from an
agent choosing to stay silent.

---

## Model configuration

The canonical baseline pins `gpt-5.6-luna` through a provider-neutral adapter. Three
adapters ship: `openai`, `anthropic`, and `mock`. Switching provider is a config edit —
and because the provider and model id are part of the hashed config, a provider change
is a visible change of experimental conditions, never a silent one.

- **No silent fallback.** No model fallback of any kind is configured. A refusal is
  recorded as the infrastructure category `provider_refusal`; it is never rescued by a
  different model behind the researcher's back.
- **No hidden reasoning.** `thinking: adaptive` sends `reasoning_effort: <effort>`;
  `thinking: disabled` sends `reasoning_effort: 'none'` explicitly rather than omitting
  the field. Reasoning content itself is never requested or stored.
- **`null` means "not set".** The OpenAI adapter omits null sampling parameters entirely
  rather than sending a provider default under a null label. (The Anthropic adapter
  refuses to start if they are set, because current Claude models reject them.)
- **`seed` is honoured when set.** OpenAI accepts a seed on chat completions, so setting
  an integer holds one more variable constant. It is best-effort, not a determinism
  guarantee.
- **SDK retries are off.** Retries are the orchestrator's job, so every attempt appears
  in the event log.

The exact model id is one line in the config:

```yaml
model:
  provider: openai
  model: gpt-5.6-luna     # step up to gpt-5.6-terra or gpt-5.6-sol if quality demands it
```

| Model | Input / output per 1M tokens | When |
| --- | --- | --- |
| `gpt-5.6-luna` | $0.20 / $1.20 | The baseline. Phase 0 turns are short, tool-free discussion messages. |
| `gpt-5.6-terra` | $2.00 / $12.00 | If contributions read as too shallow to exercise the interaction system. |
| `gpt-5.6-sol` | $5.00 / $30.00 | Frontier work. Roughly 25× the baseline cost, for no Phase 0 benefit. |

The spec is explicit that the specific model is not scientifically important in Phase 0 —
reproducibility and control are. Changing it is a config edit and a new config hash, so
the switch is always recorded rather than assumed.

Swap `model.provider` to `mock` for a deterministic, free run of the same machinery.

---

## Demo script

1. `agora hash --config configs/agora_phase0_v1.yaml` shows the frozen config and hash.
2. Launch a run from the UI and watch the timeline fill in.
3. Point at a public message and its per-recipient delivery events.
4. Point at a breakout message, then open a non-member's invocation and show its context
   does not contain it.
5. Show a fault-run timeline: a timeout, a retry, a recovery, and a retry exhaustion,
   each recorded separately from abstention.
6. Open any invocation to reconstruct the exact context that produced a message.
7. Show `analytics.json`: naive against infrastructure-adjusted participation.
8. Rerun the frozen config: new run id, identical config hash.
9. Open `/runs/:id/validation` and walk the three gates, expanding the evidence under
   each and following the link to the run that supplied it.

---

## Deployment

Deployed on Railway from this repository.

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Required for live runs; not needed for the mock config. |
| `OPENAI_BASE_URL` | Optional; points the adapter at a compatible gateway. |
| `ANTHROPIC_API_KEY` | Only needed if a config sets `model.provider: anthropic`. |
| `AGORA_DATA_DIR` | SQLite location. **Point at a mounted volume** (e.g. `/data`) or runs are lost on redeploy. |
| `AGORA_EXPORT_DIR` | Export bundle location; also belongs on the volume. |
| `AGORA_CONFIG_DIR` | Where the server looks for frozen configs (default `./configs`). |
| `PORT` | Set by Railway. |
| `AGORA_AUTH_PASSWORD` | Shared credential. **Unset means run-starting and export return 503**, not that they run open. |
| `AGORA_AUTH_SCOPE` | `write` (default) protects run-starting and export; `all` protects every route except the health check. |
| `AGORA_APP_VERSION` | Optional. Overrides the version read from `package.json` in the provenance record. |
| `AGORA_COMMIT_SHA` | Optional. Used when the platform does not supply a commit sha and there is no git checkout. |

Railway supplies `RAILWAY_GIT_COMMIT_SHA`, `RAILWAY_DEPLOYMENT_ID` and
`RAILWAY_ENVIRONMENT_NAME` automatically, and every run records them. Nothing is ever
invented: a value that is genuinely unavailable is stored as null and displayed as
`unavailable`.

Health check: `GET /healthz` — always reachable without a credential.

### Access control

Reading and writing are separated, so the overview and documentation can be shared
without sharing the ability to spend tokens.

| Route | Access |
| --- | --- |
| `/`, `/docs`, `/healthz` | Open. |
| `/runs`, run pages, read APIs | Open by default; behind the credential when `AGORA_AUTH_SCOPE=all`. |
| Starting a run, rerunning, exporting | Always requires the credential, and must originate from this instance. |

Three properties are deliberate. It **fails closed** — with no credential configured,
anything that spends money or writes files is refused rather than served. Secrets are
compared in **constant time**, hashed to a fixed width first so neither the password nor
its length leaks through response timing. And state-changing requests must carry a
same-origin `Origin`, so a credential cached by a browser cannot be used by another site
to start a run.

Exporting is a `POST`, not a `GET`, because it writes files and records artifacts:

```bash
curl -u agora:$AGORA_AUTH_PASSWORD -X POST https://<host>/api/runs/<run_id>/export
```

The limits are real and recorded in the documentation: one shared credential rather than
accounts, so a run cannot be attributed to a person; no sign-out; and revoking one
person's access means changing the credential for everyone.

---

## Testing

```bash
npm test
```

122 tests covering config integrity and immutability, state-machine validity and
termination, public/private routing and leak detection, failure attribution across every
category, retry bounds, context provenance and reconstruction, export ordering,
reproducibility, the OpenAI request mapping, access control, and every page.

The documentation page quotes figures about the code — the number of event types, failure
categories and tables. Those figures are asserted against the source, so the page cannot
drift away from what it describes.

Run the mock-provider tests and the smoke config before ever starting a live workshop.
