# AGORA Phase 1A — Independent Review of PR #9

**Review date:** 2026-09-11  
**Repository:** `https://github.com/criticaldata/agoraworkshop`  
**Pull request:** [PR #9](https://github.com/criticaldata/agoraworkshop/pull/9)  
**Review branch:** `docs/phase1-pr9-independent-review`  
**Review scope:** independent technical and scientific implementation audit; no application-code changes, fixes, merge, or push were performed.

## Review standard

This report uses three separate claim levels throughout:

- **IMPLEMENTED:** the repository contains the relevant code or schema.
- **TECHNICALLY VERIFIED:** the code path was exercised by tests or a local runtime check, and the observed result matched the stated contract.
- **SCIENTIFICALLY VALIDATED:** the instrument, human coding, reliability, frozen analysis choices, and real study data support a bounded scientific conclusion.

The present review establishes implementation and technical evidence where supported. It does not convert a passing test suite, a mock run, or a deterministic fixture into scientific validation.

## Executive verdict

PR #9 is a substantial Phase 1A engineering increment. It adds an opt-in canonical eight-stage runtime, sealed single-choice voting, deterministic S8 output, versioned scientific contracts, annotation/reliability/statistical machinery, locked snapshots, exports, and a review UI. Simon's headline of 466 passing tests is confirmed.

The implementation is not yet a clean scientific release candidate. The most important reasons are:

1. The default `scope=write` authentication configuration leaves sensitive Phase 1 campaign and review GET routes open. A local runtime reproduction returned private messages, sealed ballot records, and role-target metadata to an unauthenticated request.
2. PR #9 is based on merged PR #6 but does not contain the separate PR #7 correctness/privacy/measurement fixes. In particular, a valid `explicit_abstention` or `no_op` is rejected by the current Phase 1A delivery check, and canonical discussion-stage completion requires `resolution === 'success'`.
3. The functional roles, questionnaire, rubric, reliability thresholds, analysis plan, and calibration are still draft or unapproved. No live Phase 1A calibration campaign is included in PR #9.
4. P1-D is deliberately non-passable in code and `scientific_pass` is always `false`. This is the correct safety boundary, but it means the PR cannot honestly be presented as scientific closure.

### Readiness summary

| Question | Verdict | Evidence-based interpretation |
| --- | --- | --- |
| Canonical eight-stage code path | READY_WITH_CONDITIONS | All eight states are implemented and a canonical mock fixture reached S1-S8; runtime edge cases and security findings remain. |
| Deterministic/mock validation | READY_WITH_CONDITIONS | 466/466 tests pass, including canonical, science, statistics, UI, lock, oracle, restart, and export coverage. |
| Scientific instrument review | NOT_READY | Draft role pack, questionnaire, rubric, endpoint hierarchy, thresholds, and analysis choices still require team decisions. |
| Live calibration | NOT_READY | PR #9 contains no live Phase 1A campaign or live calibration bundle. |
| Confirmatory Phase 1A | NOT_READY | Calibration, independent annotation, reliability evidence, protocol approval, and a frozen confirmatory plan are absent. |
| Phase 1B | NOT_STARTED | No capability-treatment schema, corpus, registry, assignment, or Phase 1B metric/test layer is present. |
| Overall PR #9 scientific closure | NOT_READY | Technically meaningful and reviewable, but not scientifically validated or ready for confirmatory claims. |

---

## STEP 1 - Verify PR and Git state

The PR was inspected directly with GitHub CLI and cross-checked against local refs.

| Item | Verified value |
| --- | --- |
| Title | `Phase 1A: canonical protocol and scientific analysis workflow` |
| Author | `denemlabs` - Simon Heilles; non-bot account |
| State | `OPEN` |
| Draft | Yes (`isDraft=true`) |
| URL | `https://github.com/criticaldata/agoraworkshop/pull/9` |
| Base branch | `master` |
| Base SHA | `7f0cd4d2d3bc972b5244294c98faacc87e3a46cb` |
| Head branch | `codex/phase1a-canonical-closure` |
| Head SHA | `4f20c23660d9e508c4d6724aedd7f1cb7a2c52ec` |
| Local HEAD | Same as PR head SHA |
| Merge base | `7f0cd4d2d3bc972b5244294c98faacc87e3a46cb` |
| Commits | 2 |
| Insertions/deletions | `+2105 / -30` |
| Files changed | 44 |
| Mergeability | `MERGEABLE` |
| Merge state | `CLEAN` |
| GitHub checks | 2 `AGORA Phase 0 / verify` runs, both `COMPLETED / SUCCESS` |
| Check run IDs | `34549994881` (job `103110680617`) and `34549992692` (job `103110673992`) |
| PR status at review | Open, draft, not merged |

PR commits:

1. `aa7141b707cb26940db56335bc6ddb20ed2eef89` - `feat(phase1): add canonical eight-stage protocol and closure evidence`
2. `4f20c23660d9e508c4d6724aedd7f1cb7a2c52ec` - `Implement Phase 1A scientific analysis and immutable review workflow`

The relevant lineage is:

```text
5fd5f6c  Phase 0 closure deck (#5)
    |
4cd396f  Phase 0/0.1 NVIDIA closure evidence (#4)
    |
27304a0  Phase 1A role experiment implementation (PR #6 head)
    |\
    | 07748f2  PR #7: correctness, privacy, and measurement fixes
    |          (open branch; not an ancestor of PR #9)
    |
7f0cd4d  origin/master: merge of PR #6
    |
aa7141b  PR #9 commit 1
    |
4f20c23  PR #9 head
```

PR #9 includes the merged PR #6 state through `origin/master`. It does **not** include PR #7: `git merge-base origin/codex/phase1a-correctness-security-fixes HEAD` is `27304a004eea25203a0fe28c92bad537f689a21a`, before PR #7's `07748f2` commit. Therefore, a previous report that assumed PR #7 was already present would be incorrect.

### Exact PR #9 file set

| Group | Files |
| --- | --- |
| Documentation (5) | `docs/phase1/BEHAVIORAL_PROTOCOL.md`, `docs/phase1/CANONICAL_PROTOCOL.md`, `docs/phase1/IMPLEMENTATION_SPEC.md`, `docs/phase1/REVIEW.md`, `docs/phase1/SCIENTIFIC_ANALYSIS.md` |
| Core/runtime integration (14) | `src/acceptance/phase01.ts`, `src/config/schema.ts`, `src/db/schema.ts`, `src/events/types.ts`, `src/export/exporter.ts`, `src/orchestrator/runner.ts`, `src/orchestrator/stateMachine.ts`, `src/prompts/registry.ts`, `src/providers/scriptedModerator.ts`, `src/providers/types.ts`, `src/semantic/phase1Annotations.ts`, `src/server/docs.ts`, `src/server/pages.ts`, `src/server/phase1.ts` |
| Phase 1 implementation (20) | `src/phase1/analysis.ts`, `src/phase1/artifactReview.ts`, `src/phase1/behavioralAnalysis.ts`, `src/phase1/campaign.ts`, `src/phase1/canonicalContract.ts`, `src/phase1/cli.ts`, `src/phase1/closure.ts`, `src/phase1/collective.ts`, `src/phase1/contracts.ts`, `src/phase1/evaluationContract.ts`, `src/phase1/export.ts`, `src/phase1/mixedModel.ts`, `src/phase1/positions.ts`, `src/phase1/preview.ts`, `src/phase1/scienceContract.ts`, `src/phase1/scienceProvenance.ts`, `src/phase1/scienceStore.ts`, `src/phase1/scientificAnalysis.ts`, `src/phase1/scientificDataset.ts`, `src/phase1/statistics.ts` |
| Tests (5) | `tests/phase1Canonical.test.ts`, `tests/phase1Science.test.ts`, `tests/phase1ScienceUi.test.ts`, `tests/phase1Statistics.test.ts`, `tests/phase1Ui.test.ts` |

---

## STEP 2 - Establish the pre-PR #9 baseline

The actual pre-PR #9 baseline is `origin/master` at `7f0cd4d`, not an empty Phase 1 repository. It already contained the PR #6 role-experiment implementation and the merged Phase 0/0.1 work.

| Capability | Before PR #9 | After PR #9 | Evidence |
| --- | --- | --- | --- |
| Campaign planning and freeze | Implemented for Phase 1A role experiments | Preserved and extended with canonical/scientific fields | `src/phase1/campaign.ts` in base and PR diff |
| Control/treatment pairing | Implemented | Preserved; fixed-setting comparison remains explicit | `planCampaign`, `compareConditions` |
| Role assignment | Implemented functional-role pack and neutral control path | Versioned role/evaluation contracts, canonical cyclic rotation and AB/BA ordering retained | `src/phase1/evaluationContract.ts`, `campaign.ts` |
| Initial/final probes | Implemented under behavioral-v1 | Adds behavioral-v2 response contract, canonical S1/S6 placement and stronger provenance | `src/phase1/positions.ts`, `evaluationContract.ts` |
| Annotation storage | Existing semantic annotation layer | Adds Phase 1 categories, exact evidence validation, revisions and adjudication references | `src/semantic/phase1Annotations.ts` |
| Descriptive metrics | Role fidelity, interaction, participation, position change | Adds metric registry and collective/S8 endpoints | `src/phase1/behavioralAnalysis.ts`, `scientificAnalysis.ts` |
| Phase 0 integration | Already merged and validated in prior work | Regression-tested again; canonical Phase 1 uses the same infrastructure | `src/acceptance`, fresh Phase 0 validation below |
| Explicit eight-stage state machine | Absent | Implemented as opt-in canonical protocol | `src/phase1/canonicalContract.ts`, `src/orchestrator/stateMachine.ts` |
| Public reconvening and distinct Public Plenary II | Absent as separate canonical stages | Implemented as `PUBLIC_RECONVENING` and distinct final-discussion instruction | `runner.ts`, `prompts/registry.ts` |
| S7 sealed collective outcome | Absent | Implemented as one-attempt ballot collection and deterministic aggregation | `src/phase1/collective.ts` |
| S8 structured output | Absent | Implemented as deterministic schema-validated artifact | `CollectiveArtifactSchema`, `saveCollectiveOutput` |
| Scientific dataset/reliability/statistics | Absent | Implemented as draft-capable, lockable analysis machinery | `scientificDataset.ts`, `statistics.ts`, `scienceStore.ts` |
| Aggregate P1-A through P1-D gates | Only earlier descriptive P1A checks | Implemented; P1-D intentionally remains blocked | `src/phase1/closure.ts` |
| PR #7 correction set | Not in base; separate branch only | Still not in PR #9 ancestry | Git merge-base verification |

The major movement is therefore real, but it is a movement from a role-pilot scaffold to a canonical, auditable Phase 1A apparatus - not from no Phase 1 code to a scientifically validated experiment.

---

## STEP 3 - Reconstruct the actual runtime flow

The canonical path is opt-in. `PlanInput.canonical` must be present and validated; legacy Phase 1 plans remain available and do not automatically migrate to the new protocol. The canonical schema fixes `canonical-eight-stage-v1`, `single_choice_absolute_majority_v1`, `single_attempt_no_repair`, and `deterministic_collective_artifact_v1`.

| Stage | Executable state? | Entry condition | Agent actions | Stored evidence | Exit condition | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| S1 - Independent Initial Position | Yes | Canonical run begins S1 before the moderator opening | Five independent position probes with empty workshop history | `phase1_stages`, `phase1_positions`, invocations, usage, context IDs and hashes | Probe records are retained with `valid`, `invalid`, or `missing` status; fixture completes with valid records | Canonical runtime and position tests | COMPLETE |
| S2 - Public Plenary I | Yes | S1 finishes; public discussion state starts | Participants speak in configured deterministic order; scripted moderator may frame | Events, opportunities, invocations, messages, deliveries and contexts | Stage row is finished after scheduled participant opportunities; current code requires all resolutions to be `success` | Canonical stage/order tests | COMPLETE |
| S3 - Private Rooms / Breakouts | Yes | S2 finishes; private channel starts | Each participant speaks in exactly one configured breakout group | Private deliveries, visibility/context provenance, stage and event records | Same resolution-based completion rule; privacy is audited | Canonical privacy and breakout tests | COMPLETE |
| S4 - Public Reconvening | Yes | S3 finishes; `PUBLIC_RECONVENING` is inserted by canonical state planning | Participants choose what to report publicly from the breakout; instruction prohibits claiming unreported private material | Public messages and the instruction/prompt provenance | Scheduled participant opportunities finish | Canonical S4 prompt/output tests | COMPLETE |
| S5 - Public Plenary II | Yes | S4 finishes; final public discussion state starts | Participants must engage a specific earlier public argument and explain incorporation, challenge, or rejection | Public messages, exposed-source IDs, delivery/context records | Same resolution-based completion rule | Canonical S5 prompt tests | COMPLETE |
| S6 - Independent Final Position | Yes | S5 finishes and before closing/S7 | Five final position probes use the authorized workshop snapshot; no ballot or collective output is appended | `phase1_positions` final rows, exact request/response, source IDs, usage | Five valid final positions are required for canonical S7 collection | S6 barrier and probe-context tests | COMPLETE |
| S7 - Collective Outcome / Sealed Vote | Yes | S6 stage finish is durable and valid final positions exist | One ballot attempt per participant, one exact choice or explicit ballot abstention per question | Sealed ballot rows, request/context/response/usage, status, parsed value and deterministic aggregation | Five valid ballots for a decided or no-majority result; incomplete ballot state is retained | Ballot schema, sealing, tie, abstention, no-repair and determinism tests | COMPLETE |
| S8 - Structured Final Output | Yes | S7 path returns and output is generated by code | No participant or moderator model call; code creates the collective artifact | `phase1_collective_outputs`, artifact JSON, hash, final/ballot record IDs | Schema validation, deterministic hash and audit | S8 schema/hash/tamper tests | COMPLETE |

**Implementation conclusion:** all eight canonical states exist and execute in the opt-in mock path. **Scientific conclusion:** the existence of those states does not establish that live agents completed them, that the draft instruments are valid, or that all valid behavioral outcomes are handled correctly.

---

## STEP 4 - Verify S6 to S7 ordering

The executable order is:

```text
S5 finish
  -> S6 start
  -> collect five independent final positions
  -> S6 finish
  -> S7 start
  -> collect sealed ballots
  -> S8 deterministic artifact
```

The ordering is supported by three independent mechanisms:

1. `src/orchestrator/runner.ts` calls final `collectPositions` and finishes S6 before entering canonical S7 and calling `collectBallots`.
2. `auditCollective` reads the event sequence and rejects the run unless exactly one complete S6 finish precedes exactly one S7 start.
3. Canonical tests assert that S6 failure blocks S7 and that ballot/collective records are not inserted into participant contexts.

The S6 request uses the workshop dialogue snapshot and the frozen participant prompt. S7 ballot rows, ballot answers, and S8 output are not messages and are not appended to history. S7's context is reconstructed from the pre-closing dialogue, filtered through each participant's authorized visibility policy.

**Verdict:** S6 is not contaminated by the S7 outcome in the core runner. The web privacy leak reported in Finding C-01 is still serious, but it is a post-hoc exposure to an unauthenticated reader rather than a feedback path from S7 into the participants' S6 calls.

One design choice remains explicit: "same dialogue snapshot" means the same pre-S7 source snapshot, filtered per participant. Participants can therefore have different authorized private histories. If the intended voting estimand requires identical information for all voters, that must be decided and frozen rather than assumed.

---

## STEP 5 - Audit S7 sealed collective outcome

### Ballot contract

- `BallotSchema` is strict: `{ ballots: [{ question_id: string, choice: string | null }] }`.
- Each configured question must appear exactly once.
- A non-null choice must be one of the frozen questionnaire options.
- `null` is the explicit abstention value; the string `"null"` is not accepted.
- Exactly five configured participants are eligible.
- S7 does not support complete rankings. Ranking belongs to the expanded S1/S6 expressed-position response contract, not the collective ballot.

### Eligibility and failure handling

Before the first ballot reservation, the runner requires five final position rows and a valid final position for every participant. Each ballot is reserved durably before the provider call. There is no ballot repair or second attempt. A pending row or unknown token usage stops further provider calls. Parsed results are classified as `valid`, provider-failure/budget outcomes are currently stored as `missing`, and schema failures are `invalid`.

Participants do not receive other ballots, the collective result, or S8 in their context. The canonical moderator is scripted and does not tally or decide the outcome. The external reader boundary is not secure under the default authentication scope; see C-01.

### Exact aggregation rule

For each question:

1. Read valid ballot rows only.
2. Count every frozen substantive option and count `null` abstentions separately.
3. Require all five ballots to be valid for a decision or no-majority classification.
4. If at least three of five valid ballots select one option, classify `decided` and store that option as `decision`/`majority_position`.
5. If all five ballots are valid but no option reaches three votes, classify `no_majority`.
6. If fewer than five valid ballots exist, classify `incomplete`.
7. Abstentions do not lower the three-vote threshold. A 3-0-0-0-2 ballot pattern can decide; the two abstentions remain represented.
8. `minority_positions` contains positive non-majority option counts only when a majority exists.
9. `unresolved_disagreements` retains non-majority positive options; no tie is resolved by input order, plurality, or moderator choice.

### S7 state diagram

```text
S6 complete + five valid final positions
                  |
                  v
       reserve one ballot per participant
                  |
        +---------+----------+
        |                    |
   provider call        budget/deadline
        |                    |
   valid / invalid       missing row
        |                    |
        +---------+----------+
                  v
       five valid ballots? ---- no ----> incomplete
                  |
                 yes
                  v
       any option with >= 3 votes?
             |                 |
            yes               no
             |                 |
          decided          no_majority
             \                 /
              v               v
             deterministic S8 artifact
```

### Determinism, provenance, and tests

`aggregateBallots` is a pure calculation over the supplied rows and frozen questionnaire. `saveCollectiveOutput` stores a canonical JSON hash and refuses an existing output whose hash changes. Reversing input row order produces the same aggregate in tests. A new independent run will naturally have different UUID-based provenance IDs; determinism means the same recorded state regenerates the same artifact, not that two independent runs have identical IDs or text.

The main remaining technical limits are that `auditCollective` verifies request context/system/rendered messages and response parsing but does not fully reconstruct a ballot `trace_id` chain through the event/usage ledger, and ballot provider failures are not typed as a separate structured failure category.

---

## STEP 6 - Audit S8 structured final output

S8 is a code-generated, schema-validated artifact, not a free-form moderator message. It uses no provider call and no model-generated narrative.

| S8 field | Source | Deterministic? | Provenance | Scientific purpose |
| --- | --- | --- | --- | --- |
| `version` | Fixed literal `deterministic_collective_artifact_v1` | Yes | Schema constant | Identifies the artifact contract |
| `run_id`, `config_hash` | Run and frozen config | Yes | Stored run/config records | Binds the result to one execution |
| `participant_behavior` | Fixed `false` | Yes | Schema constant | Prevents treating S8 as participant behavior |
| `voting_rule`, `eligible_voters` | Frozen canonical rule and five-participant contract | Yes | Canonical protocol/config | Defines the decision rule |
| `valid_ballots` | Count of valid rows | Yes | Ballot rows/statuses | Makes completeness observable |
| `missing_or_invalid_voters` | Expected participants minus valid voters | Yes | Participant IDs and ballot status | Makes unresolved participation explicit |
| `decisions[].question_id` | Frozen questionnaire | Yes | Questionnaire ID/version in manifest | Maps each result to an instrument item |
| `decisions[].counts` | Option counts from valid ballots | Yes | Ballot record IDs | Preserves substantive vote distribution |
| `decisions[].abstentions` | Null choices | Yes | Ballot record IDs | Separates abstention from substantive options |
| `decisions[].outcome`, `decision` | Majority/incomplete/no-majority rule | Yes | Deterministic aggregation | Records the collective classification |
| `majority_position`, `minority_positions` | Counted option records | Yes | Ballots and rule | Preserves structural majority/minority counts |
| `unresolved_disagreements` | Positive non-majority options | Yes | Counts | Retains unresolved option differences |
| `provenance.final_position_record_ids` | S6 records | Yes | Position rows | Links S8 to final individual state |
| `provenance.ballot_record_ids` | S7 rows | Yes | Ballot rows | Links S8 to individual ballot evidence |
| `limitations` | Fixed contract text | Yes | Source code | States that the artifact is not behavior or semantic consensus |

S8 does not add participant behavior and does not invoke the moderator. It is structurally auditable and reproducible from the recorded state. It does not preserve agent-level membership of a minority beyond option counts, does not store rationales, and does not infer semantic agreement, persuasion, or consensus.

---

## STEP 7 - Moderator contract

The canonical Phase 1A path requires `moderator.mode = scripted`. `scriptedModerator.ts` supplies fixed lines by state, including the new reconvening state, with a fixed script version and opening hash. It uses zero model tokens and no network call.

The moderator is constrained to framing, steering, and closing text. The runtime, not the moderator, controls scheduling, state transitions, tallying, and duration. S7 and S8 do not give the moderator a decision role. The canonical path therefore keeps the moderator as controlled apparatus rather than treatment.

The repository still contains a generic LLM moderator provider path, but canonical validation rejects a non-scripted moderator. There is no executed scripted-versus-LLM comparison in PR #9; M29 is a scripted boundary check only. An LLM moderator would need a separate frozen condition, prompt/provenance, privacy check, and calibration before it could be used in a scientific comparison.

---

## STEP 8 - Role system

The canonical starter replaces the older disciplinary starter list with five proposed functional roles. The role pack is `reimagining-humans-functional`, version `functional-draft-1`, status `draft`; the participant prompt resolver uses version `phase1a-v1`. The hashes below are the current `configHash(instruction)` values for the source registry and are re-recorded in a frozen campaign manifest.

| Role ID | Name | Functional construct | Prompt version | Current instruction hash | Rubric criteria | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `proposer` | Proposal developer | Develop mechanisms, tradeoffs, tests, and revise when evidence warrants | `phase1a-v1`; pack `functional-draft-1` | `sha256:a69939d88249edef55328dd3f9fe808f9105ad93dc1e8040a3ab54deaea725ab` | `function` + `reasoning`, each weight 1, max 2 | Draft |
| `critic` | Critical evaluator | Examine assumptions/contradictions, request evidence, issue reasoned counterarguments | Same | `sha256:dbfcc197c43b19b1def7c2ea0ad84624c51ba8684f385732ebe85bdceb97937c` | Same | Draft |
| `evidence` | Evidence assessor | Separate support from speculation and state evidential limits | Same | `sha256:d34928bee1a37a29eb5f5af08fa80cd7b6037027597f5120d0f799b27e7f60e5` | Same | Draft |
| `integrator` | Argument integrator | Connect compatible arguments and preserve unresolved disagreement/minority positions | Same | `sha256:81e46dad84bea590dcf3f667a5265972b471b2d3a8d5dcc91d920c2d753ae1e9` | Same | Draft |
| `consequences` | Consequence and feasibility assessor | Examine stakeholders, constraints, unintended effects, reversibility and tradeoffs | Same | `sha256:124d55454f9fdd578cdfec1a0cd1b65adbbf2fe7b10c90efc2a7315487c893bd` | Same | Draft |

Assignment is deterministic: for block `b`, participant index `i` receives role `(i+b) mod 5` in treatment; the control receives the neutral instruction. Blocks alternate control/treatment order (`AB`/`BA`). The starter uses ten blocks for two complete role rotations and balanced condition order. This is a balance construction, not random assignment and not a power calculation.

The freeze logic prevents reusing the same role-pack ID/version, questionnaire ID/version, or rubric version with different content. A changed instrument requires a new version. The resolver includes the common scaffold plus only the assigned treatment role instruction; control tests assert that treatment text is absent from the control prompt. Role targets are still visible in researcher-facing review data, so reviewer blinding is not adversarial.

---

## STEP 9 - Questionnaire and initial/final state instrument

The default starter evaluation is `behavioral-v1`, questionnaire ID `human-agent-coexistence`, version `draft-1`. It has two questions:

| Question ID | Question | Exact options |
| --- | --- | --- |
| `priority` | Which should be prioritized to improve human-agent coexistence? | `human education and adaptation`; `agent design and constraints`; `institutional governance`; `no preference` |
| `deployment` | Which approach to deploying consequential agent capabilities do you currently favor? | `limited reversible trials first`; `broad deployment with monitoring`; `defer until stronger evidence`; `no preference` |

`behavioral-v2`, produced by `scientificEvaluationDraft()`, adds response contract `expressed-position-v1`: complete ranking of every configured option without ties, a required primary concern, exact categorical choice, confidence from 0 to 100, and rationale. The preferred categorical choice and ranking are separate fields and need not agree. Parsing rejects unknown options, missing/duplicate questions, incomplete rankings, ties, and malformed JSON. Position probes are single-attempt/no-repair records; invalid and missing responses are retained rather than regenerated.

Initial probes occur before the moderator opening with empty history. Final probes occur after participant deliberation and before closing/S7, using the authorized dialogue snapshot. Initial answers are not inserted into dialogue context, and final answers are not broadcast or added to later contexts.

The instrument measures an **expressed position**, not a latent belief, true preference, or calibrated probability. Confidence is an expressed 0-100 scale, not a probability estimate.

Implemented change measures:

- categorical switch fraction per agent: number of questions where the exact choice changes divided by the number of questions;
- run-level initial-final change: mean across five valid agent pairs, null if any required pair is unavailable;
- confidence shift: final minus initial, per question, null when either state is unavailable;
- normalized Kendall inversion distance for the optional complete rankings, exploratory and separate from the categorical-switch endpoint.

---

## STEP 10 - Behavioral rubric

The schema contains rubric/evaluation ID through the role-pack and evaluation manifest, versions, status (`draft` or `reviewed`), criterion descriptions, positive weights, maximum score 2, interaction instructions, exact evidence requirements, and `not_assessable` handling. The frozen campaign manifest hashes the role pack and evaluation. There is no independent human validation of the draft rubric in PR #9.

### Role Fidelity formula

For each reviewer and participant:

1. Select participant messages in the frozen stage window and the evaluator target role for that identity.
2. For each role criterion, compute `sum(score) / (max_score * number_of_scored_messages)`.
3. Compute the weighted mean of criterion values using frozen criterion weights.
4. Report a complete `value` only when every criterion has every eligible message assessed; otherwise retain a separate `assessed_only_value` and set the complete value to null.
5. At the run level, compute the mean of the five participant values; no pooling of reviewer labels is used.

The executable scoring string is `per_reviewer_mean_message_score_then_weighted_criteria`. Scores 0, 1, and 2 mean absent/contrary, partial, and clear; `not_assessable` is null. Missing review is not converted to score zero. `src/phase1/behavioralAnalysis.ts` and `src/phase1/scientificDataset.ts` implement the calculation; synthetic science tests cover complete, missing, revision, and adjudication cases.

---

## STEP 11 - Human annotation workflow

The append-only annotation schema supports:

- reviewer identity and human annotator type;
- campaign/run/message IDs;
- exact source quote and, where relational, target message ID and target quote;
- exposure validation through stored invocation context IDs;
- role criteria, direct replies, interaction contingency, introduced ideas, argument uptake, and legacy categories;
- labels `present`, `absent`, `not_assessable`, `scored`, and role consistency labels;
- substantive relations `supports`, `challenges`, `extends`, `rejects`, and `revises`;
- supersession and adjudication references;
- semantic-node provenance where used;
- lock enforcement after a scientific dataset is locked;
- export through the campaign bundle and scientific snapshot.

The review projection hides colleagues' labels for a source/category until the current reviewer has submitted on that same annotation key. Original labels remain stored; a revision points to the superseded label; an adjudication points to the original readings and must be authored by someone outside the configured reviewer list. The resolution engine requires either complete independent agreement, one valid adjudication, or returns an unresolved/missing value.

This is a reproducible workflow at the application/data-model level. It is not adversarial blinding: reviewer identities are self-declared under a shared account, and the review page exposes evaluator target roles and role instructions. There is no dedicated adjudication UI action; the API/JSON schema supports adjudication. A calibration subset can be independently annotated in the workflow, but access-control and identity isolation must be strengthened before confirmatory use.

---

## STEP 12 - Reviewer reliability

The implementation provides Krippendorff's alpha for:

- ordinal role-criterion scores over frozen domain `[0, 1, 2]`;
- nominal interaction contingency labels over `[0, 1]`;
- ordinal S8 artifact criteria over `[0, 1, 2]`;
- a separately computed nominal relation reliability over `supports/challenges/extends/rejects/revises`.

It supports two to twenty configured reviewers, units-by-independent-raters input, null/missing values, pairable-unit counts, marginal counts, no-variation/insufficient statuses, and negative alpha. It does not implement interval scale, alpha confidence intervals, or a pooled single coefficient as a replacement for criterion-level results.

The implementation uses the Krippendorff observed/expected disagreement construction. The repository test cites Krippendorff (2013), *Computing Alpha-Reliability*, Example C, pp. 4-8. I independently reimplemented the same reference calculation outside the TypeScript module using the test's rating matrix and obtained:

```text
pairable values: 40
nominal alpha:   0.743421
ordinal alpha:   0.815388
```

The repository tests expect approximately 0.743 and 0.815, respectively. This independently supports the formula on the known reference vector; it does not validate the AGORA rubric, reviewer training, threshold, or empirical calibration.

Reliability is computable, but not yet scientifically acceptable. Thresholds and minimum coverage are supplied by the analysis plan. `relation_reliability` is calculated and exported but is not included in `requiredReliability` or the `reliability_satisfied` gate. If relation labels are part of a confirmatory interaction endpoint, that omission must be resolved.

---

## STEP 13 - Interaction metrics

| Metric | Formula / algorithm | Level | Evidence required | Missingness | Tests | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Participation Share | Participant successful messages / all successful participant messages | Agent within run | Stored message IDs and participant identity | Null/unavailable when denominator is zero; scheduling constrains interpretation | Behavioral/campaign tests | IMPLEMENTED |
| Turn Count | Stored participant message count; scope-level scheduled/outcome counts are also exported | Agent/run descriptive | Messages, opportunities, state and round fields | Raw counts remain available; no separate inferential endpoint | Campaign/Phase 0 tests | PARTIAL - raw measure, no standalone registered endpoint |
| Token Share | Input/output token totals per agent from invocations; no normalized share function | Agent/run descriptive | Invocation usage ledger | Null if any call has unknown usage | Usage and Phase 0 tests | PARTIAL - totals only |
| Gini | `sum pairwise absolute count differences / (2 * 5 * total successful participant messages)` | Run | Successful participant message counts | Null at zero total; descriptive, not dominance | Behavioral tests | IMPLEMENTED |
| Normalized Entropy | `-sum(p_i log p_i) / log(5)` over participant message counts | Run | Same counts | Null at zero total | Behavioral tests | IMPLEMENTED descriptively |
| Direct Response Rate | Human `direct_reply=present` / eligible participant messages | Run/reviewer | Exact source/target, exposure, complete review | Complete value null if any eligible unit is unassessed; assessed-only retained | Annotation/behavior tests | IMPLEMENTED |
| ICR / Interaction Contingency | Human-supported contingent messages / participant messages with earlier exposed peer content | Run/reviewer | Prior peer message, actual context exposure, label, relation | Null for incomplete review or no denominator | Annotation/behavior/science tests | IMPLEMENTED |
| Challenge Rate | `interaction_contingency=present` with relation `challenges` / eligible interaction units | Run/reviewer | Complete relation-coded interaction labels | No standalone endpoint; relation missing is not challenge | Relation schema/behavior tests | PARTIAL - labels supported, rate not registered |
| Support Rate | Same for relation `supports` | Run/reviewer | Same | Same | Relation schema/behavior tests | PARTIAL |
| Revision Rate | Same for relation `revises` | Run/reviewer | Same | Same | Relation schema/behavior tests | PARTIAL |
| Argument Uptake | Reviewer-defined introduced ideas with later exposed peer reuse / eligible ideas | Run/reviewer | Introduced-idea record, later target, exposure, present/absent fate | Missing fate is not absence; incomplete value null | Annotation/science tests | IMPLEMENTED |
| Response Centrality | Received annotated contingency edges / all annotated contingency edges | Agent within run | Human-coded source/target edges | Assessed-only; no causal interpretation | Annotation/behavior tests | IMPLEMENTED as assessed-only association |

### ICR and parallel monologues

The denominator is restricted to participant messages after introduction for which an earlier message by another participant was actually present in the source invocation context. Moderator messages are excluded as peer sources and targets. This prevents a routed-but-unseen message from counting as an interaction opportunity.

The code can distinguish a message that cites an earlier exposed peer from a message with no eligible peer exposure. It can store support/challenge/extension/rejection/revision relations. However, PR #9 does not contain a named end-to-end oracle that contrasts a parallel-monologue transcript with a complete proposal -> challenge -> response -> revision chain. Human coding and relations provide the basis, not proof that the social pattern exists automatically.

Response centrality and argument uptake are associations based on observed, annotated edges. They are not causal influence, persuasion, or coalition formation.

---

## STEP 14 - Initial/final change metrics

The current raw position states are `valid`, `invalid`, `missing`, and `pending` in `phase1_positions`. Invalid/missing records remain stored with error and provenance; they are not converted to zero change.

| Measure | Implementation | Status |
| --- | --- | --- |
| Position change | Per-agent fraction of exact categorical choices that switch between valid S1 and S6; run mean across five participants | IMPLEMENTED |
| Confidence shift | Final minus initial confidence per question | IMPLEMENTED descriptively; not a separate metric-registry endpoint |
| Preference switching | Same exact categorical-switch event used by position change | IMPLEMENTED through `switched`; not a separate endpoint |
| Ranking distance | Normalized Kendall inversions for complete v2 rankings | IMPLEMENTED as optional exploratory field |
| Explicit status taxonomy in P1A check output | Raw rows preserve status, but `P1A-POSITIONS` returns `NOT_EXERCISED` for invalid/missing/non-10-row cases rather than distinct external states | PARTIAL; see M-01 |

The complete run-level endpoint is null when any required participant pair is unavailable. Available individual pairs remain visible. There is no inference that a zero switch is missing or that a missing probe implies no change.

---

## STEP 15 - Private/public metrics

| Requested metric | Current status | Actual capability |
| --- | --- | --- |
| Private-to-Public Uptake | PARTIAL | The annotation schema can represent introduced ideas, exposure, and later targets, but no dedicated private-to-public metric is implemented. |
| Public-Private Divergence | PARTIAL | A legacy `public_private_difference` annotation category exists with same-agent/different-channel validation; no aggregate endpoint is implemented. |
| Private Contact Density | NOT_IMPLEMENTED | Private deliveries and group membership are stored, but no density statistic is registered. |
| Interaction Modularity | NOT_IMPLEMENTED | No graph/community modularity calculation exists. |
| Coalition Persistence | NOT_IMPLEMENTED | No temporal coalition/community definition or metric exists. |

Temporal order and common votes must not be labeled causal influence or coalition formation. The existing implementation correctly limits response centrality, uptake, and collective structural measures to association or structural correctness.

---

## STEP 16 - Collective outcome metrics

| Metric | Exact definition | Status/limit |
| --- | --- | --- |
| Voting Alignment | Fraction of participant-question ballots whose choice equals that participant's S6 categorical choice; abstention is not alignment | IMPLEMENTED; null if the complete ballot/final-position requirement is not met |
| Consensus Rate | The registry exposes `vote_unanimity`, not a semantic consensus measure: fraction of questions where all five ballots select the same substantive option | IMPLEMENTED as unanimity only; not semantic consensus |
| Majority structure | A question is `decided` only with five valid ballots and at least 3 votes for one option | IMPLEMENTED |
| Minority structure | Positive non-majority option counts are listed in `minority_positions` when a majority exists | IMPLEMENTED structurally |
| Minority Preservation | `1` only when complete ballots and the deterministic S8 audit pass | IMPLEMENTED as a structural audit, not evidence that a minority argument or value was substantively preserved |
| Time/Turns to Decision | Stage timestamps, sequences, rounds, and ballot records exist | PARTIAL; no dedicated time/turns endpoint |
| Preference/outcome alignment | Voting choices are compared to the same voter's final S6 choice | IMPLEMENTED as `voting_alignment` |

Ties and no-majority patterns remain `no_majority`; there is no input-order tie-break. Abstentions are represented separately and do not become substantive disagreement.

---

## STEP 17 - Structured final output metrics

S8 structural fidelity checks completeness, exact schema, deterministic hash, ballot/final-position provenance, counts, abstentions, majority/minority representation, unresolved option differences, and context/audit equality. This is deterministic validation.

Human S8 quality is a separate optional artifact-review path. It requires an explicitly frozen artifact rubric with criterion IDs, descriptions, weights, max score 2, exact artifact hash, exact quote, reason, independent reviews, and adjudication if needed. It is not an LLM judge and no quality rubric is invented by the template. Missing/unassessable criterion review yields null rather than a low score.

The artifact quality score is a weighted resolved human score divided by 2. It evaluates the generated system artifact, not participant behavior. A confirmatory analysis must not use an uncalibrated LLM judge as its sole evaluator; the current implementation does not do so.

---

## STEP 18 - Statistical analysis plan implementation

`AnalysisPlanSchema` supports:

- `analysis_plan_id` through `id`, version, revision, and content hash;
- purpose (`calibration` or `confirmatory`) and status (`draft` or `reviewed`);
- experimental unit `paired_block`;
- metric registry version `agora-metrics-v1`;
- role stage window;
- endpoint families through the evaluation contract;
- single-attempt retry policy choice;
- missing/unavailable policy `endpoint_unavailable`;
- reliability reviewers, thresholds, minimum pairable units and coverage;
- bootstrap resamples, seed, confidence level, interval type, p-value method and minimum pairs;
- Holm multiplicity correction within prespecified primary/secondary families;
- precision planning inputs;
- sample-size justification;
- linked calibration snapshot hash;
- optional paired-block random-intercept REML sensitivity model;
- artifact rubric and outcome notes.

Confirmatory plans are rejected unless they are reviewed, have a bootstrap p-value method, reliability configuration, retry policy, sample justification, calibration hash, and sensitivity-model specification. The system does not supply scientific approval for these values.

### Experimental level and estimand

For each paired block `b`, the implementation computes:

```text
Delta_b = Y_b,treatment - Y_b,control
ATE_role = mean_b(Delta_b)
```

It does not use messages as independent observations for treatment inference. Message-level observations are nested coding units for reliability and descriptive outcomes; the paired block is the inferential unit. This is the correct direction for avoiding message-level pseudoreplication, although sample size and model assumptions remain unresolved.

### Implemented inference

- `pairedBootstrap` resamples paired block differences with a seeded deterministic PRNG, returns percentile or basic intervals, and optionally computes a centered-null two-sided p-value with Monte Carlo correction.
- An independent algebraic check confirms that the implementation's `abs(resampled_mean - estimate) >= abs(estimate)` comparison is equivalent to resampling centered differences for this mean test. No centered-bootstrap defect was found.
- `holmAdjust` retains unavailable/null hypotheses in the prespecified family length, conservatively adjusting available p-values.
- `randomInterceptREML` is an optional sensitivity point/standard-error calculation with Gaussian random-intercept assumptions; it emits no p-value and does not assert missing-at-random.
- `precisionPlanning` is a normal-approximation planning aid, not an approved power or sample-size guarantee.
- Alpha confidence intervals and a power simulation are not implemented.

`analyzeDataset` is honest about scientific status: it reports estimates, intervals/p-values when the plan supplies them, missingness, reliability, and blockers, but sets `readiness.scientific_pass=false` and states that computation is not independent scientific sign-off.

---

## STEP 19 - Missing data

The code distinguishes most core states as follows:

| State | Current treatment |
| --- | --- |
| Provider timeout/rate limit/provider error/malformed response | Phase 0 invocation/opportunity gets an explicit infrastructure failure category; excluded from behavioral availability and retained in failure evidence |
| `explicit_abstention` / `no_op` | Core event semantics recognize these as behavioral outcomes, not infrastructure failures; current Phase 1 delivery/stage checks do not consistently accept them (H-01/H-02) |
| Invalid position probe | Stored as `invalid` with response/error; change endpoint becomes unavailable/null |
| Missing position probe | Stored as `missing` with reason; change endpoint becomes unavailable/null |
| Unknown/pending probe usage | Durable row prevents unsafe repeat; further provider calls are blocked |
| Unreviewed annotation | Resolved value is null; assessed-only diagnostic may remain, but complete endpoint stays unavailable |
| Reviewer disagreement | Remains unresolved until valid adjudication; not treated as absence or agreement |
| Failed/partial run | Run/case and exclusion reasons remain in dataset; not silently converted to zero |
| Incomplete control/treatment pair | No paired difference is emitted; reason is retained |
| Invalid/missing ballot | Ballot remains non-valid and aggregation is `incomplete`; currently provider failure is not typed separately from missing (M-03) |

The strongest missingness controls are the null endpoint policy and explicit exclusion reasons. The main remaining issue is that ballot rows lack a structured failure category, which makes it harder to distinguish a provider outage from a participant-level missing ballot in the collective endpoint.

---

## STEP 20 - Locked datasets

`lockScientificDataset` creates a content-hashed `agora-scientific-dataset-v1` snapshot and an annotation lock in the same transaction. It refuses locking while cases are pending/running and refuses further campaign execution, annotation, or artifact review after lock. `readScienceSnapshot` recomputes the payload hash and rejects mutation. The locked dataset ID is required for analysis.

The snapshot contains raw source runs/messages/invocations/events/positions/ballots, coding units, original labels, resolved labels, exclusions, metric outcomes, reliability, frozen manifest/instrument hashes, analysis plan, code provenance, and implementation hashes. The plan and instrument versions are frozen by the campaign manifest, and the campaign prevents same-ID/same-version content replacement.

This is application-level immutability, not an external immutable storage guarantee. A user with direct SQLite write access can mutate source tables; the snapshot hash detects mutation of the saved payload but does not prevent source mutation before snapshot creation. The general campaign bundle is generated dynamically and includes raw private/label data. There is no database trigger or WORM archive in PR #9. A published result must archive the locked snapshot and bundle in a controlled immutable store and retain the hash.

**Answer:** a confirmatory dataset cannot silently change through the supported application workflow after lock, but the exact published dataset is only reproducible/immutable if the locked snapshot and its hash are externally archived and access to the database is controlled.

---

## STEP 21 - Reproducible analysis and export

The Phase 1 campaign bundle includes, when present:

- frozen campaign manifest, configuration, role assignments, comparison settings, hashes and code provenance;
- resolved prompts and canonical stage/moderator/ballot instructions;
- events, messages, invocations, opportunities, state transitions, contexts, summaries, tool calls and checkpoints;
- position records and questionnaire responses;
- stage rows, ballot rows, collective output and S8 hash;
- annotations, artifact reviews, closure evidence, evidence links and usage ledger;
- scientific snapshots, annotation lock, analysis results and metric registry/plan when computed;
- per-artifact hashes and source references.

This is sufficient to reconstruct the application-level analysis state when the bundle is internally consistent. It is intentionally unblinded: raw private transcripts, hidden roles and labels are present, with a warning that sharing requires approval. The export is not itself a WORM archive, and the bundle is dynamically regenerated. There is no separately materialized metric-registry artifact unless it is embedded in a scientific analysis snapshot.

The fresh Phase 0 regression also exposed a documentation/evidence hygiene issue: the validation set described 24 artifacts while its `acceptance_report.json` described 19 exported/hashed artifacts, although the required artifact list was present. This does not change the Phase 0 gate result but should be reconciled before publication.

---

## STEP 22 - Scientific review interface

The Phase 1 UI/API supports draft creation, preview, freeze, execution, review, annotation, artifact review, closure evidence, scientific dataset lock, analysis, snapshots, and export. The CLI exposes the corresponding operations (`science-template`, `plan`, `freeze`, `run`, `annotate`, `review-artifact`, `closure-evidence`, `science`, `lock-dataset`, `analyze`, `snapshot`, and `export`).

The review projection attempts to hide condition and hidden prompt metadata, supports per-reviewer label visibility, and displays the frozen rubric/questionnaire. However:

- `AGORA_AUTH_SCOPE` defaults to `write`, which protects state-changing requests but leaves GET requests open;
- `/phase1/campaigns/:id` renders private/context and individual ballot records under a "researcher-only" label;
- `/phase1/campaigns/:id/review` renders participant sources including private messages and `evaluator_target_role`;
- the corresponding Phase 1 GET APIs are also open under `scope=write`;
- only `scope=all` protects the complete instance;
- the review page itself states that identity is self-declared and blinding is workflow-level, not adversarial.

I reproduced this locally with a temporary database and `createAuthMiddleware({ password: "secret", scope: "write" })`: unauthenticated GET requests to the campaign and review routes returned HTTP 200 and contained private message content, the marker `Sealed individual ballot records`, and evaluator target-role fields. This is a real access-control defect, not a documentation-only concern.

---

## STEP 23 - P1-A through P1-D gates

The aggregate gates exist in `src/phase1/closure.ts`, but their scope is machine evidence, not a scientific release certificate.

| Gate | Executable? | Components | Blocking rules | Missingness rules | Tests/evidence | Can pass under current code? |
| --- | --- | --- | --- | --- | --- | --- |
| P1-A - Protocol integrity | Yes | Canonical plan, all cases completed, eight-stage audits, runtime checks, S1/S6/S7 and S8 evidence | Any case/canonical audit/runtime check failure blocks | Zero change and no-majority are allowed; invalid/missing required records block | Canonical tests; independent mock fixture P1-A `PASS` | Yes on a valid canonical mock; not a live scientific certificate |
| P1-B - Behavioral observability | Yes | Canonical audits, runtime checks, locked dataset with complete outcome-specific annotation coverage | Missing lock/coverage/canonical/runtime pass blocks | Unresolved annotations keep endpoint null and coverage incomplete | Science/lock tests; independent fixture P1-B `BLOCKED` without labels/lock | Yes in principle with synthetic locked labels; live/calibration is not required by this machine gate |
| P1-C - Experimental comparability | Yes | Valid condition comparison, deterministic role rotation and AB/BA balance | `blocks % 10 !== 0` blocks; no power requirement | Pair availability is separate from balance | Campaign and 10-block rotation test; independent one-block fixture `BLOCKED` | Yes for a 10-block plan-level design |
| P1-D - Scientific analysis readiness/closure | Deliberately non-passable | Protocol approval, calibration, reliability, analysis report, independent evaluator | Code returns `BLOCKED` even if evidence records exist | Missing evidence listed; uploaded text is not auto-certified | Closure tests and code contract | No by design |

No gate requires a statistically significant behavioral effect. A valid null effect is compatible with P1-A/P1-B/P1-C. The current code also always emits `scientific_pass=false`.

The principal boundary risk is interpretive: P1-B can be satisfied by canonical mock execution plus synthetic labels because it is a machine observability gate, while P1-D and `scientific_pass` remain blocked. The UI/reporting must never summarize P1-B as scientific validity.

---

## STEP 24 - Deterministic oracle tests

The following table distinguishes actual deterministic coverage from a claim that the full scientific phenomenon has been demonstrated.

| Oracle | Coverage | Evidence in PR #9 | Verdict |
| --- | --- | --- | --- |
| A. Parallel monologues | Exposure denominator and absent-label fixtures exist; no named end-to-end contrasting transcript | `phase1Behavioral.test.ts`, annotation/exposure logic | PARTIAL |
| B. Proposal -> challenge -> revision | Relation schema and challenge fixture exist; no complete chained revision oracle | `phase1Behavioral.test.ts`, `phase1Annotations.ts` | PARTIAL |
| C. Private idea -> later public uptake | Exposure/uptake validation exists; no explicit private-source/later-public-uptake end-to-end fixture | Annotation logic | NOT_EXERCISED as a complete oracle |
| D. No position change | Stable synthetic responses and zero-change path | Position/behavior tests | COVERED |
| E. Preference switching | Final choices changed in a fixture and change metric asserted | `phase1Behavioral.test.ts` | COVERED |
| F. Explicit abstention | Null ballot abstention and aggregation covered; dialogue `explicit_abstention` delivery path is not covered and is currently regressed | Canonical collective tests; H-01 | PARTIAL |
| G. Provider failure | Phase 0 fault injection plus provider failure handling | Phase 0 regression and fault tests | COVERED technically |
| H. Role rotation | Ten-block cyclic assignment and AB/BA balance | Campaign/canonical tests | COVERED |
| I. Sealed ballot | No ballot in participant context and S6 barrier covered; unauthenticated external read leak remains | Canonical tests plus C-01 reproduction | PARTIAL end-to-end |
| J. Deterministic aggregation | Reverse-order result equality and hash protection | Canonical collective tests | COVERED |
| K. Minority preservation | 3-2 option counts and minority list | Canonical collective tests | COVERED structurally |
| L. S8 structured artifact | Schema, deterministic hash, tamper rejection, provenance | Canonical/export tests | COVERED structurally |
| M. Reviewer agreement/disagreement | Independent labels, conflict, revision, adjudication resolution | Science tests | COVERED synthetically |
| N. Known reliability coefficient | Published nominal/ordinal reference vector | Statistics tests and independent recomputation | COVERED for formula |
| O. Missing annotation | Null endpoint, coverage failure, incomplete resolution | Science tests | COVERED |
| P. Incomplete control/treatment pair | Incomplete pair status and missing difference | Analysis/science tests | COVERED |
| Q. Analysis-plan lock | Version immutability, preregistration fields, confirmatory validation | Science tests | COVERED technically |
| R. Dataset lock/reproducibility | Snapshot hash, lock refusal, repeated analysis, tamper detection/export | Science/lock/export tests | COVERED at application level |

466 passing tests therefore do not equal 18 complete scientific oracles. The missing positive social-interaction and private-to-public fixtures are important for Phase 1 calibration.

---

## STEP 25 - Full verification

The following commands were run freshly on PR #9 head `4f20c23660d9e508c4d6724aedd7f1cb7a2c52ec`:

| Verification | Result |
| --- | --- |
| `npm test` | Exit 0; **45 test files passed, 466 tests passed, 0 failed**; Vitest 4.1.10 |
| `npm run build` | Exit 0; TypeScript compilation passed |
| `git diff --check origin/master...HEAD` | Exit 0; no whitespace errors |
| `npm audit --audit-level=high` | Exit 0; 3 moderate transitive/development vulnerabilities reported, no high/critical result |
| `npm audit --omit=dev --audit-level=high` | Exit 0; 1 moderate `qs` vulnerability reported |
| GitHub `AGORA Phase 0 / verify` | 2 completed successful checks |
| Relevant Phase 1 tests | Included in the full 45-file/466-test run: canonical, science, statistics, UI, tool faults, restart matrix, backup/restore/replay and behavioral tests |

The audit vulnerabilities are not introduced by a PR #9 lockfile change; PR #9 does not modify the package lock. They remain a repository hygiene risk and should be handled separately from the Phase 1 scientific closure.

---

## STEP 26 - Phase 0 regression

A fresh temporary-data validation was run with:

```text
npm run agora -- validate \
  --config configs/agora_phase0_mock_baseline.yaml \
  --fault-config configs/agora_phase0_faultdemo_mock.yaml \
  --out <temporary-output>
```

Observed result:

| Item | Result |
| --- | --- |
| Exit | 0 |
| Primary baseline run | `run_24d2f007-fbfb-4f8d-9a43-786f53df1977` |
| Reproducibility run | `run_f2a1b470-6a3c-4e0e-9349-42c865bb46bf` |
| Fault run | `run_9d3ac9ad-5967-4695-9693-476a637368ac` |
| Baseline config hash | `sha256:9aec2b3420a41a0d97835c3815cc8702b899c25bb5de2fac6e8bf4da1c57be5c` |
| Rerun config hash | Same hash |
| Code provenance | `4f20c23660d9e508c4d6724aedd7f1cb7a2c52ec` |
| Phase 0 result | `phase0_validated=true`, `ready=true` |
| Gates | Infrastructure `PASS`; failure attribution `PASS`; reproducibility `PASS` |
| Baseline evidence | 273 contiguous events, 20 public/5 private messages, 108 deliveries, 25 opportunities, 272 context references with 0 leaks, 6 state transitions |
| Fault evidence | 4 injected fault kinds, 5 retries, 3 later successes, 1 exhausted opportunity, 30 attempts |
| Metrics | M1-M22 all `PASS` in this fresh mock regression |
| Live Phase 1A link | None; this is a Phase 0 mock regression, not Phase 1A live validation |

Routing, privacy, opportunity/invocation semantics, retries, failure attribution, persistence, config identity, export, and replay regression behavior passed this run. PR #9's canonical opt-in changes do not alter legacy Phase 0 behavior in this test.

The Phase 0 result is not evidence that Phase 1A roles or social behavior are valid. It is an infrastructure regression result.

---

## STEP 27 - Phase 1A scientific readiness

| Readiness dimension | Verdict | Reason |
| --- | --- | --- |
| 1. Engineering implementation | READY_WITH_CONDITIONS | Eight-stage, collective, science, lock/export and UI code is present; C-01 and H-01/H-02 must be resolved before protected deployment. |
| 2. Deterministic/mock validation | READY_WITH_CONDITIONS | Full suite passes and a canonical mock runtime completed all stages/audits; oracle coverage is not exhaustive. |
| 3. Scientific instrument review | NOT_READY | Functional role pack, questionnaire, rubric, endpoints and thresholds are draft/unapproved. |
| 4. Live calibration preparation | NOT_READY | Preparation machinery exists, but secure deployment and the PR #7 semantic corrections are not closed. |
| 5. Live calibration execution | NOT_READY | No Phase 1A live run is in the PR #9 evidence. |
| 6. Human annotation/reliability | NOT_READY | Workflow/formula are implemented and synthetic tests pass; no independent human calibration labels or empirical alpha exist. |
| 7. Confirmatory protocol readiness | NOT_READY | No approved protocol/role/questionnaire/rubric/SAP package and no linked calibrated instruments. |
| 8. Confirmatory experiment readiness | NOT_READY | No calibrated sample-size/precision decision, live evidence, locked confirmatory dataset, or final gate package. |
| 9. Confirmatory behavioral claims | NOT_READY | PR #9 supports no scientific behavioral claim. |

An independent local canonical mock fixture produced campaign state `completed`, all S1-S8 stage rows `complete`, and `auditCollective={complete:true, verified:true, issues:[]}`. Its machine closure was P1-A `PASS`, P1-B `BLOCKED`, P1-C `BLOCKED`, P1-D `BLOCKED`; it used 70 attempts and reported 49,870 tokens with zero unknown usage. The fixture's `scientific_pass` was `false` and missing evidence included protocol approval, analysis plan, calibration report, reliability report, and analysis report. This is a direct demonstration of the intended separation between technical execution and scientific closure.

---

## STEP 28 - What cannot be closed by code

| Requirement | Machinery exists? | Scientific evidence exists? | Who/what must close it? | Classification |
| --- | --- | --- | --- | --- |
| Approve exact functional roles and constructs | Yes: versioned role pack and optional source mapping | No; role pack is draft | Research team/domain reviewers approve and freeze | REQUIRES_SCIENTIFIC_DECISION |
| Approve questionnaire/options/confidence interpretation | Yes: strict v1/v2 parser and freeze checks | No | Research team approves instrument | REQUIRES_SCIENTIFIC_DECISION |
| Approve behavioral rubric/criteria/weights | Yes: schema, evidence rules and scoring code | No independent calibration | Domain reviewers and pilot calibration | REQUIRES_HUMAN_REVIEW + EMPIRICAL_CALIBRATION |
| Approve outcome definitions/primary hierarchy | Yes: metric registry and plan schema | No approved estimand hierarchy | Scientific team freezes endpoint families | REQUIRES_SCIENTIFIC_DECISION |
| Freeze live calibration campaign | Yes: planning/freeze/run/lock machinery | No live Phase 1A campaign | Operator and scientific lead | REQUIRES_EMPIRICAL_CALIBRATION |
| Independent human annotation | Yes: append-only blinded workflow | No real labels | Independent reviewers annotate a frozen subset | REQUIRES_HUMAN_REVIEW |
| Adjudication | Yes: schema/resolution engine; limited UI | No empirical adjudication record | Independent adjudicator resolves conflicts | REQUIRES_HUMAN_REVIEW |
| Reliability evidence | Yes: alpha computation/threshold fields | No real reviewer alpha | Calibrated labels and approved threshold | REQUIRES_EMPIRICAL_CALIBRATION |
| Final uncertainty/missingness/multiplicity choices | Yes: configurable bootstrap/Holm/REML/null handling | No approved final choices | Statistical review and SAP freeze | REQUIRES_SCIENTIFIC_DECISION |
| Sample-size/precision justification | Planning aid exists | No approved power/precision result | Calibration data and scientific approval | REQUIRES_EMPIRICAL_CALIBRATION |
| Protocol approval/preregistration | Closure evidence storage exists | No independently validated approval | Named scientific approver and archived document | REQUIRES_SCIENTIFIC_DECISION |
| Confirmatory analysis execution | Analysis engine exists | No confirmatory dataset | Frozen instruments, data, lock, and review | REQUIRES_CONFIRMATORY_DATA |
| Limited scientific conclusions | Reporting boundary exists | No valid live/human evidence | Scientific sign-off after confirmation | REQUIRES_CONFIRMATORY_DATA |

---

## STEP 29 - Exact remaining work to close Phase 1A

This is the ordered closure path based on the current implementation and findings.

| Order | Closure action | Status |
| --- | --- | --- |
| 1 | Review PR #9 and this audit, including C-01 and H-01/H-02/H-03 | READY_TO_DO |
| 2 | Reconcile PR #9 with the correctness/privacy/measurement fixes from PR #7 or an equivalent reviewed change | READY_TO_DO |
| 3 | Protect all sensitive Phase 1 HTML/API GET paths; add unauthenticated `scope=write` tests | READY_TO_DO |
| 4 | Make `explicit_abstention` and `no_op` consistent across delivery checks, stage completion, and canonical tests | READY_TO_DO |
| 5 | Decide whether relation labels require a reliability gate and whether ballot failures need typed categories | BLOCKED_BY_SCIENTIFIC_DECISION |
| 6 | Approve exact role constructs and role-pack source mapping | BLOCKED_BY_SCIENTIFIC_DECISION |
| 7 | Approve/freeze questionnaire, response contract, confidence interpretation and ranking use | BLOCKED_BY_SCIENTIFIC_DECISION |
| 8 | Approve/freeze behavioral rubric, eligible windows, relation labels and artifact rubric | BLOCKED_BY_SCIENTIFIC_DECISION |
| 9 | Approve private/public voting-context policy and whether expanded private/public metrics are in scope | BLOCKED_BY_SCIENTIFIC_DECISION |
| 10 | Freeze calibration config, provider/deployment, model version, budgets and provenance | READY_TO_DO after steps 2-9 |
| 11 | Execute live calibration with baseline/repeat/fault/safety evidence as authorized | BLOCKED_BY_CALIBRATION |
| 12 | Export a blinded calibration review package under protected access | BLOCKED_BY_DATA |
| 13 | Obtain independent human annotations on the frozen subset | BLOCKED_BY_CALIBRATION |
| 14 | Adjudicate disagreements outside the independent reviewer list | BLOCKED_BY_CALIBRATION |
| 15 | Calculate alpha by criterion/relation and compare to frozen thresholds | BLOCKED_BY_CALIBRATION |
| 16 | Revise instruments if calibration shows ambiguity, then version them and repeat calibration as needed | BLOCKED_BY_CALIBRATION |
| 17 | Freeze the reviewed confirmatory analysis plan and preregistered evidence before execution | BLOCKED_BY_SCIENTIFIC_DECISION |
| 18 | Determine final N/precision from calibration; do not use the planner as a guarantee | BLOCKED_BY_CALIBRATION |
| 19 | Run the confirmatory Phase 1A campaign with the same frozen instruments | BLOCKED_BY_DATA |
| 20 | Lock the dataset, execute the frozen analysis, review P1-A through P1-D, archive hashes, and issue bounded conclusions | BLOCKED_BY_DATA |

---

## STEP 30 - Phase 1B boundary

Phase 1B has not started. The current schema is explicitly `phase: '1A'`; canonical validation disables tools; no capability-treatment namespace or retrieval condition is present. There is no Phase 1B capability registry, C0/C1 retrieval treatment, frozen retrieval corpus, capability assignment algorithm, Phase 1B metric family, or Phase 1B test suite.

Reusable Phase 1A infrastructure for later Phase 1B includes campaign pairing/freeze, provenance and context assembly, stage/event persistence, annotation/lock/export machinery, statistical utilities, and the review UI. Phase 1B must add a separate capability contract and treatment assignment rather than overload role IDs or the Phase 1A evaluation field.

The intended separation remains:

```text
Phase 1A: Role = treatment
Phase 1B: Capability = treatment

Held constant in the later comparison:
Model, roles, moderator, topic, context, and schedule
```

---

## STEP 31 - Current Phase 1 maturity map

| Layer | Current status | Evidence | Remaining work |
| --- | --- | --- | --- |
| Phase 0 instrument | TECHNICALLY VERIFIED | Prior merged closure plus fresh M1-M22 mock regression | Preserve live evidence archive and reconcile artifact counts |
| Phase 1 infrastructure | IMPLEMENTED / TESTED | Runner, DB, contexts, budgets, exports, 466 tests | Close regression/security findings |
| Eight-stage protocol | IMPLEMENTED / MOCK-VERIFIED | Canonical state machine, stage rows, fixture S1-S8 | Live execution and edge-case semantics |
| Phase 1A roles | IMPLEMENTED, DRAFT | Five functional roles, cyclic assignment, hashes | Scientific approval/calibration |
| Questionnaire | IMPLEMENTED, DRAFT | v1/v2 parser and position records | Approve wording/options/contract |
| Behavioral rubric | IMPLEMENTED, DRAFT | Criterion scoring and interaction rubric | Human calibration and freeze |
| Human annotation machinery | IMPLEMENTED / SYNTHETICALLY TESTED | Append-only labels, revisions, adjudication | Real independent review and auth isolation |
| Reviewer reliability | COMPUTABLE / NOT CALIBRATED | Krippendorff nominal/ordinal alpha, reference test | Real labels, thresholds, relation-gate decision |
| Behavioral metrics | CORE IMPLEMENTED | RF, ICR, participation, change and related descriptors | Add/decide private-public and coalition endpoints |
| Collective outcomes | STRUCTURAL IMPLEMENTATION | Ballot rule, majority/minority, alignment/unanimity | Live evidence and scientific interpretation |
| S8 artifact | DETERMINISTIC IMPLEMENTATION | Schema/hash/tamper/audit tests | External archival and optional human quality review |
| Statistical analysis | IMPLEMENTED AS DRAFT ENGINE | Paired blocks, bootstrap, Holm, REML sensitivity | Approved SAP, calibration, precision and inference choices |
| Aggregate gates | PARTLY EXECUTABLE | P1-A/B/C code; P1-D always blocked | Protect scope and supply scientific evidence |
| Locked datasets | APP-LEVEL SNAPSHOT | Hash-checked snapshot and annotation lock | External immutable archive/WORM and DB access control |
| Scientific review UI | IMPLEMENTED WITH SECURITY DEFECT | Review/annotation/lock/analyze/export routes | Fix default GET privacy and add adjudication UX |
| Calibration readiness | NOT_READY | Preparation contracts exist, no secure/live closure | Fix defects and approve instruments |
| Live calibration | NOT_EXECUTED | No Phase 1A live bundle in PR #9 | Run and annotate live campaign |
| Confirmatory readiness | NOT_READY | Confirmatory schema blockers are explicit | Calibration, SAP, N, data and sign-off |
| Phase 1B | NOT_STARTED | No capability-treatment layer | Design after Phase 1A boundary is approved |

---

## STEP 32 - Delta created by PR #9

### BEFORE PR #9

Phase 1 had a role-pilot scaffold: frozen control/treatment cases, functional role assignments, initial/final behavioral-v1 probes, annotation storage, descriptive behavior metrics, and Phase 0 infrastructure. It did not have an explicit canonical eight-stage state sequence, S4 reconvening, separate S6/S7 barrier, sealed ballots, deterministic S8, scientific dataset locking, Krippendorff alpha, paired analysis engine, or the new scientific review workspace.

### AFTER PR #9

Phase 1A can opt into a versioned canonical protocol with S1-S8 stage records; scripted moderation; deterministic role rotation; S1/S6 expressed-position probes; one-attempt sealed ballot collection; absolute-majority/no-majority/incomplete aggregation; deterministic structured S8; append-only human review/adjudication records; reliability calculations; run/block-level statistics; scientific snapshots/locks; closure gates; exports; and review UI/API/CLI paths.

### STILL NOT ESTABLISHED

No live Phase 1A calibration, independent human label set, empirical reliability, approved role/questionnaire/rubric/SAP, confirmatory data, independent scientific sign-off, or Phase 1B capability treatment exists. The current PR also carries the security and behavioral-outcome defects identified above, and its draft state has not been merged.

---

## STEP 33 - Defects and risks

### CRITICAL

#### C-01 - Sensitive Phase 1 GET routes expose private and sealed data under default `scope=write`

- **Location:** `src/server/auth.ts` (`mustAuthenticate = writing || config.scope === 'all'`); sensitive routes in `src/server/phase1.ts`.
- **Observed behavior:** with `scope=write`, unauthenticated GET requests to `/phase1/campaigns/:id` and `/phase1/campaigns/:id/review` returned HTTP 200. Bodies contained private message content, `Sealed individual ballot records`, and `evaluator_target_role`; corresponding GET APIs were also open.
- **Consequence:** private transcripts, sealed individual ballots, reviewer context and role metadata can be read by an unauthenticated external client. This invalidates the promised access boundary for a deployed review instance.
- **Why it matters:** it is a direct privacy and sealed-ballot failure, not merely a reviewer-blinding limitation. `scope=all` mitigates it only when explicitly configured; the documented/default scope is `write`.
- **Suggested disposition:** rebase/include the reviewed PR #7 auth behavior or implement an equivalent explicit sensitive-read policy; add default-scope unauthenticated tests for all HTML/API review, ballot, annotation, snapshot and campaign routes. No fix was made in this audit.

### HIGH

#### H-01 - P1A delivery check rejects valid behavioral abstention/no-op outcomes

- **Location:** `src/phase1/analysis.ts`, `P1A-DELIVERY` calculation.
- **Observed behavior:** the check accepts `i.outcome === 'success'` or a narrowly configured successful retry. A stored participant invocation with outcome `explicit_abstention` and no failure category produced `P1A-DELIVERY ... FAIL`; core event semantics recognize `success`, `explicit_abstention`, and `no_op` as behavioral outcomes.
- **Consequence:** a valid behavioral silence/no-op can be classified as an experimental integrity failure.
- **Why it matters:** it reintroduces exactly the technical/behavioral ambiguity Phase 1 is designed to remove and can block valid canonical cases.
- **Suggested disposition:** use one shared behavioral-outcome predicate across runner, analysis, stage completion and tests; add explicit abstention/no-op positive cases. No fix was made.

#### H-02 - Canonical S2-S5 completion requires `resolution === 'success'`

- **Location:** `src/orchestrator/runner.ts`, canonical `endCanonicalStage` calls.
- **Observed behavior:** stage completion for the discussion stages checks all participant opportunities for `resolution === 'success'`. The runtime's event model treats `explicit_abstention` and `no_op` as behavioral outcomes, but the canonical stage check does not.
- **Consequence:** a legitimate non-speaking behavioral outcome can leave a discussion stage incomplete and prevent a valid S6/S7 path.
- **Why it matters:** the eight-stage protocol must model behavioral non-response separately from infrastructure failure; otherwise the protocol selects only successful speech.
- **Suggested disposition:** define and test stage completion in terms of terminal behavioral outcomes plus explicit infrastructure-failure policy. No fix was made.

#### H-03 - Relation reliability is computed but not integrated into the reliability gate

- **Location:** `src/phase1/scientificDataset.ts`, `relationReliability` and `requiredReliability` construction.
- **Observed behavior:** relation alpha is exported, but `reliability_satisfied` checks role, ICR category, and artifact groups only; relation agreement is not required even when relation labels support interaction interpretation.
- **Consequence:** a dataset can satisfy the configured reliability gate while `supports/challenges/extends/rejects/revises` coding remains unreliable.
- **Why it matters:** relation type is part of the evidence for the proposed interaction interpretation; disagreement about relation type can change the scientific reading even when present/absent agreement is acceptable.
- **Suggested disposition:** decide whether relation type is confirmatory or exploratory. If confirmatory, add a frozen relation threshold/coverage requirement; otherwise label it explicitly exploratory and do not use it for confirmatory claims. No fix was made.

### MEDIUM

#### M-01 - Position evidence status is collapsed in the P1A check projection

- **Location:** `src/phase1/analysis.ts`, `P1A-POSITIONS`.
- **Consequence:** raw `invalid`, `missing`, and `pending` rows are preserved, but the summary check emits `NOT_EXERCISED` for all non-10-valid cases. Reviewers can lose the distinction between "not run," "ran but invalid," and "ran but missing."
- **Suggested disposition:** restore explicit external status values such as `NOT_EXERCISED`, `EXECUTED_BUT_INVALID`, `EXECUTED_BUT_MISSING`, and `VALID`, with tests.

#### M-02 - A run can reach `COMPLETED` after incomplete S7 while canonical audit fails

- **Location:** `src/orchestrator/runner.ts` and `src/phase1/collective.ts`.
- **Consequence:** S8 is ended procedurally after the ballot collection path, and the run can close even when the S7 output is `incomplete`; `auditCollective` later reports failure. Operational run status and scientific canonical status can disagree.
- **Suggested disposition:** make canonical run completion retain an explicit incomplete state or require the canonical audit before terminal completion; preserve partial evidence without representing it as a completed canonical case.

#### M-03 - Ballot provider failure is stored as `missing` without a structured failure category

- **Location:** `src/phase1/collective.ts`, `BallotRow` and `collectBallots`.
- **Consequence:** a provider outage, cancellation, deadline, or budget exhaustion can be indistinguishable in the ballot-level analysis except for free-text `error`/reason fields.
- **Suggested disposition:** add typed ballot outcome/failure fields and propagate them into missingness and failure attribution; do not count them as abstentions.

#### M-04 - Dataset lock is hash-checked application state, not external immutability

- **Location:** `src/phase1/scienceStore.ts`, `src/phase1/export.ts`.
- **Consequence:** direct DB writers can alter source tables; dynamic bundles can be regenerated; no WORM/archive boundary is supplied by the PR.
- **Suggested disposition:** archive locked snapshots/bundles in controlled immutable storage, retain hash/signature and access logs, and define the publication artifact as the archived snapshot rather than a later dynamic export.

#### M-05 - Reviewer blinding is workflow-level, not identity/access-level

- **Location:** `src/semantic/phase1Annotations.ts`, `src/server/phase1.ts`.
- **Consequence:** shared credentials, self-declared reviewer identity, visible evaluator target roles and raw review sources permit condition/identity inference.
- **Suggested disposition:** use separate authenticated identities and a role-blinded data projection; record reviewer identity outside self-declared form fields; add adversarial access tests.

#### M-06 - Ballot traceability is not fully linked into the acceptance chain

- **Location:** `src/phase1/collective.ts`, `auditCollective`, and Phase 0 trace metrics.
- **Consequence:** request context and response/hash are checked, but ballot trace IDs, usage rows, retry/failure events, analysis entries and manifest entries are not all required in one end-to-end ballot chain.
- **Suggested disposition:** extend the canonical trace contract and acceptance check to ballot requests, ledger, output, analysis snapshot and manifest.

#### M-07 - P1-B can be interpreted as a scientific pass although it can pass on mock/synthetic evidence

- **Location:** `src/phase1/closure.ts`, P1-B definition and UI text.
- **Consequence:** a machine observability gate can become a misleading aggregate headline if presented without its scope; it does not require live provider provenance, calibration, or independent human identity.
- **Suggested disposition:** keep the machine gate, but rename/label it consistently as observability evidence and make live/calibration/scientific blockers prominent in every summary. `scientific_pass=false` must remain authoritative.

#### M-08 - S8 minority preservation is option-level only

- **Location:** `src/phase1/collective.ts`, `CollectiveArtifactSchema` and `minority_preservation` metric.
- **Consequence:** the artifact preserves non-majority option counts but not agent-level minority membership, rationale, or semantic preservation of an argument.
- **Suggested disposition:** keep the structural metric separate; add an explicitly human-rated semantic/minority-preservation outcome only if the scientific team defines and calibrates it.

### LOW

#### L-01 - Canonical breakout validation could be stricter

- **Location:** `src/config/schema.ts` and canonical validation.
- **Consequence:** each participant is required in exactly one group, but the schema does not independently assert every global breakout invariant such as moderator exclusion/disjointness if malformed groups are supplied.
- **Suggested disposition:** add explicit group-set invariants if they are part of the frozen protocol. This is not a current failure of the tested starter configuration.

#### L-02 - Transitive moderate dependency advisories remain

- **Location:** package dependency tree (`@vitest/mocker`/Vitest and `qs`).
- **Consequence:** `npm audit` reports 3 moderate vulnerabilities in the full tree and 1 moderate production-tree `qs` vulnerability.
- **Suggested disposition:** update dependency ranges in a separate reviewed maintenance change; do not claim a high/critical vulnerability or attribute it specifically to PR #9's code.

### SCIENTIFIC_DECISION

These are not code defects, but they block scientific closure:

1. Approve the five functional role constructs and theoretical/source mapping.
2. Approve the questionnaire wording, options, complete-ranking extension, and confidence interpretation.
3. Approve role-fidelity and interaction rubric criteria, relation semantics, stage window, and artifact quality rubric.
4. Decide primary/secondary/exploratory endpoint families and whether relation-level reliability is required.
5. Decide whether every S7 voter should receive the same public-only snapshot or its authorized private context.
6. Choose reviewers, reliability thresholds, minimum coverage, adjudication procedure, and identity/blinding standard.
7. Freeze uncertainty, missingness, multiplicity, precision, sample-size and sensitivity-model choices.
8. Approve provider/deployment, live calibration design, protocol evidence, and confirmatory sign-off procedure.
9. Decide whether private/public uptake, divergence, modularity, and coalition metrics are in scope or explicitly out of scope.

### Specific risk checks requested in the brief

| Risk | Audit conclusion |
| --- | --- |
| Privacy leak | Confirmed: C-01 |
| S6 contaminated by S7 | Not in core runner; stage barrier and context exclusion pass; external read boundary still fails |
| Unsealed ballots | Sealed from participants/moderator in core context; not sealed from unauthenticated GET reader under default scope |
| Non-deterministic aggregation | Not found; pure aggregation, canonical hash, reverse-order test pass |
| S8 moderator influence | Not found in canonical path; S8 makes no provider call and scripted moderator is fixed |
| Pseudoreplication | Not found in inferential code; paired block is the unit; message-level descriptive/coding data remain nested |
| Incorrect missingness | Core null/exclusion handling is sound; valid abstention regression and ballot failure typing remain |
| Reliability formula error | Not found on independent published reference vector; scientific acceptability remains unproven |
| False aggregate-gate PASS | No scientific PASS is emitted; P1-B's machine-only scope could be misread as scientific validity |
| Dataset mutation after lock | App snapshot hash detects payload mutation; no external WORM/direct-DB prevention |
| Post hoc analysis-plan modification | Same-ID/same-revision content change is blocked; confirmatory plan requires reviewed fields and prereg evidence |
| Role/control prompt leakage | Control does not receive treatment instruction; researcher review page exposes evaluator target roles and unblinded data |

---

## STEP 34 - Final verdict

| Question | Verdict | Technical explanation |
| --- | --- | --- |
| **A. Did Simon genuinely implement all eight stages?** | PARTIAL | All eight executable canonical states and tests exist, and a mock fixture completed S1-S8. The path is opt-in, not live-validated, and S2-S5 behavior-outcome completion has a regression. |
| **B. Is S6 protected from S7 outcome contamination?** | YES | Runner order, event barrier, context construction and tests place five final positions before any ballot and exclude S7/S8 from participant history. This does not excuse the separate read-access leak. |
| **C. Is sealed voting implemented correctly?** | PARTIAL | One-attempt ballot rows, no participant/moderator exposure in core runtime, and no-repair behavior are implemented. Default `scope=write` exposes sealed records to unauthenticated GET readers. |
| **D. Is deterministic aggregation implemented correctly?** | YES | Strict ballot parsing, absolute-majority rule, explicit incomplete/no-majority states, order-independent counts and output hashing are implemented and tested. |
| **E. Is S8 genuinely structured and auditable?** | YES | S8 is a schema-validated deterministic artifact with counts, abstentions, majority/minority structure, unresolved differences and provenance. It is structural, not semantic or behavioral. |
| **F. Are roles/questionnaires/rubrics/versioning genuinely implemented?** | PARTIAL | Schemas, prompts, hashes, freeze checks, two questionnaire versions and scoring contracts exist. The actual functional pack and evaluation remain draft and unapproved. |
| **G. Is human annotation/adjudication genuinely implemented?** | PARTIAL | Append-only exact-evidence labels, revisions, conflict preservation and adjudication resolution exist and are tested synthetically. Shared identity, visible target roles and limited UI prevent confirmatory-grade blinding. |
| **H. Is reviewer reliability genuinely computable?** | YES | Nominal/ordinal Krippendorff alpha is executable, missing-aware, criterion-level and independently matches the known reference vector. No empirical reviewer calibration or accepted threshold evidence exists. |
| **I. Are the main behavioral metrics executable?** | PARTIAL | Role fidelity, ICR, participation/Gini/entropy, position change, alignment, unanimity, structural minority/fidelity and optional artifact quality are executable; several private/public/coalition metrics are absent and some relation rates are only partial. |
| **J. Are statistical analyses implemented at the correct experimental level?** | YES | Paired block differences and mean treatment-minus-control estimates are used; bootstrap/Holm and optional REML are present. The methods are not scientifically approved and small-N/precision choices remain open. |
| **K. Are P1-A through P1-D real executable gates?** | PARTIAL | P1-A/B/C are executable machine gates; P1-D intentionally always returns `BLOCKED`, and none is a scientific significance gate. Current mock fixture was A PASS/B BLOCKED/C BLOCKED/D BLOCKED. |
| **L. Are locked datasets genuinely immutable/reproducible?** | PARTIAL | Hashed snapshots, lock enforcement, repeatable analysis and tamper detection work through the app. Direct DB mutation and dynamic export remain possible without external immutable archival. |
| **M. Is Phase 1A ready for live calibration?** | NO | No Phase 1A live calibration evidence exists, and C-01/H-01/H-02 plus draft scientific instruments must be closed first. |
| **N. Is Phase 1A ready for a confirmatory campaign?** | NO | No approved/calibrated instruments, independent reliability evidence, frozen confirmatory SAP, sample-size decision, protected deployment, or live dataset exists. |
| **O. Can scientific behavioral claims be made now?** | NO | PR #9 provides infrastructure and mock/structural evidence only; it does not provide calibrated human labels or confirmatory data. |
| **P. Has Phase 1B started?** | NO | No capability-treatment schema, corpus, registry, assignment, metric layer, or tests exist. |

## Bottom-line disposition

PR #9 is a meaningful, reviewable Phase 1A implementation increment and confirms the core canonical architecture in a deterministic/mock environment. It should not be labeled "scientifically closed," "live-calibrated," or "ready for confirmatory behavioral claims." The next action is to resolve C-01 and H-01/H-02/H-03, re-run the complete technical suite, then obtain scientific approval of the instruments and execute a protected live calibration with independent human review before any confirmatory campaign.

## Audit evidence index

| Evidence | Purpose |
| --- | --- |
| PR #9 metadata and GitHub checks | Current review state, lineage, mergeability and CI |
| `docs/phase1/CANONICAL_PROTOCOL.md` | Canonical stage/order/ballot/S8 contract and explicit limitations |
| `docs/phase1/SCIENTIFIC_ANALYSIS.md` | Metric hierarchy, annotation/reliability/statistics workflow and unresolved scientific choices |
| `src/orchestrator/runner.ts`, `src/orchestrator/stateMachine.ts` | Executable stage order and completion behavior |
| `src/phase1/collective.ts` | S7 ballot schema, aggregation, S8 artifact, audit and provenance |
| `src/phase1/evaluationContract.ts`, `src/phase1/positions.ts` | Roles, questionnaire, response parsing and position measures |
| `src/phase1/behavioralAnalysis.ts`, `src/phase1/scientificDataset.ts` | Behavioral formulas, missingness, coding resolution and reliability integration |
| `src/phase1/statistics.ts`, `src/phase1/scientificAnalysis.ts`, `src/phase1/mixedModel.ts` | Alpha, bootstrap, Holm, precision and REML implementation |
| `src/semantic/phase1Annotations.ts`, `src/phase1/artifactReview.ts` | Human evidence, revision, adjudication and artifact review contracts |
| `src/phase1/scienceStore.ts`, `src/phase1/export.ts` | Dataset lock, hashes, snapshots and export contents |
| `src/server/auth.ts`, `src/server/phase1.ts` | Authentication boundary and sensitive UI/API exposure |
| `tests/phase1Canonical.test.ts`, `tests/phase1Science.test.ts`, `tests/phase1Statistics.test.ts`, `tests/phase1ScienceUi.test.ts`, related Phase 0/behavior/restart/tool/export tests | Deterministic positive/negative/runtime coverage |
| Fresh local verification outputs | 466/466 tests, build, diff check, Phase 0 regression and independent alpha calculation |

## Required closing facts

- **PR #9 title:** `Phase 1A: canonical protocol and scientific analysis workflow`
- **Base/head SHAs:** `7f0cd4d2d3bc972b5244294c98faacc87e3a46cb` / `4f20c23660d9e508c4d6724aedd7f1cb7a2c52ec`
- **Files changed:** 44; `+2105 / -30`
- **Tests:** 45 files, 466 passed, 0 failed
- **Build:** TypeScript build passed
- **Phase 0 regression:** exit 0; `phase0_validated=true`; M1-M22 and Gates 1-3 `PASS` under mock
- **Findings:** 1 CRITICAL, 3 HIGH, 8 MEDIUM, 2 LOW, 9 SCIENTIFIC_DECISION items
- **Eight-stage verdict:** PARTIAL overall; implemented and mock-verified, not live/scientifically validated
- **P1 verdict:** current fixture P1-A `PASS`, P1-B `BLOCKED`, P1-C `BLOCKED`, P1-D `BLOCKED`; P1-D is non-passable by design
- **Calibration readiness:** NOT_READY
- **Confirmatory readiness:** NOT_READY
- **Phase 1B:** NOT_STARTED
- **Recommended next action:** close C-01 and H-01/H-02/H-03, then approve/freeze instruments and execute protected live calibration with independent human review
- **Artifact:** `docs/phase1/AGORA_PHASE1_PR9_INDEPENDENT_REVIEW.md`
