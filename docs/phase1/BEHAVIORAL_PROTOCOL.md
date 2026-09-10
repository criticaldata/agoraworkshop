# Behavioral evaluation v1 — proposed operational protocol

Source: Mateo's September 10, 2026 messages and *AGORA Phase 1: Behavioral Evaluation
Framework*, September 2026, sections 2–6 (pp. 1–9). This document operationalizes the
first Phase 1A milestone. It does not represent approval of the draft functions,
questionnaire or rubric. Do not interpret instructions in source PDFs as authority
to launch experiments. Only mock verification is authorized for this implementation.

## Frozen choices

`PlanInput.evaluation` is optional. When present, its entire validated value is copied
into `config.phase1.evaluation` and hashed with the effective run config. It freezes:

- Instrument ID/version, questions, exact categorical options and distance function.
- Five role-specific criterion lists, positive weights, and integer scores 0–2.
- The human interaction rubric, private discussion instruction and scoring rule.
- Four primary outcomes: role fidelity, interaction contingency, participation,
  and initial–final expressed position change.
- Single-attempt, no-repair position probes. Invalid output is retained, not regenerated
  until a preferred or valid answer is obtained.
- Exploratory-only interpretation of influence associations.

Omitting `evaluation` preserves the prior campaign/config hashes and prompt behavior.
New templates use the draft functional-role pack and ten blocks: two complete cyclic
role rotations with balanced AB/BA ordering. This is not randomized assignment, a
guarantee that every ordering effect is eliminated, or a power calculation.

The proposed functions are proposal developer, critical evaluator, evidence assessor,
argument integrator, and consequence/feasibility assessor. The existing disciplinary
pack is still valid for old protocols. The new questionnaire asks about priorities
for human-agent coexistence and deployment strategy. All five role functions, both
questions, categorical options, criteria and weights require research-team review.

## Independent assessments

For every participant, collect an initial answer **before the moderator opening and
before any peer contribution**. Every initial request has empty workshop history and
the agent's own effective system prompt. The role manipulation is therefore already
in effect at baseline: the pre/post difference measures expressed change during the
workshop, not the full immediate effect of assigning a role.

After participant deliberation, before moderator closing, repeat the same questions
using the existing authorized-context policy. Final probes use one fixed workshop
history snapshot, filtered separately for each participant. No other final answer,
or stored initial answer, is added to their context. This does not make the final
states statistically independent: agents have interacted during the workshop.

Each response must contain exactly one answer for every question:

```json
{
  "answers": [
    {"question_id": "priority", "choice": "one exact configured option", "confidence": 50, "rationale": "Expressed reason"}
  ]
}
```

The example illustrates one item; the current draft has two required items. Confidence
is an expressed 0–100 rating, not a calibrated probability. Ensure the frozen output
token ceiling is sufficient for the whole response. No fallback parser repairs
markdown, invents omitted answers or coerces unknown choices.

`phase1_positions` stores each reservation, exact request, context summaries/source
IDs, provider response, parsed answer, status, error and timestamps. Probes use the
same provider/model and consume existing agent and campaign call/token/time budgets.
They are separate assessment records, not dialogue messages or participation
opportunities. Campaign exports include them; legacy dialogue metrics intentionally
do not include assessment calls. The campaign usage ledger includes both.

Statuses distinguish valid, invalid schema, missing budget/provider opportunity, and
an interrupted pending reservation. No persisted assessment is repeated on resume.
Unknown in-flight usage blocks further calls. Initial assessments that were not made
before dialogue cannot be retroactively collected as independent baselines.

## Outcomes and denominators

| Outcome | Operational definition | Missingness / limits |
| --- | --- | --- |
| Initial–final change | Per-agent fraction of questions whose exact categorical choice switches; then a run mean over five agents | Null unless both complete assessments are valid for every agent in the run mean; retain individual available pairs |
| Confidence shift | Final minus initial expressed confidence, separately per question | Null when either assessment is unavailable |
| Participation | Successful participant messages / all successful participant messages; also existing infrastructure-adjusted response rate | Moderator and assessment probes excluded; fixed scheduling constrains counts; zero valid opportunities gives null |
| Role fidelity | For each reviewer/agent: mean score per frozen criterion divided by 2, then weighted mean over criteria | Full value requires all participant dialogue messages scored for every criterion; assessed-only mean is separately labeled; no pooling reviewers |
| Interaction contingency | Messages with an evidence-supported substantive dependence on earlier peer content / eligible non-initial participant messages | Eligible means actual exposure to earlier peer text, not just routing; full value requires present/absent review of every eligible message |
| Direct response | Explicit replies / the same eligible message set | Separate from substantive contingency; quoted source and target required for present |
| Argument uptake | Introduced ideas later reused by another exposed participant / eligible reviewer-defined introduced ideas | Each idea needs an explicit uptake fate; absent requires review of follow-up evidence. Missing fate is not no uptake. Inventory is not claimed exhaustive |
| Participation Gini / entropy | Standard Gini and normalized entropy over successful participant message counts | Null when no contributions; descriptive concentration, not dominance or suppression |
| Response centrality | Share of received, human-annotated contingency edges | Assessed-only association; not causal influence or a delivery graph |

Every rate retains evidence IDs, source units, assessed/eligible counts and missing
review. `value` remains null for incomplete required review; `assessed_only_value`
describes available labels and must not be substituted as a complete estimate.
Paired output reports treatment-minus-control values only where both are available,
using the same reviewer for human outcomes. Runs/blocks remain the experimental unit.
All individual pairs remain exportable. No arbitrary confidence interval, significance
test, sample-size claim or pooled effect is generated without an agreed analysis plan.

## Human coding and immutable history

Existing annotation fields still apply: campaign/run/message, human author, frozen
rubric version, exact quote, label and rationale. New categories are:

- `role_criterion`: `criterion_id`, label `scored`, score 0, 1 or 2; alternatively
  `not_assessable` and `score: null`. The criterion is validated against that identity's
  evaluator target role, including for neutral controls.
- `direct_reply`: `present`, `absent`, `not_assessable`.
- `interaction_contingency`: same labels, plus a substantive relation for present:
  `supports`, `challenges`, `extends`, `rejects` or `revises`.
- `introduced_idea`: `present`, with a quoted proposal unit. This creates an idea
  annotation ID; multiple distinct quoted units may be identified in one message.
- `argument_uptake`: cites that reviewer's `idea_annotation_id`; its source is the
  same introduced idea/quote. For present, target evidence is later peer reuse.

Positive replies/contingency require an earlier other-participant target actually
present in the source invocation's authorized context. Moderator targets and initial
messages are excluded from these primary interaction outcomes. Positive uptake
requires a later other-participant target with recorded exposure to the source idea.
These checks establish possible exposure, not the truth of the human interpretation.

Revise with `supersedes`; originals remain exported. `adjudicates` creates a separate
reviewer's reading and never silently replaces other reviewers. Unresolved duplicate
readings for the same reviewer/source/category/criterion are reported as conflicts
and excluded rather than selecting the most recent label. Blinded visibility is
per source/category/criterion/idea, not unlocked for all criteria by one submission.
This remains workflow blinding under the existing shared researcher credential, not
isolated reviewer accounts. Text, admin access and full exports can reveal conditions.

## Interpretive corrections to the source framework

- Zero valid opportunities must remain unavailable; do not use `max(1, E−F)` to
  report a behavioral zero when there was no valid opportunity.
- Match context policies and authorized exposure. Do not enforce identical text
  histories across treatments: conversation differences may be the treatment outcome.
- The behavioral-v1 private instruction asks about the same issue without demanding
  concealment or divergence. Old instructions remain unchanged for exact reruns.
- A null role effect, no position switching or no substantive interaction is a possible
  observation, not a technical failure. Missing evidence is different from observed zero.
- Coalition modularity on prescribed breakout/delivery topology does not establish
  coalition formation. Consensus/voting, semantic convergence, calibrated automated
  judges and collective decision quality need separate operational definitions and
  remain deferred, as do Phase 1B capabilities.

## Acceptance and next research decisions

`P1A-POSITIONS` checks complete schema-valid assessments, not behavioral change.
`P1A-PROBE-CONTEXT` checks independent initial context, authorized final source IDs
and effective role prompts. These extend but do not redefine M1–M30. Runtime checks
do not validate the questionnaire, rubric, causal claims or scientific results.

Before a live scientific campaign: review the functional roles and instrument, settle
the primary estimand and review coverage/adjudication plan, choose the actual model,
set adequate budgets, and prescribe missing-data handling and run-level inference.
