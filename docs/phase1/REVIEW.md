# Phase 1A implementation — review guide

## Scientific machinery increment

[SCIENTIFIC_ANALYSIS.md](SCIENTIFIC_ANALYSIS.md) documents the new opt-in v2
questionnaire, endpoint families, coding/adjudication resolution, Krippendorff
reliability, paired bootstrap/Holm calculations, optional REML sensitivity model,
human S8 quality review, immutable datasets/analysis snapshots and UI/API/CLI.
It supersedes the pending-engineering list below; final scientific choices and
live evidence remain pending. No production deployment or paid experiment ran.

Verification: **466 tests in 45 files passed**, including published reliability
reference examples, seeded numerical checks, snapshot/locking/tampering tests and
the scientific UI/API lifecycle. Build and whitespace checks passed. These results
validate engineering behavior, not the scientific instruments themselves.

## Canonical eight-stage increment

See [CANONICAL_PROTOCOL.md](CANONICAL_PROTOCOL.md) for the confirmed stage sequence,
proposed S7 rule, new UI and test coverage. The new branch builds on merged PR #6.
S4 reconvening, S6-before-S7 sealing, deterministic S8, durable records, exports and
closure evidence registration are implemented. Scientific PASS stays blocked;
rubric-specific calibration/reliability and inferential evaluators remain a separate
increment after their contracts are agreed. No live experiment or deployment ran.

Verification for this increment (September 10, 2026): `npm test` — **451 tests in
42 files passed**; `npm run build` passed; `git diff --check` passed. These are
engineering checks, not live calibration or scientific validation evidence.

The sections below describe the previously merged behavioral foundation.

This branch extends the existing instrument, not the scientific peer-review pipeline
described in the September PDFs. The controlling proposal is
[IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md). The roles and rubric remain DRAFT.
No live experiment or deployment was performed for this implementation.

September 10 behavioral revision: [BEHAVIORAL_PROTOCOL.md](BEHAVIORAL_PROTOCOL.md)
operationalizes Mateo's framework. New templates use five proposed functional roles,
independent initial/final questionnaires, weighted human role criteria and substantive
interaction coding. Older frozen campaigns retain their original contract.

## What is implemented

- An optional `phase1` config contract and `phase1a-v1` participant prompt resolver.
  Each participant receives the unchanged v1 scaffold, common framing and only its
  own role block. Control target roles exist only in the campaign/evaluator layer.
- Immutable role-pack snapshots, content hashes and draft revisions. Reusing a frozen
  pack ID/version with different text is rejected; increment the version for edits.
- Paired neutral-control / differentiated-role cases, cyclic role allocation and
  alternating AB/BA execution order. All settings except condition/role assignments
  must match. Complete hashes remain distinct; a separate fixed-settings fingerprint
  identifies comparable pairs. No random allocation or allocation seed is implied.
- Sequential execution through the existing provider, context, retry, budget and
  recovery paths. Durable case/run links retain unstarted and partial cases. Completed
  cases are never silently replaced when a campaign is launched again.
- A provider-attempt ledger with a hard admission count ceiling and a reported-token
  stop threshold. Unknown token usage blocks further admission and is not zero cost.
  Scripted moderator calls use no external provider and are not charged to this ledger.
- A researcher UI at `/phase1`, API under `/api/phase1`, and `agora phase1` CLI.
- A versioned evaluation JSON editor freezes questions/options, criterion weights,
  primary outcomes, private wording and scoring before execution. Ten extra probes
  per run share the existing budgets. Their exact records and failures are exported
  separately from workshop messages; assessment answers never enter deliberation.
- Descriptive per-agent/phase/channel outcomes, participation and contribution shares,
  source IDs, missingness, measured usage and latency, and within-pair differences.
  Actual opportunity sequences expose speaking positions and group allocations.
- Behavioral outputs add categorical initial/final switching, confidence shifts,
  weighted role-fidelity scores by reviewer, direct-reply and interaction-contingency
  rates, reviewer-inventoried argument uptake, response edges/centrality and message
  Gini/entropy. All retain denominators and missingness; incomplete review is not zero.
- Human annotations in the semantic evidence layer: exact source/target quotes,
  frozen rubric, reviewer identity, append-only revisions/adjudication and optional
  links to existing semantic nodes. Nothing derived is fed back to workshop agents.
- Canonical JSON review bundles containing every planned case, exact configs/prompts,
  raw events/messages/invocations, recovery/context records, semantic artifacts,
  human labels, ledger, explicit evidence links and per-artifact SHA-256 hashes.

## Operator workflow

Install the existing dependencies (`npm ci`), then build and start the server using
the repository's normal credential configuration. Set `AGORA_AUTH_SCOPE=all` when
private transcripts or independent-review material must not be publicly readable.
The existing shared-password model is unchanged; do not put credentials in prompts
or config JSON. No provider key is needed for mock execution.

1. Open `/phase1`. Edit the common/neutral instructions and five role blocks.
2. Under advanced settings, choose the provider/model, fixed participant order,
   moderator mode, rounds, context policy and budgets. Tools stay disabled.
3. Choose blocks and ceilings. One block is an engineering check. Five blocks give
   each identity each role once but have a 3:2 AB/BA imbalance. Ten blocks balance
   both role allocation and AB/BA order. Neither count is a power calculation.
4. Review the draft behavioral evaluation JSON (questionnaire, criteria, weights and
   private instruction); use `null` only to retain transcript-only evaluation. Save
   and preview the exact prompt/instruction catalogue and structural comparison.
   Preview does not fabricate the future conversation: actual rendered context is
   recorded on each invocation.
5. Freeze the snapshot, then execute pending cases. Non-mock providers require the
   separate live checkbox. This can spend API credits; it is never implicit.
6. Inspect cases through existing run/timeline/transcript views and the campaign
   comparison. Refresh during execution to see progress.
7. Open human review, enter a stable reviewer identity, then submit evidence-linked
   annotation JSON. Relational labels require target IDs and quotes. Role labels are
   `consistent`, `inconsistent`, `not_assessable`; other categories use `present`,
   `absent`, `not_assessable`. New `role_criterion` readings use `scored` plus a 0–2
   score, or `not_assessable` plus null. See the behavioral protocol for interaction
   and idea-uptake fields. Preserve rationales and use revision/adjudication IDs.
8. Download the review bundle. This is an intentionally **unblinded researcher
   export**, including private transcripts, target-role assignments and all labels.

The frozen campaign can be duplicated into the editor; changed role-pack text needs
a new version. Mid-campaign settings cannot be edited.

### CLI

Commands print JSON; save template output to a JSON file using your usual editor or
shell, then edit that file. `--input` accepts this campaign input, not a run config.

```bash
npm run agora -- phase1 template
npm run agora -- phase1 plan --input phase1-input.json
npm run agora -- phase1 draft --input phase1-input.json
npm run agora -- phase1 freeze --input phase1-input.json
npm run agora -- phase1 run CAMPAIGN_ID
npm run agora -- phase1 show CAMPAIGN_ID
npm run agora -- phase1 annotate CAMPAIGN_ID --input annotation.json
npm run agora -- phase1 export CAMPAIGN_ID --out exports/phase1
```

Use `--live` only to authorize a chosen live provider. Use `--resume` to continue an
interrupted case only when its frozen `base_config.recovery.enabled` is true.
The starter retains the selected base config's recovery policy: enable it before
freezing if restart recovery is needed. Unknown in-flight usage after a hard crash
conservatively prevents further provider calls; it cannot be reset by relaunching.
Create a separately identified replacement campaign if that evidence cannot be
recovered. Preserve the interrupted one in the analysis.

`phase1 evidence CAMPAIGN_ID --run RUN_ID --purpose exact_rerun|failure_attribution`
links additional engineering runs explicitly. Exact reruns must match a case hash;
fault evidence must match a case except for its explicit fault plan and contain an
infrastructure failure. These links do not declare legacy acceptance gates passed.
Use the existing `rerun`, `export` and `accept` commands for that evidence package.

### API

All mutation endpoints retain the existing authentication/origin middleware.

| Endpoint | Input/output |
| --- | --- |
| `POST /api/phase1/preview` | Campaign input → plan and resolved prompts; no calls |
| `POST /api/phase1/drafts` | Campaign input → immutable draft ID |
| `POST /api/phase1/freeze` | `{draft_id}` → frozen campaign ID |
| `GET /api/phase1/campaigns/:id` | Frozen manifest, case progress, descriptive analysis |
| `POST /api/phase1/campaigns/:id/start` | `{allow_live:false,resume_interrupted:false}` → asynchronous execution |
| `POST /api/phase1/campaigns/:id/annotations` | Annotation JSON → immutable annotation ID |
| `GET /api/phase1/campaigns/:id/annotations?author=NAME` | Workflow-blinded review history |
| `POST /api/phase1/campaigns/:id/evidence` | `{run_id,purpose}` → explicit evidence link |
| `POST /api/phase1/campaigns/:id/export` | Unblinded canonical review bundle |

## Limits and review priorities

- The JSON annotation editor is functional but deliberately minimal. Independent
  labels are hidden per source/category/criterion/idea until submission. Reviewer names are
  self-declared under a shared credential, not independently authenticated accounts.
  A reviewer can bypass workflow blinding via admin/export access; this is not an
  adversarial blinding system. Text can reveal its own condition as well.
- The token threshold is checked before admission, so one response can overshoot it.
  Provider prices are unavailable (`estimated_cost: null`), not a monetary guarantee.
  Budget denial is recorded as infrastructure unavailability. A run may reach its
  terminal state with failed calls; inspect `P1A-DELIVERY` and partial denominators.
- `P1A-*` runtime checks do not replace M1–M30 or serve as a release certificate.
  `engineering_verified` is not auto-set by a campaign. Release engineering evidence
  is the test/build record below. `live_executed` and `human_annotated` record separate
  facts; `scientific_analysis_completed` remains false pending an agreed analysis.
- Human annotation outcomes retain raw revisions. Scores are calculated separately
  by reviewer under frozen rules, never pooled across reviewers or certified as
  persuasion. Conflicting duplicate readings are excluded, not resolved by recency.
  Choosing adjudicated labels and inferential analysis requires the reviewed protocol.
- Mock providers prove plumbing only. In particular, the legacy `mock` generator is
  not a role-adherence simulator. An apparent absence of a role effect is not a finding.
- No Phase 1B research tools, six-condition grid, voting, images, peer review,
  autonomous manuscript production or automatic scientific interpretation is added.

## Verification

Behavioral revision verification on 10 September 2026: **439 tests passed in 41 files**,
TypeScript build passed, and `git diff --check` passed. This includes the ten-case
mock campaign and the authenticated HTML workflow test. No live-provider test was
authorized or performed. Dependency installation reported three moderate advisory
findings in the existing dependency tree; dependencies were not upgraded in this branch.

Run `npm test`, `npm run build`, and `git diff --check`. New coverage includes:

- Historical v1 config/prompt hash fixtures computed from baseline commit
  `5fd5f6c53372d974836dc34e4852d8eb799ad06b`.
- Strict treatment-only diffs, hidden-role prompt separation, frozen version integrity,
  cyclic permutations and AB/BA order.
- Ten-case mock execution, no duplicate completed cases, known/unknown usage ceilings,
  retained partial cases, interrupted-run recovery and explicit evidence links.
- Null denominators, quoted evidence validation, independent reviewer visibility,
  immutable revision/adjudication history and portable artifact hashes.
- An authenticated loopback HTTP test exercising the actual HTML form workflow from
  draft through annotation/export, including HTML escaping and origin rejection.
- Independent assessment contexts and no answer leakage into dialogue, valid null
  and nonzero position changes, invalid JSON/missing answers, shared budgets,
  assessment export, and interruption without reissuing probes.
- Weighted criterion scoring, per-criterion reviewer hiding, actual-context reply
  validation, duplicate-label conflicts, introduced-idea uptake and the difference
  between unreviewed outcomes and a fully reviewed zero-contingency outcome.

The HTTP integration test needs permission to bind a temporary loopback port in
restricted sandboxes. It does not call an external model or service.
