# Phase 1A requirement-to-test matrix

Status: **IMPLEMENTED — 2026-10-20**

This matrix is the executable proof map for the normative Phase 1A specifications. A row is `GREEN` only when the named test assertions exercise the implemented Phase 1A runtime and prove the requirement as written. Open live-pilot parameters remain explicit in `decision-log.md`; deterministic fixture decisions are injected rather than invented by the runtime.

## System context

| Requirement | Test or proposed test | What the assertions prove | Status |
|---|---|---|---|
| `CTX-01` | `phase1aRuntime.test.ts > [CTX-01] [CTX-02] [CTX-04] [CTX-05] uses a provider-neutral deterministic runtime with explicit extension boundaries` | The baseline host output is deterministic and does not invoke a moderator model. | GREEN |
| `CTX-02` | `phase1aRuntime.test.ts > [CTX-01] [CTX-02] [CTX-04] [CTX-05] uses a provider-neutral deterministic runtime with explicit extension boundaries` | Adapter choice does not change the experiment contract or normalized response fields. | GREEN |
| `CTX-03` | `phase1aRuntime.test.ts > [CTX-03] reuses canonical hashes, timestamps, immutable artifacts, and response envelopes` | Compatible Phase 0 logging, timestamps, hashes, and response storage are reused. | GREEN |
| `CTX-04` | `phase1aRuntime.test.ts > [CTX-01] [CTX-02] [CTX-04] [CTX-05] uses a provider-neutral deterministic runtime with explicit extension boundaries` | Phase 1A adds the specified capabilities without replacing the evidence foundation. | GREEN |
| `CTX-05` | `phase1aRuntime.test.ts > [CTX-01] [CTX-02] [CTX-04] [CTX-05] uses a provider-neutral deterministic runtime with explicit extension boundaries` | Tutorial content cannot substitute for or launch the implementation workflow. | GREEN |

## Experiment contract

| Requirement | Test or proposed test | What the assertions prove | Status |
|---|---|---|---|
| `EXP-01` | `phase1aRuntime.test.ts > [EXP-01] [EXP-02] [EXP-03] [EXP-04] [EXP-05] [EXP-06] [EXP-07] [EXP-09] [EXP-10] freezes the exact six-round and checkpoint contract` | A valid core workshop has six rounds and no implicit alternative count. | GREEN |
| `EXP-02` | `phase1aRuntime.test.ts > [EXP-01] [EXP-02] [EXP-03] [EXP-04] [EXP-05] [EXP-06] [EXP-07] [EXP-09] [EXP-10] freezes the exact six-round and checkpoint contract` | The first two rounds use the approved problem-framing prompt family. | GREEN |
| `EXP-03` | `phase1aRuntime.test.ts > [EXP-01] [EXP-02] [EXP-03] [EXP-04] [EXP-05] [EXP-06] [EXP-07] [EXP-09] [EXP-10] freezes the exact six-round and checkpoint contract` | The middle rounds use the redesign prompt family. | GREEN |
| `EXP-04` | `phase1aRuntime.test.ts > [EXP-01] [EXP-02] [EXP-03] [EXP-04] [EXP-05] [EXP-06] [EXP-07] [EXP-09] [EXP-10] freezes the exact six-round and checkpoint contract` | The final rounds use the role-of-agents prompt family. | GREEN |
| `EXP-05` | `phase1aRuntime.test.ts > [EXP-01] [EXP-02] [EXP-03] [EXP-04] [EXP-05] [EXP-06] [EXP-07] [EXP-09] [EXP-10] freezes the exact six-round and checkpoint contract` | Every participant completes a private pre-deliberation checkpoint before public turns. | GREEN |
| `EXP-06` | `phase1aRuntime.test.ts > [EXP-01] [EXP-02] [EXP-03] [EXP-04] [EXP-05] [EXP-06] [EXP-07] [EXP-09] [EXP-10] freezes the exact six-round and checkpoint contract` | Every participant completes the post-deliberation checkpoint at the fixed endpoint. | GREEN |
| `EXP-07` | `phase1aRuntime.test.ts > [EXP-01] [EXP-02] [EXP-03] [EXP-04] [EXP-05] [EXP-06] [EXP-07] [EXP-09] [EXP-10] freezes the exact six-round and checkpoint contract` | Cells B and D include the correctly ordered final checkpoint; A and C do not. | GREEN |
| `EXP-08` | `phase1aRuntime.test.ts > [ORCH-03] [ORCH-04] [VIS-01] [EXP-08] isolates private checkpoint canaries from public and peer contexts` | Private checkpoint contents remain isolated across participants and public history. | GREEN |
| `EXP-09` | `phase1aRuntime.test.ts > [EXP-01] [EXP-02] [EXP-03] [EXP-04] [EXP-05] [EXP-06] [EXP-07] [EXP-09] [EXP-10] freezes the exact six-round and checkpoint contract` | Consensus, low novelty, and host preference cannot shorten the core protocol. | GREEN |
| `EXP-10` | `phase1aRuntime.test.ts > [EXP-01] [EXP-02] [EXP-03] [EXP-04] [EXP-05] [EXP-06] [EXP-07] [EXP-09] [EXP-10] freezes the exact six-round and checkpoint contract` | All condition-defining inputs are immutable and stored in the run manifest. | GREEN |
| `EXP-11` | `phase1aRuntime.test.ts > [EXP-11] [EXP-12] [EXP-13] requires an explicit approved order and preserves declared protocol variations` | Replications preserve the contract while making deviations explicit. | GREEN |
| `EXP-12` | `phase1aRuntime.test.ts > [EXP-11] [EXP-12] [EXP-13] requires an explicit approved order and preserves declared protocol variations` | Each replication uses the schedule selected by the protocol decision. | GREEN |
| `EXP-13` | `phase1aRuntime.test.ts > [EXP-11] [EXP-12] [EXP-13] requires an explicit approved order and preserves declared protocol variations` | A deviation is retained and labeled rather than silently replaced. | GREEN |
| `EXP-14` | `phase1aRuntime.test.ts > [EXP-14] discloses the frozen report condition after every t0 commit and before the first public turn` | Report arms receive one explicit frozen disclosure after all private baselines and before discussion; non-report arms never receive it. | GREEN |

## Runtime orchestrator

| Requirement | Test or proposed test | What the assertions prove | Status |
|---|---|---|---|
| `ORCH-01` | `phase1aRuntime.test.ts > [ORCH-01] [ORCH-02] advances from the frozen manifest only after durable evidence commits` | Runtime states and calls derive from the approved manifest, not mutable input. | GREEN |
| `ORCH-02` | `phase1aRuntime.test.ts > [ORCH-01] [ORCH-02] advances from the frozen manifest only after durable evidence commits` | Required evidence is durable before the state becomes committed. | GREEN |
| `ORCH-03` | `phase1aRuntime.test.ts > [ORCH-03] [ORCH-04] [VIS-01] [EXP-08] isolates private checkpoint canaries from public and peer contexts` | Public turns contain only public history and approved common context. | GREEN |
| `ORCH-04` | `phase1aRuntime.test.ts > [ORCH-03] [ORCH-04] [VIS-01] [EXP-08] isolates private checkpoint canaries from public and peer contexts` | A checkpoint sees common and same-agent context only. | GREEN |
| `ORCH-05` | `phase1aRuntime.test.ts > [ORCH-05] [ORCH-06] [EVD-01] [EVD-02] [EVD-03] [EVD-04] records a common provider envelope with distinct hashes and protected raw artifacts` | All adapters return the common envelope and retain raw provider data. | GREEN |
| `ORCH-06` | `phase1aRuntime.test.ts > [ORCH-05] [ORCH-06] [EVD-01] [EVD-02] [EVD-03] [EVD-04] records a common provider envelope with distinct hashes and protected raw artifacts` | Every required call field and raw artifact reference is recorded. | GREEN |
| `ORCH-07` | `phase1aRuntime.test.ts > [ORCH-07] [ORCH-10] [DRY-03] resumes on a fresh runtime without duplicating committed calls` | Retry attempts are separate preserved records governed by a bounded policy. | GREEN |
| `ORCH-08` | `phase1aRuntime.test.ts > [RPT-09] [ORCH-08] stores refusal as terminal behavior and retries technical failure separately` | Abstention/refusal are outcomes; timeout/provider/invalid responses are technical failures. | GREEN |
| `ORCH-09` | `phase1aRuntime.test.ts > [ORCH-09] [DRY-01] [DRY-02] always completes six rounds even when every answer claims consensus` | Runtime never shortens the six-round protocol automatically. | GREEN |
| `ORCH-10` | `phase1aRuntime.test.ts > [ORCH-07] [ORCH-10] [DRY-03] resumes on a fresh runtime without duplicating committed calls` | Resume reconstructs persisted state and never repeats a committed call. | GREEN |
| `ORCH-11` | `phase1aRuntime.test.ts > [ORCH-11] emits explicit budget evidence and preserves the full context hash` | Budget/rate enforcement emits evidence and never silently truncates context. | GREEN |

## Context and visibility

| Requirement | Test or proposed test | What the assertions prove | Status |
|---|---|---|---|
| `VIS-01` | `phase1aRuntime.test.ts > [ORCH-03] [ORCH-04] [VIS-01] [EXP-08] isolates private checkpoint canaries from public and peer contexts` | No private checkpoint text or derivative summary reaches public history. | GREEN |
| `VIS-02` | `phase1aRuntime.test.ts > [VIS-02] [VIS-03] [RPT-01] [RPT-03] [RPT-04] [RPT-05] [RPT-06] assembles isolated review contexts and an ordered exact revision context` | Each reviewer receives the draft and its own prompt, never the peer review. | GREEN |
| `VIS-03` | `phase1aRuntime.test.ts > [VIS-02] [VIS-03] [RPT-01] [RPT-03] [RPT-04] [RPT-05] [RPT-06] assembles isolated review contexts and an ordered exact revision context` | Revision sees both reviews only after their terminal outcomes are durable. | GREEN |
| `VIS-04` | `phase1aRuntime.test.ts > [VIS-04] [VIS-07] [EVD-09] exports manifest, visibility, artifact index, call references, and integrity` | Exported events and artifacts retain their access classification. | GREEN |
| `VIS-05` | `phase1aRuntime.test.ts > [VIS-05] rejects secrets in manifests, prompts, and participant-visible artifacts while redacting operator payloads` | Operator secrets cannot cross into participant-visible or committed material. | GREEN |
| `VIS-06` | `phase1aRuntime.test.ts > [VIS-06] makes restored context assembly byte-identical for the same manifest and event history` | Identical manifest and event history produce byte-identical context and hashes. | GREEN |
| `VIS-07` | `phase1aRuntime.test.ts > [VIS-04] [VIS-07] [EVD-09] exports manifest, visibility, artifact index, call references, and integrity` | Each call has an exact context hash and an access-authorized raw reference. | GREEN |

## Joint report workflow

| Requirement | Test or proposed test | What the assertions prove | Status |
|---|---|---|---|
| `RPT-01` | `phase1aRuntime.test.ts > [VIS-02] [VIS-03] [RPT-01] [RPT-03] [RPT-04] [RPT-05] [RPT-06] assembles isolated review contexts and an ordered exact revision context` | Draft input is complete, public-only, and prompt-locked. | GREEN |
| `RPT-02` | `phase1aRuntime.test.ts > [RPT-02] [RPT-07] [RPT-08] keeps report artifacts immutable and t2 strictly after the revised report` | The first draft remains immutable through reviews and revision. | GREEN |
| `RPT-03` | `phase1aRuntime.test.ts > [VIS-02] [VIS-03] [RPT-01] [RPT-03] [RPT-04] [RPT-05] [RPT-06] assembles isolated review contexts and an ordered exact revision context` | Reviews share exactly one draft while prompts remain reviewer-specific. | GREEN |
| `RPT-04` | `phase1aRuntime.test.ts > [VIS-02] [VIS-03] [RPT-01] [RPT-03] [RPT-04] [RPT-05] [RPT-06] assembles isolated review contexts and an ordered exact revision context` | Neither reviewer receives the other's output. | GREEN |
| `RPT-05` | `phase1aRuntime.test.ts > [VIS-02] [VIS-03] [RPT-01] [RPT-03] [RPT-04] [RPT-05] [RPT-06] assembles isolated review contexts and an ordered exact revision context` | Revision cannot start with a pending review. | GREEN |
| `RPT-06` | `phase1aRuntime.test.ts > [VIS-02] [VIS-03] [RPT-01] [RPT-03] [RPT-04] [RPT-05] [RPT-06] assembles isolated review contexts and an ordered exact revision context` | Revision context has exactly the authorized three artifacts and prompt. | GREEN |
| `RPT-07` | `phase1aRuntime.test.ts > [RPT-02] [RPT-07] [RPT-08] keeps report artifacts immutable and t2 strictly after the revised report` | Prompts, contexts, timing, hashes, outcomes, and outputs remain independently auditable. | GREEN |
| `RPT-08` | `phase1aRuntime.test.ts > [RPT-02] [RPT-07] [RPT-08] keeps report artifacts immutable and t2 strictly after the revised report` | The final checkpoint cannot precede or bypass revision. | GREEN |
| `RPT-09` | `phase1aRuntime.test.ts > [RPT-09] [ORCH-08] stores refusal as terminal behavior and retries technical failure separately` | Refusal completes review behavior; technical failure follows retry/failure policy. | GREEN |
| `RPT-10` | `phase1aWp03.test.ts > [RPT-10] counterbalances writer and reviewer roles across the three replications` plus runtime integration | Each participant writes once, reviews twice, and the selected allocation is preserved in evidence; scientific freeze remains pending. | GREEN |

## Evidence schema

| Requirement | Test or proposed test | What the assertions prove | Status |
|---|---|---|---|
| `EVD-01` | `phase1aRuntime.test.ts > [ORCH-05] [ORCH-06] [EVD-01] [EVD-02] [EVD-03] [EVD-04] records a common provider envelope with distinct hashes and protected raw artifacts` | Provider-call records contain all required identity and lifecycle fields. | GREEN |
| `EVD-02` | `phase1aRuntime.test.ts > [ORCH-05] [ORCH-06] [EVD-01] [EVD-02] [EVD-03] [EVD-04] records a common provider envelope with distinct hashes and protected raw artifacts` | Exact call inputs and raw output have distinct verifiable hashes. | GREEN |
| `EVD-03` | `phase1aRuntime.test.ts > [ORCH-05] [ORCH-06] [EVD-01] [EVD-02] [EVD-03] [EVD-04] records a common provider envelope with distinct hashes and protected raw artifacts` | Missing provider usage remains explicitly unknown. | GREEN |
| `EVD-04` | `phase1aRuntime.test.ts > [ORCH-05] [ORCH-06] [EVD-01] [EVD-02] [EVD-03] [EVD-04] records a common provider envelope with distinct hashes and protected raw artifacts` | Raw provider material is stored by reference outside the normalized event stream. | GREEN |
| `EVD-05` | `phase1aRuntime.test.ts > [EVD-05] [DRY-06] links successful retries to preserved failed attempts` | Every attempt survives and a success points to preceding failures. | GREEN |
| `EVD-06` | `phase1aRuntime.test.ts > [EVD-06] [EVD-07] [DRY-10] detects event deletion, reorder, and artifact substitution` | Per-run event sequence numbers are unique and monotonic. | GREEN |
| `EVD-07` | `phase1aRuntime.test.ts > [EVD-06] [EVD-07] [DRY-10] detects event deletion, reorder, and artifact substitution` | Cryptographic hash chaining fails verification after deletion or reorder. | GREEN |
| `EVD-08` | `phase1aRuntime.test.ts > [EVD-08] binds every derived metric to exact events and an algorithm version` | Derived values identify both their exact evidence and computation version. | GREEN |
| `EVD-09` | `phase1aRuntime.test.ts > [VIS-04] [VIS-07] [EVD-09] exports manifest, visibility, artifact index, call references, and integrity` | The evidence bundle contains every required top-level contract item. | GREEN |

## First dry-run acceptance

| Requirement | Test or proposed test | What the assertions prove | Status |
|---|---|---|---|
| `DRY-01` | `phase1aRuntime.test.ts > [ORCH-09] [DRY-01] [DRY-02] always completes six rounds even when every answer claims consensus` | One valid fixture reaches completion with the exact round count. | GREEN |
| `DRY-02` | `phase1aRuntime.test.ts > [ORCH-09] [DRY-01] [DRY-02] always completes six rounds even when every answer claims consensus` | The end-to-end run honors the fixed endpoint. | GREEN |
| `DRY-03` | `phase1aRuntime.test.ts > [ORCH-07] [ORCH-10] [DRY-03] resumes on a fresh runtime without duplicating committed calls` | Recovery is idempotent on the real Phase 1A path. | GREEN |
| `DRY-04` | `phase1aRuntime.test.ts > [DRY-04] [DRY-05] [DRY-09] completes the report fixture without checkpoint or reviewer canary leakage and exports public history only` | All five private/reviewer channels remain within their authorization boundaries. | GREEN |
| `DRY-05` | `phase1aRuntime.test.ts > [DRY-04] [DRY-05] [DRY-09] completes the report fixture without checkpoint or reviewer canary leakage and exports public history only` | The public transcript excludes every non-public event family. | GREEN |
| `DRY-06` | `phase1aRuntime.test.ts > [EVD-05] [DRY-06] links successful retries to preserved failed attempts` | Injected timeout evidence remains traceable through recovery. | GREEN |
| `DRY-07` | `phase1aRuntime.test.ts > [DRY-07] [DRY-08] preserves refusal semantics and a replayable partial bundle after terminal failure` | Refusal is not mislabeled as provider failure. | GREEN |
| `DRY-08` | `phase1aRuntime.test.ts > [DRY-07] [DRY-08] preserves refusal semantics and a replayable partial bundle after terminal failure` | A failed run still yields a verifiable partial bundle. | GREEN |
| `DRY-09` | `phase1aRuntime.test.ts > [DRY-04] [DRY-05] [DRY-09] completes the report fixture without checkpoint or reviewer canary leakage and exports public history only` | The report-arm happy path creates all immutable artifacts in order. | GREEN |
| `DRY-10` | `phase1aRuntime.test.ts > [EVD-06] [EVD-07] [DRY-10] detects event deletion, reorder, and artifact substitution` | The completed fixture passes both structural and cryptographic integrity checks. | GREEN |
| `DRY-11` | `phase1aRuntime.test.ts > [DRY-11] lets a second operator verify and explain every committed transition from evidence alone` | A second operator can replay without hidden in-memory state. | GREEN |

## Audit summary

- `GREEN`: 80 requirements have direct behavioral proof in the focused Phase 1A runtime, WP03, and WP05 acceptance suites.
- The deterministic test fixture supplies explicit `DEC-03` speaking order and `DEC-06` exact replay policy values; the runtime has no implicit defaults.
- Live-provider identifiers, limits, final prompts, and research operations remain open in `decision-log.md` and do not weaken the executable Phase 1A contract.

## WP05 context-locked replay

| Requirement | Test or proposed test | What the assertions prove | Status |
|---|---|---|---|
| `RPL-01` | `contextLockedReplay.test.ts > [RPL-01] keeps Repeat and Replay separate, gates unfinished parents, and requires confirmation before a call` | Repeat links a same-manifest child run while Replay is disabled for unfinished runs and cannot call a provider before review. | GREEN |
| `RPL-02` | `contextLockedReplay.test.ts > [RPL-02] locks the exact parent request and refuses missing source evidence before provider invocation` | Snapshot IDs, prompt and context hashes derive from archived exact request evidence; damaged sources are rejected before execution. | GREEN |
| `RPL-03` | `contextLockedReplay.test.ts > [RPL-03] builds the four registered cue cells, keeps argument bytes fixed, and detects an out-of-span edit` | All four cue combinations exist, preserve argument bytes and reject a change outside the registered cue projection. | GREEN |
| `RPL-04` | `contextLockedReplay.test.ts > [RPL-04] randomizes a recorded order and gives all repeated trials the same output-free frozen context` | Seeded trial order is reproducible and no earlier trial output contaminates a later context. | GREEN |
| `RPL-05` | `contextLockedReplay.test.ts > [RPL-05] stores immutable child trials with complete parent links and leaves the parent fingerprint unchanged` | Every child identifies the parent run, opportunity and snapshot while the parent's stable fingerprint remains unchanged. | GREEN |
| `RPL-06` | `contextLockedReplay.test.ts > [RPL-06] archives success and classified failures, retrying only the same locked model` | Delivered text and technical failures are archived separately and every retry retains the parent provider/model pair. | GREEN |
| `TST-01` | `contextLockedReplay.test.ts > [TST-01] separates delivered refusal behavior from provider refusal infrastructure` | Model-written refusal text is retained as behavior while a provider refusal has no delivered output. | GREEN |
| `TST-02` | `contextLockedReplay.test.ts > [TST-02] recomputes replay visibility and reports a deliberately inserted private marker` | Clean contexts pass and deliberately inserted private markers produce a visibility failure. | GREEN |
| `TST-03` | `contextLockedReplay.test.ts > [TST-03] hides registered speaker identifiers and flags residual identity in the unchanged argument for review` | Hidden cells remove registered metadata while names in immutable argument bytes remain unchanged and force review. | GREEN |
| `TST-04` | `contextLockedReplay.test.ts > [TST-04] classifies timeout, malformed response, rate limit and provider refusal with linked retries` | All required injected fault classes resolve correctly and a retry points to the failed parent attempt. | GREEN |
| `TST-05` | `contextLockedReplay.test.ts > [TST-05] validates outcome-specific trace chains and names a damaged trial-to-attempt gap` | Successful and technical paths apply different link requirements and a removed attempt produces an identified trace gap. | GREEN |
| `TST-06` | `contextLockedReplay.test.ts > [TST-06] derives six round results with settings, evidence and unavailable rather than zero token usage` | Derived results contain six rounds, settings, evidence references and explicit unavailable token values. | GREEN |
| `TST-07` | `contextLockedReplay.test.ts > [TST-07] proves every WP05 requirement rejects a deliberately damaged or invalid fixture` | Twelve targeted counterexamples cover RPL-01 through TST-06; the meta-test fails if any rejection or FAIL path disappears. | GREEN |
