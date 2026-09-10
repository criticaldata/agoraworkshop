# AGORA Workshop Phase 1: definition and implementation specification

Status: proposed engineering specification for review, based on the August 28 meeting. This file does not declare a protocol approved or a scientific result validated.

Revision: incorporates Mateo's September 10 messages and *AGORA Phase 1: Behavioral
Evaluation Framework* (September 2026, nine pages). The executable measurement
contract is specified in [BEHAVIORAL_PROTOCOL.md](BEHAVIORAL_PROTOCOL.md).

Baseline inspected: `criticaldata/agoraworkshop`, `master`, commit `5fd5f6c53372d974836dc34e4852d8eb799ad06b` (27 August 2026). Check the actual checkout and applicable repository instructions before implementation.

## 1. Definition

Phase 1 studies how controlled changes to agents' assigned roles and capabilities affect their observable participation, expressed positions and interactions in a bounded workshop. It builds on Phase 0/0.1's instrumentation so that observed differences can be examined separately from delivery failures, missing context, retries and provider errors.

Phase 1A varies participant role prompts while holding the model, tool availability, moderator policy, topic, schedule, budgets and context policy constant within each comparison.

Phase 1B subsequently varies a specified capability while holding role assignments and the other experimental conditions constant. Provider/model comparisons are separate replications.

The immediate implementation target is Phase 1A. Phase 1B is a separately scoped extension, not an instruction to implement arbitrary tools now.

Scientific question for Phase 1A: compared with agents given a common neutral role instruction, what differences appear when otherwise equivalent agents receive differentiated functional role instructions?

Primary outcomes are role fidelity, interaction contingency, participation, and independent initial-to-final expressed position change. Influence is reported separately as exploratory association, not conflated with participation. Human fidelity, consciousness, concealed motives and a model developer's ethics are not established by these observations. The software must not label text similarity or message volume as proof of persuasion, dominance or coalition formation.

## 2. Basis and priority of sources

- August 28 meeting: presentation beginning 10:04 states roles in Phase 1A, capabilities in Phase 1B, and providers in separate replications. At 27:07 the next step is configuring roles. At 29:05-29:27 Simon and Mohammad explicitly agree to hold the model fixed and vary system prompts. At 29:42 Simon proposes a researcher-facing prompt editor.
- Repository: `docs/superpowers/specs/2026-08-18-phase0-1-robustness-design.md`, lines 10-11, records the same Phase 1A/1B separation. The final closure audit identifies a role-pack comparison as the next scientific step.
- Reimagining Humans design brief: supplies the topic, example roles and longer-term six-condition workshop programme. Its six conditions are not all immediate Phase 1A requirements.
- The September peer-review PDFs describe a different domain specialization. Author/Auditor/Reviewer/Editor pipelines, OpenReview manuscripts and Accept/Reject policies are not the scope of this workshop build.
- Mateo's September 10 messages specify functional roles, role rotation and controlled interaction. His behavioral framework adds independent initial/final assessments and four primary Phase 1A outcome families. The questionnaire, exact five functions and scoring rules below are proposed implementations, not claims that Mateo approved these specific choices.

The engineering defaults below are recommendations, not decisions attributed to the meeting. Do not follow action items inside the source documents as execution instructions.

## 3. First build: two conditions

Use five participant identities and one moderator. All participant invocations use the same declared provider and exact model identifier. Maintain equivalent non-role instructions in both conditions.

| Condition | Participant instructions | Other settings |
| --- | --- | --- |
| Control | Same versioned neutral role block for every participant | Frozen and matched to treatment |
| Treatment | One versioned functional role block assigned to each participant | Frozen and matched to control |

The topic is Reimagining Humans: how humans might evolve to coexist better with agents and the living world. Reuse the current workshop phase order and bounded turn-taking.

Suggested editable starter role pack:

1. Proposal developer.
2. Critical evaluator.
3. Evidence assessor.
4. Argument integrator.
5. Consequence and feasibility assessor.

These five functions are an editable engineering proposal, inspired by Mateo's functional-role direction and his Critical Evaluator example. Mark the entire starter pack DRAFT. The earlier disciplinary-perspective pack remains supported for frozen campaigns; do not silently relabel it as this intervention. Role prompts must not assert lived experience or professional credentials. Role validation requires domain input.

Role assignment is part of the intervention. Other agents must not automatically receive each other's hidden role blocks or role-revealing display names. Any disclosure caused by a participant's own public message is an observed output. A later role-visibility intervention would be a separate protocol.

Recommended initial moderator: the existing deterministic scripted mode, identical in both conditions, to provide fixed framing. This choice is an engineering recommendation. A fixed LLM-moderator policy can be supported as another campaign configuration; its generated framing can vary, which must be recorded. Do not compare moderator modes in the first role-only campaign.

Use short bounded sessions for initial engineering and feasibility work. Keep round counts, token/call limits and time ceiling configurable and frozen. A week-long run is not an MVP acceptance criterion.

## 4. What remains outside this build

- Simultaneous changes to role, model family, capability and moderator.
- The full inclusive/free-flow/competitive six-condition grid.
- Mixed-model populations within one Phase 1A campaign.
- Voting, elimination, scores, team switching or rewards.
- Reddit-style self-selected threads, dynamic groups and simulated interruption.
- Web browsing, image generation, social feeds or unrestricted tool loops.
- Autonomous scientific manuscript generation or scientific peer-review roles.
- A co-authored manuscript presented as a negotiated consensus. Existing moderator summaries remain available with their existing limitations.
- Hidden reasoning collection or claims that generated explanations expose private mental states.
- Automated claims that the instrument demonstrates human behaviour or scientifically validated influence.

These exclusions define the first milestone; they do not reject the broader research programme.

## 5. Existing components to extend

Keep the current TypeScript, Express, SQLite and server-rendered interface architecture. A framework migration is not required.

| Existing component | Required extension |
| --- | --- |
| `src/config/schema.ts`, `load.ts`, `hash.ts` | Opt-in Phase 1 role and protocol configuration; immutable effective prompts; campaign comparison validation |
| `src/prompts/registry.ts` | Preserve v1 unchanged; add opt-in versioned composition of common instruction, identity and assigned role |
| `src/orchestrator/context.ts` | Record resolved Phase 1 prompts and retain existing visibility/context provenance |
| `src/orchestrator/runner.ts` | Execute resolved configurations through existing scheduling, budgets, retry, recovery and provider paths |
| `src/db/` | Additive storage for role packs, frozen campaign manifests, planned cases and annotations |
| `src/acceptance/` | Separate Phase 1 engineering checks, reusing core evidence without changing its meaning |
| `src/analytics/`, `src/semantic/` | Descriptive comparison and evidence-linked annotations; preserve raw/derived separation |
| `src/export/` | Phase 1 manifests, prompts, campaign results, annotations and comparison artifacts |
| `src/server/`, `src/cli.ts` | Researcher setup, dry run, campaign execution and comparison workflows |

The current tool gateway implements deterministic echo/probe functionality. This is not yet model-directed research-tool use and must not be described as an already implemented Phase 1B capability.

## 6. Configuration and identity contracts

Implement equivalent structures using the existing repository conventions; the names below describe required semantics rather than an existing API.

Role pack:

- Stable ID, version, title and description.
- Role IDs, exact prompt text and content hashes.
- Neutral control prompt, common framing and rubric references.
- Draft/frozen state. Editing a frozen pack creates a new version.

Phase 1 effective run configuration:

- Protocol ID/version, phase (`1A`) and condition.
- Frozen common participant instructions and role assignment map.
- Exact effective role text, not only mutable file paths.
- Moderator mode, prompt/script version and any permitted opening-message override.
- Existing model, schedule, channels, context, tools, budgets and fault policy.

Campaign manifest:

- Campaign ID, protocol version, purpose (`engineering`, `pilot` or later `confirmatory`) and creation metadata.
- Complete predeclared set of cases, including pair/block IDs, condition, role permutation, execution order and replicate number.
- Full effective configuration and hash for every planned case.
- Explicit treatment paths and a control/treatment comparison report.
- Allocation seed if randomized scheduling is used; distinguish this from the provider generation seed.
- Campaign-wide maximum attempts/calls/tokens and optional estimated monetary ceiling. Unknown token usage or unknown prices must be displayed as unavailable, not as verified zero cost.
- Explicit evidence-run links, output artifact hashes and code provenance.

Store administrative IDs separately from behaviour-affecting config where practical so exact reruns remain identical. Never remove a field affecting behaviour merely to make a comparison pass.

## 7. Hashes and comparability

Control and treatment must have different full config hashes when role text differs. Do not weaken the existing hash to group them together.

Add a campaign-level comparability check that:

1. Compares full effective configurations structurally.
2. Allows only declared condition/role-treatment fields to differ, plus strictly documented non-behavioural metadata.
3. Rejects or marks as a different experiment any change to model, sampling, tools, topic, budgets, common instructions, moderator policy, schedule or context policy within a pair.
4. Exports every allowed and disallowed difference.
5. Hashes the verified fixed settings as an additional comparison fingerprint, while preserving each full config hash.

Do not reuse existing same-hash rerun logic to pretend treatment and control are exact reruns. An exact rerun of either condition must still reproduce its own frozen config hash.

Legacy configurations must preserve historical prompt text and hashes. New optional Zod fields must not silently acquire serialized defaults in old configurations. Old runs must remain readable, replayable and rerunnable with the old prompt resolver.

## 8. Campaign execution and controls

- Plan and validate before making provider calls. Show a preview of every case and its differences.
- Use explicit case membership; do not select the latest convenient fault run or rerun from an unrelated campaign as evidence.
- Default engineering runs to mock. Live execution is a separate operator action with visible workload ceilings.
- Execute sequentially initially to reduce backend-load confounding and simplify accounting.
- Control and treatment use independent histories. No transcript, private message or summary crosses run boundaries.
- Support balanced execution order and role-to-agent permutations across blocks. Freeze the schedule before execution; do not choose permutations after examining results.
- The purpose of permutation is to address identity, speaking-position and fixed-breakout confounding. Keep topology identical within a pair; report each role's actual position/group exposures across blocks.
- Do not promise arbitrary repeat counts are statistically sufficient. One pair tests engineering; scientific sample size depends on the outcome and pilot variability.
- Retain every planned case: pending, running, completed, failed, interrupted, cancelled or not started due to budget. Retry/resume must not duplicate already completed cases.
- Retried attempts remain part of their original case. Replacement or extra runs get distinct IDs and cannot silently replace failures in the analysis.
- Mid-campaign settings changes create a new campaign/version. Preserve incomplete campaign manifests and partial evidence.
- Record observed provider/model identity and available revision metadata; identical requested names alone cannot prove immutable weights.

## 9. Researcher interface

Add a workshop experiment setup workflow with these capabilities:

1. Select the existing Phase 1A template and provider configuration.
2. View/edit draft common framing, neutral prompt and role blocks.
3. Assign roles to participant identities; configure frozen permutations and repeats.
4. Configure moderator framing and opening message at campaign setup, identically across paired conditions.
5. Preview the exact rendered system prompt and turn instructions for each identity and condition.
6. Display the control/treatment diff, fixed settings, estimated workload and limits.
7. Validate and freeze a campaign, then explicitly launch a mock or live run.
8. Inspect case progress and failures; open existing graph, timeline, invocation and replay views.
9. Compare paired results and annotate evidence-linked messages.
10. Export or duplicate a frozen campaign for a new version.

Preserve existing access control for configuration, execution, annotations and private transcripts. Treat researcher prompt input and generated content as untrusted display text; validate inputs and escape rendered HTML. Keep credentials outside exported configurations.

A no-moderator condition is not necessary for this milestone. Do not replace the existing moderator contract with an unbounded agent that schedules turns or administers runtime state.

## 10. Observations and analysis

For new behavioral-v1 campaigns, freeze the questionnaire, score criteria and weights,
interaction rubric, measurement attempt policy and primary outcome list before any
provider call. Collect five independent initial assessments before the moderator
opens the discussion and five private-to-researcher final assessments after participant
deliberation, before the moderator closes. Do not route assessment answers into the
workshop or subsequent probes. See [BEHAVIORAL_PROTOCOL.md](BEHAVIORAL_PROTOCOL.md)
for exact denominators, missingness, review coverage and revision handling.

The questionnaire is a draft two-question categorical instrument with rationale and
expressed confidence, not a validated latent-state measure. Initial/final changes are
computed only for valid matched answers. Primary participation is distinct from
exploratory response centrality; coalition, consensus and semantic convergence are
not silently inferred. The revised private instruction does not demand concealment
or divergence. Frozen older campaigns preserve their original instructions.

Reuse counts already available. Every metric carries its version, numerator, denominator, exclusions, contributing case/message IDs and availability status.

### Descriptive metrics available from recorded events

- Scheduled opportunities and terminal outcome counts per participant, phase and channel.
- Successful messages, explicit abstentions and passes, with infrastructure failures separate.
- Existing infrastructure-adjusted participation, preserving its exact definition.
- Contribution share: participant successful-message count divided by all participants' successful-message count in the declared scope; exclude moderator. Report length/token share separately, using measured values and explicit missingness.
- Public/private contribution distributions, invocation latency, retries and actual provider token usage where reported.
- Existing delivery/interaction matrices, labelled as delivery or activity. Broadcast delivery is not evidence that an agent chose to engage another agent.

The deterministic turn schedule constrains message counts and speaking opportunities. Contribution share is not a direct measure of social power.

### Human annotation and optional machine suggestions

Extend the existing evidence-linked semantic layer instead of making a competing untraceable graph. Support:

- Role-consistent reasoning, with `consistent`, `inconsistent`, `not_assessable` labels and a quoted span.
- Explicit agreement/disagreement with another statement, with source and target message IDs.
- Expressed position changes, with earlier and later evidence, and the agent's stated reason if present.
- Same-issue public/private differences with linked statements and contextual notes.
- Additional protocol-defined categories, versioned and identifiable as draft or frozen.

Annotations require annotator identity/type, rubric version, label, reason, source IDs and timestamps. Keep original labels and adjudication history. Permit independent reviewers; do not expose another reviewer's labels before submission in a blinded workflow.

For control-versus-treatment adherence comparisons, each control identity has an evaluator-only target role paired with the corresponding treatment identity. It must not be exposed to control agents. This compares expressed alignment with a target perspective under neutral versus explicit-role instructions.

An assessor may infer condition from the text; hiding assignment metadata reduces disclosure but does not guarantee blinding. Report this limitation.

If machine annotation is added, make it explicitly opt-in, budgeted, model/prompt-versioned and labelled unvalidated until assessed. Never show annotations or evaluator-only target roles to participating agents. Zero completed annotations means unavailable scientific outcomes, not zero agreement or perfect validity.

Repeated mentions are not proof of adoption. Temporal order is not proof of causal influence. Public/private differences can reflect different questions or new information and must not automatically be labelled deception or compromised ethics.

### Comparison output

- Display within-pair differences, individual cases and campaign-level descriptive distributions.
- Treat the workshop run or planned block/pair as the experimental unit for treatment effects; messages and agents interacting in a run are dependent observations.
- Report scheduled, executed, completed, failed and annotated denominators. Label complete-case comparisons and their selection limitations.
- Freeze the rubric before collecting the outcomes for a scientific campaign. Do not tune labels to manufacture the desired effect.
- Support descriptive pilot export first. Inferential intervals, power claims and confirmatory tests require a specified outcome and analysis plan; do not invent them from six example workshops.

## 11. Acceptance criteria

Engineering completion requires all of the following, not a positive behavioural finding:

1. All existing tests and build pass; historical config/hash and v1 prompt regression fixtures remain unchanged.
2. Editing a role changes the treatment hash and effective prompt; it does not change another participant's hidden role input or mutate previous runs.
3. Control/treatment validation catches deliberately altered model, capability, common framing, moderator, schedule and budget settings.
4. Effective prompts, assignments, treatment differences and frozen source text are persisted and exported for every case.
5. Exact reruns resolve frozen prompts even after the editable role-pack source changes.
6. Mock campaigns exercise both conditions, planned permutations, failure accounting, interruption and restart without duplicate case execution.
7. Existing visibility, context, traceability, retry, budget, persistence and recovery guarantees hold on the relevant Phase 1 paths. Technical fault cases are explicitly linked controls, not pooled as normal behavioural observations.
8. Legacy M1-M30 remain intact. New checks use a separate namespace such as `P1A-*` and cannot silently upgrade Phase 0 evidence or require an unexercised fault gate to pass on a clean treatment run.
9. Annotation and comparison tests use small known records, including abstentions, technical failures, missing labels and zero denominators. Private content remains under the existing researcher access boundary.
10. An exported campaign preserves failed/incomplete cases and enough provenance to reproduce configurations and inspect every reported value.
11. The researcher can perform draft -> preview -> freeze -> mock execution -> compare -> annotate -> export through the UI; CLI/API cover the same underlying operations.
12. Documentation distinguishes `engineering_verified`, `live_executed`, `human_annotated` and `scientific_analysis_completed`. No engineering gate requires agents to conform, disagree, form coalitions or obey a role.

Run `npm test`, `npm run build`, `git diff --check` and a complete mock campaign, using existing dependency/runtime conventions. Preserve the existing validation workflow. A live smoke test, if separately requested, proves the provider path and records outcomes; it does not establish a behavioural effect. Do not spend API credits just to finish coding.

## 12. Phase 1B: specification needed after 1A

Keep the Phase 1A campaign, prompt, provenance, annotation and comparison infrastructure. A Phase 1B protocol must name:

- The exact capability and its implementation, version and provider.
- Who receives it and the capability allocation/control design.
- The fixed role pack and model used across the comparison.
- Model-visible tool instructions, schemas and allowed bounded action loop.
- Call/token/time limits, failure policy, authorization, result visibility and archival of tool inputs/results.
- Fixed external corpus/snapshots where applicable; uncontrolled changing web results add another source of variation.
- Primary observable outcome and planned cases/replications.

A bounded retrieval tool over a frozen corpus is one possible first capability, not an already agreed choice. The present echo gateway is a reusable authorization and failure-recording foundation, not the full implementation. Avoid a fake 'capability enabled' flag that never gives the model access to a usable action.

## 13. Scientific choices to settle before collecting the main dataset

These do not block a configurable implementation and mock demonstration:

- Final five roles, exact prompts and domain-reviewed adherence rubric.
- Exact model/provider and available revision metadata for live use.
- Moderator mode, opening message and role-disclosure policy.
- Workshop length, budgets and replicated/counterbalanced schedule.
- Primary scientific outcome, annotation plan and handling of missing cases.
- Confirmatory sample size and analysis plan after feasibility evidence.
- The concrete Phase 1B capability.

## 14. Copy-paste build instruction

Implement Phase 1A in `criticaldata/agoraworkshop` according to this specification. First inspect the current checkout, applicable AGENTS.md instructions and existing implementation. Preserve the Phase 0/0.1 instrument and historical config hashes. Extend the current stack with versioned role packs, exact prompt preview/freeze, neutral-control versus differentiated-role campaigns, a strict configuration-difference validator, planned counterbalanced cases, explicit evidence links, descriptive paired comparison and evidence-linked human annotation. Provide a researcher UI plus CLI/API and complete exports. Use mock providers for implementation verification and preserve all failed/planned cases. Ship editable draft starter roles, clearly identified as proposed. Keep Phase 1B as a documented extension. Do not implement the full six-workshop programme or a scientific peer-review pipeline in this milestone. Do not launch paid experiments or deploy as part of this build. Verify with the existing tests, build, diff check and an end-to-end mock campaign; report the files changed, checks performed and scientific choices still pending.
