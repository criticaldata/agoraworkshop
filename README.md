# AGORA — Phase 0

Phase 1A role-experiment extension: [specification](docs/phase1/IMPLEMENTATION_SPEC.md),
[operator guide and review notes](docs/phase1/REVIEW.md). Open `/phase1` for the
draft/preview/freeze/mock/compare/annotate/export workflow. Phase 1B remains out of scope.

## Phase 1A workshop runtime and WP05 replay

The repository now also contains Mateo's WP01 study contract, an executable Phase 1A
workshop runtime, and the first WP05 context-locked replay milestone. The
implementation is backed by a machine-checked requirement matrix. The scientific
freeze remains pending for every item still marked `OPEN` or `PROPOSED` in the WP01
decision register.

The workshop uses a deterministic three-participant, six-round protocol with private
checkpoints at `T0`, `T6`, and, in report conditions, `TR`. The runtime currently uses
the equivalent internal aliases `t0`, `t1`, and `t2`. Its four experimental
conditions are:

| Condition | Model composition | Joint-report requirement |
| --- | --- | --- |
| A | Gemma / Gemma / Gemma | No |
| B | Gemma / Gemma / Gemma | Yes |
| C | Gemma / Gemini / Model X | No |
| D | Gemma / Gemini / Model X | Yes |

For B and D, every agent commits its private `t0` response before the joint-report
requirement is disclosed. The disclosure then occurs before the first public turn.
This preserves `t0` as a pre-treatment baseline while keeping the public discussion
under the assigned report condition.

The WP05 replay grid is a separate four-cell test, not the A–D workshop condition
matrix. It replays one frozen parent invocation across identity cue present/absent
and endorsement cue present/absent. Each replay cell has an independent trial
record, deterministic context hash, explicit retry policy, and complete success or
failure evidence.

- [Phase 1A specification pack](specs/README.md)
- [WP01 study contract and decision register](docs/phase1a/wp01/README.md)
- [WP05 context-locked replay contract](specs/phase1a/context-locked-replay.md)
- [Requirement-to-test matrix](specs/phase1a/requirement-test-matrix.md)

Run `npm test` for the full validation suite and `npm run build` for the production
build check.

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
The canonical M1–M30 acceptance definitions are in
[`docs/phase0_acceptance_matrix.md`](docs/phase0_acceptance_matrix.md).

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

The repository ships deterministic mock controls plus dedicated NVIDIA/VLLM canary
configurations. Mock runs cost nothing; the NVIDIA configs call the already-running
endpoint supplied through `NVIDIA_VLLM_BASE_URL`.

| Config | Provider | Purpose |
| --- | --- | --- |
| `agora_phase0_mock_baseline.yaml` | mock | A normal run with nothing injected. Gate 1 and, paired with a rerun, gate 3. |
| `agora_phase0_faultdemo_mock.yaml` | mock | Injects timeout, rate limit, provider error, and malformed response. Gate 2. |
| `agora_phase0_smoke.yaml` | mock | Pre-flight check. Injects a few faults, so it exercises both paths at once. |
| `agora_phase0_v1.yaml` | openai | The canonical baseline. Spends money. |
| `agora_phase0_faultdemo.yaml` | openai | The canonical baseline plus injected faults. Spends money. |
| `agora_phase0_1_nvidia_vllm_live_canary.yaml` | nvidia_vllm | Three-agent live baseline with auditable summaries, tools and recovery. |
| `agora_phase0_1_nvidia_vllm_live_fault.yaml` | nvidia_vllm | Live provider/tool fault condition; use only after preflight. |
| `agora_phase0_1_nvidia_vllm_moderator_scripted.yaml` | nvidia_vllm | Live participant run with a fixed scripted moderator boundary. |
| `agora_phase0_1_context_contract.yaml` | mock_context_contract | Dedicated context/summarization contract run for M23–M25. |
| `agora_phase0_1_tool_fault_matrix.yaml` | mock_context_contract | End-to-end timeout, unavailable, invalid-response and permission-denied matrix for M26. |
| `agora_phase0_1_restart_matrix.yaml` | mock_context_contract | Four-point interruption/resume matrix for M27. |

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

### NVIDIA/VLLM preflight and canary

The provider probe qualifies an existing endpoint; it never starts, stops or
reconfigures a VLLM service. For the authorized Brev tunnel used by AGORA:

```bash
ssh -T -N -o ControlMaster=no -o ControlPath=none \
  -L 18002:127.0.0.1:8002 mit-critical-data-1

$env:NVIDIA_VLLM_BASE_URL = 'http://127.0.0.1:18002/v1'
npm run agora -- provider-probe --provider nvidia_vllm \
  --model leoclaw-qwen3-32b --out ./phase0_1_provider_preflight

npm run agora -- validate \
  --config configs/agora_phase0_1_nvidia_vllm_live_canary.yaml \
  --fault-config configs/agora_phase0_1_nvidia_vllm_live_fault.yaml \
  --moderator-config configs/agora_phase0_1_nvidia_vllm_moderator_scripted.yaml \
  --out ./phase0_1_nvidia_vllm_validation
```

The preflight receipt is secretless. The live baseline, rerun, fault condition and
scripted-moderator condition are separate runs and are linked before M30 can pass.

---

## What exists

| Concern | Where |
| --- | --- |
| Immutable experiment config, deterministic hash | `src/config/` |
| Explicit finite state machine | `src/orchestrator/stateMachine.ts` |
| Turn scheduling, retries, budgets, routing | `src/orchestrator/runner.ts` |
| Context assembly + provenance | `src/orchestrator/context.ts` |
| Single visibility rule (public/private separation) | `src/orchestrator/visibility.ts` |
| Provider adapters (OpenAI, Anthropic, mock, NVIDIA/VLLM, fault injection) | `src/providers/` |
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
  agora provider-probe --provider nvidia_vllm --model <id>
                                     Qualify an existing VLLM endpoint
```

`validate` defaults to the mock configs, so it spends nothing unless you point it at a
model-backed config with `--config` and `--fault-config`.

`export` and `accept` take `--fault-run <run_id>` (gate 2 evidence) and
`--rerun <run_id>` (gate 3 evidence).

A completed run writes its artifact bundle by itself, from the web UI and from the CLI
alike. `export` is for writing it again, or to a different directory. A run that did not
complete is not packaged: its partial data belongs on the run pages, not in a bundle that
would look like evidence.

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
gates — and any opted-in Phase 0.1 robustness checks — are **PASS**. A run in which nothing failed reports gate 2 as `NOT_EXERCISED`: that is not a
defect in the instrument and not a pass, which is why the fault-injection configs exist.

### The twenty-two acceptance metrics

Each gate is composed of numbered metrics, in `src/acceptance/metrics.ts`. A gate's prose
evidence says what was seen; a metric says which agreed threshold it was measured against,
so a verdict can be checked rather than taken on trust.

| Gate | Metrics | Thresholds |
| --- | --- | --- |
| 1 — Infrastructure | M1–M8, M19, M21 | opportunity coverage, sequence integrity, public routing, private isolation, state machine, bounded execution, persistence, export, authorized-context equality, delivery uniqueness |
| 2 — Failure attribution | M9–M12, M20, M22 | classification coverage, behaviour/infrastructure separation, retry traceability, controlled fault validation, retry action idempotency, budget accounting under retry |
| 3 — Reproducibility | M13–M18 | config snapshot, deterministic fingerprint, code provenance, invocation traceability, context integrity, repeated-run evidence |

M19–M22 were added later and are described under **Four strengthenings** below. They are
listed here too because each one belongs to a gate and can fail it; keeping them out of
this table made gates 1 and 2 look narrower than they are.

Three properties hold throughout:

- **Metrics only tighten.** A failing metric fails its gate; no metric can turn a failing
  prose check into a pass. Adding a threshold can never make a previously failing run
  look acceptable.
- **Nothing is confirmed by its own bookkeeping.** M3 re-derives the recipient set from
  the frozen config rather than reading back the `actual_recipients` the router wrote,
  because comparing the router to itself proves only that it is self-consistent.
- **Coverage and accuracy are separate findings.** M12 reports `FAIL` when an injected
  fault was classified as the wrong thing, and `NOT_EXERCISED` when a required failure
  mode was never injected at all. The first is a defect; the second is missing evidence.

Every metric is tested twice — once on a run that satisfies it, and once on the same run
after one stored record has been damaged. A check that cannot be made to fail is not
evidence (`tests/acceptanceMetrics.test.ts`).

#### Four strengthenings

Four further metrics were added at review, each because the specification's version is a
one-way check where the property wanted is two-way. Each declares its parent in
`STRENGTHENS`, so the additions never read as scope creep.

| Metric | Threshold | Strengthens |
| --- | --- | --- |
| **M19** Authorized-context equality | `context_message_ids == authorized_visible_messages`, exactly | M4. A leak check forbids seeing too much; M19 also forbids seeing too little. |
| **M20** Retry action idempotency | `duplicate_actions_per_opportunity = 0` | M11. A traceable retry may still have repeated its parent's effect. |
| **M21** Delivery uniqueness | `duplicate_deliveries = 0` | M3. Delivering the same message twice leaves the count correct. |
| **M22** Budget accounting under retry | every attempt charged exactly once | M11. A retry that costs nothing makes budgets unenforceable. |

M19 is the one that changes what is provable. An omission — an agent denied a message it
was entitled to — produces no leak, no error, and a transcript that reads normally, so
M4 passes on it. M19 re-derives each context from the frozen config's group membership,
deliberately as a second implementation that never calls `isVisibleTo` and never reads
`actual_recipients`, and requires set equality in both directions. The test suite proves
the gap directly: it removes one authorized message from a stored context and asserts
that M19 fails **while M4 still passes**.

M20 and M22 are claims only a retrying run can demonstrate, so they are read off the
fault-injection run like M9 and M11 — but a primary run that genuinely breaks the
invariant still fails, rather than being excused because the interesting run was
elsewhere.

The full table appears on `/runs/:id/validation` under **Technical details**. The default
view answers the four Phase 0 questions instead; the thresholds are for an auditor.

### The Phase 0.1 robustness checks

M23–M30 live in `src/acceptance/phase01.ts` and judge the machinery Phase 0.1 added:
context summaries, end-to-end traces, the tool gateway, recovery and backup. They are
**opt-in**. A frozen config brings them into the acceptance report by enabling
summarization, tool probes or recovery, by declaring a validation profile or a scripted
moderator, or by using a structured capability manifest. A plain Phase 0 config is not
evaluated against them at all, so its meaning is unchanged.

| Metric | Threshold |
| --- | --- |
| **M23** Context material | every invocation's rendered material resolves to authorized raw messages and summaries |
| **M24** Summary provenance | sources exist, are in order, are within the recipient's visibility, and the fidelity hashes verify |
| **M25** Trace completeness | one trace id joins opportunity, invocation, summary and tool records |
| **M26** Tool attribution | every configured tool fault is recorded and classified as the fault injected |
| **M27** Recovery idempotency | a completed resume left no unresolved opportunity, no duplicate delivery and no duplicate state transition |
| **M28** Backup/restore | a reopened snapshot carries the same run identity and config hash |
| **M29** Moderator boundary | a scripted moderator turn is recorded as scripted, not as a model call |
| **M30** Live canary | a declared non-mock run completed with a full exported acceptance package |

Like the Phase 0 metrics, these separate defect from missing evidence: a wrong answer is
`FAIL`, a condition never exercised is `NOT_EXERCISED`. M30 stays `NOT_EXERCISED` until an
operator supplies real provider credentials — a mock run can never stand in for it.

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

The canonical baseline pins `gpt-5.6-luna` through a provider-neutral adapter. Five
provider identities ship: `openai`, `anthropic`, `mock`, `mock_context_contract`, and
`nvidia_vllm`. Switching provider is a config edit —
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

Swap `model.provider` to `mock` for a deterministic, free infrastructure run, or use
`mock_context_contract` to verify the exact authorized context, summaries and hashes
without making a behavioural claim.

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
| `NVIDIA_VLLM_BASE_URL` | Required for NVIDIA/VLLM runs; points to the already-running `/v1` endpoint. |
| `NVIDIA_VLLM_API_KEY` | Optional provider credential; never written to configs, logs or bundles. |

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

The test suite covers config integrity and immutability, state-machine validity and
termination, public/private routing and leak detection, failure attribution across every
category, retry bounds, context provenance and reconstruction, export ordering,
reproducibility, the OpenAI request mapping, access control, and every page — and, for
Phase 0.1, channel-scoped summary provenance, the deterministic tool gateway, checkpoint
and resume behaviour, and backup/restore verification.

Every acceptance metric is tested twice: once on a run that satisfies it, and once on the
same run after one stored record has been damaged. A check that cannot be made to fail is
not evidence.

The documentation page quotes figures about the code — the number of event types, failure
categories and tables. Those figures are asserted against the source, so the page cannot
drift away from what it describes.

Run the mock-provider tests and the smoke config before ever starting a live workshop.
