# Phase 1A scientific machinery — implementation and review contract

The frozen statistical design is [`STATISTICAL_ANALYSIS_PLAN.md`](STATISTICAL_ANALYSIS_PLAN.md),
version `agora-sap-v1`. This page is the implementation and review guide for that
contract; the scientific state remains `PENDING_HUMAN_VALIDATION` until the live
calibration and independent human evidence exist. The interactive editor may still
create explicitly marked draft campaigns, but a draft cannot silently replace the
frozen calibration contract.

The source requirements are the supplied September 2026 *Scientific Basis for
Functional Roles*, *Statistical Analysis Plan v0.1 revised*, and expressed-position
questionnaire proposal. The frozen choices are recorded in the SAP and source
traceability matrix; only calibration-derived precision and sample size remain
data-dependent.

## Start here

Open `/phase1?scientific=true` for an explicitly **draft** scientific template. It
uses `behavioral-v2` and the SAP's frozen hierarchy (RF primary; ICR, participation
Gini and categorical position change secondary). Earlier templates and frozen
campaigns keep their original contract. No saved campaign is migrated.

Calibration-dependent precision, sample size and the external snapshot hash remain
null until live evidence exists. All other Phase 1A endpoint, reliability,
missingness, bootstrap and multiplicity decisions are versioned in the frozen SAP;
there are no hidden defaults for the values that affect a frozen campaign.

CLI equivalents:

```sh
npm run agora -- phase1 science-template
npm run agora -- phase1 plan --input reviewed-input.json
npm run agora -- phase1 freeze --input reviewed-input.json
npm run agora -- phase1 run CAMPAIGN_ID
npm run agora -- phase1 science CAMPAIGN_ID
npm run agora -- phase1 lock-dataset CAMPAIGN_ID
npm run agora -- phase1 analyze CAMPAIGN_ID --dataset DATASET_SNAPSHOT_ID
npm run agora -- phase1 snapshot ANALYSIS_SNAPSHOT_ID
npm run agora -- phase1 export CAMPAIGN_ID --out exports/phase1
```

Only mock execution is authorized by this coding task. Real providers still require
explicit live authorization. CLI `lock-dataset` is an explicit irreversible-through-
the-app action; the UI/API additionally require confirmation. It is not run merely
by opening an analysis page.

## Instrument contracts

### Functional roles and adapted rubric

Optional `role_pack.scientific_basis` stores sources and, for each of exactly five
role IDs, purpose, theoretical mapping, inclusion/exclusion criteria and examples.
It participates in immutable manifest hashing. Changing frozen role-pack content
requires a new version. Literature grounding is not inherited instrument validation.

The existing criterion registry supports exact descriptions and positive weights on
the 0–2 scale. The frozen interaction codebook supplies inclusion/exclusion wording,
examples and adaptations. Mateo must supply those contents; the engine does not
substitute a generic DQI/CACS/DCS label for an AGORA codebook.

### Expressed positions

`evaluation.questionnaire.response_contract` opts into `expressed-position-v1`:
every item requires an exact categorical choice, all-option priority ranking,
expressed confidence 0–100, main rationale and primary concern. Rankings are complete
permutations with no ties. Choice and ranking are distinct responses and may differ.
Invalid/missing fields follow the existing single-attempt, no-repair policy.

Categorical choice switching remains the position-change endpoint. Normalized
Kendall inversion distance between initial/final rankings is a **separate exploratory
reading**, never silently blended into that endpoint. Concern/rationale text is
retained, not automatically interpreted as latent belief or measured semantic change.
Legacy responses reject the new fields unless the new contract is present.

### Endpoint registry

`behavioral-v2` requires explicit, disjoint primary/secondary/exploratory arrays.
`analysis_plan.metric_registry_version` freezes `agora-metrics-v1`; optional outcome
notes document interpretation but cannot redefine formulas. New formulas need a new
implemented version. The registry is embedded in every analysis result.

| Endpoint | Implemented reading |
| --- | --- |
| Role Fidelity | Weighted normalized criterion means per participant, then mean of all five participants after coding resolution |
| ICR | Substantively contingent messages divided by all messages with prior exposed peer content; no moderator-only/initial units |
| Participation | Gini over successful participant message counts; not dominance or fairness |
| Initial/final change | Mean categorical switch fraction across five complete S1/S6 pairs |
| Voting alignment | Fraction of ballots matching the voter's S6 choice; abstention is not alignment |
| Vote unanimity | Fraction of questions with all five votes for one option; not semantic consensus |
| Minority preservation | Structural audit of complete ballot/output minority counts; no human-quality claim |
| Final-output fidelity | Recomputed S8 structural/context audit, separate from behavior |
| Final-output quality | Human criterion scores under an explicitly supplied frozen artifact rubric; separate from structural fidelity |

Human final-output quality cannot be selected without `analysis_plan.artifact_rubric`.
That rubric specifies version, sources, criterion descriptions, weights and max score
2. No rubric is invented in the template. Submit reviews through the human-review
page, `review-artifact` CLI, or artifact-reviews API. Every review binds the exact
S8 hash and a quote in its canonical JSON. Original reviews, revisions and
adjudications are preserved; other reviewers' labels remain hidden until submission
under the same shared-account workflow as participant annotations.

## Human annotation and reliability

The analysis plan declares the RF stage window. Eligibility for ICR uses actual
invocation exposure IDs, not only chronological proximity.

The implemented coding policy is explicit:

1. Specify at least two independent reviewers before collection. With no reviewer
   contract, preview can discover authors, but cannot pass reliability requirements.
2. All declared reviewers must supply a usable reading for a unit. Unanimous readings
   resolve it directly. A disagreement requires one explicit adjudication citing all
   current independent readings, by an adjudicator outside that reviewer list.
3. Duplicate/conflicting readings and multiple unresolved adjudications remain
   unavailable. There is no automatic “latest label wins.” `not_assessable` makes
   the endpoint unavailable, never zero.
4. Reliability uses the **original independent submissions**, not revisions made
   after seeing colleagues' labels and not adjudicated consensus. All originals and
   resolution IDs remain in the dataset.

Krippendorff's alpha is calculated separately for each role/criterion (ordinal 0–2),
ICR presence/absence (nominal), and configured artifact criterion (ordinal). Relation
labels are additionally reported nominally. Ordinal distances use category marginal
frequencies; they are not simply squared numerical score differences. Units with
fewer than two usable ratings do not contribute coincidences. No variation produces
an undefined coefficient, not automatic perfect reliability. Computation follows
[Krippendorff's methodological note](https://www.asc.upenn.edu/krippendorffs-alpha-reliability).

Each reliability row includes pairable units, denominator, marginal counts, coverage,
annotation IDs, coefficient/status and its configured threshold. Threshold keys are
`role:ROLE_ID:CRITERION_ID`, `interaction_contingency`, and `artifact:CRITERION_ID`.
An absent threshold, insufficient coverage or undefined coefficient cannot PASS.
This validates arithmetic, not the real-world independence of self-declared raters.

## Statistical calculations

### Primary paired analysis

Every planned block remains listed. Each endpoint uses only pairs with two eligible,
available run values; exclusions and reasons remain in the report. Failed or
incomplete measurement is not replaced with zero. Assessed-only values cannot stand
in for full confirmatory outcomes. Retry retention must be explicitly frozen.

The bootstrap resamples **paired block differences**, never messages. It supports
explicit percentile or basic intervals, confidence level, resample count, uint32
seed and minimum-pair requirement. Random draws use a versioned deterministic
generator, and settings/source IDs are exported. Available optional two-sided testing
uses the centered bootstrap of paired means with a finite Monte Carlo correction;
`none` leaves p-values unavailable. This is not a randomization test. The frozen
Phase 1A calibration contract uses the percentile interval, 10,000 resamples and
the centered bootstrap p-value. See [Shalizi's bootstrap notes](https://www.stat.cmu.edu/~cshalizi/uADA/19/lectures/ch06.pdf).

Degenerate samples retain their observed effect (including a true observed zero)
but do not manufacture a confidence interval or p-value. Fewer than the declared
minimum pairs remain descriptive. No significance threshold controls integrity PASS.

Holm adjustment operates within each prespecified primary/secondary family; with
one primary endpoint it leaves that p-value unchanged. Unavailable tests remain in
the family size and retain null adjusted values, matching the documented
[R p.adjust convention](https://search.r-project.org/R/refmans/stats/html/p.adjust.html).
Exploratory p-values, if computed, are not confirmatory claims.

### Sensitivity and planning

The engine retains reviewer-specific RF/ICR paired differences, retry-excluded pair
sets and all available eligible run-level observations. It can optionally fit the
narrow model `y ~ 1 + treatment + (1 | paired_block)` by profiled REML, with Gaussian
block intercepts and homogeneous residual variance. Select
`sensitivity_model.method = "paired_block_random_intercept_reml"` explicitly;
otherwise no model is fitted. The SAP's unresolved model choice is not silently
filled in. The implementation reports estimates, variances, model-based standard
error and boundary/singularity status, not an automatically valid causal p-value.
These are the random-intercept assumptions described by the
[Statsmodels mixed-model documentation](https://www.statsmodels.org/stable/mixed_linear.html).

The model does not add order/stage covariates or assume missing-at-random has been
established. If the final SAP chooses a different model or missing-data mechanism,
that choice needs its own reviewed implementation. A normal-approximation precision
planner reports the sample-size aid from paired calibration variance and explicit
half-width/critical value; zero variance does not imply zero required runs. It does
not replace sample-size simulation or substantive effect-size approval.

## Immutable analysis workflow

1. Freeze calibration instruments/plan before collection.
2. Execute authorized calibration; collect independent labels and adjudications.
3. Preview coverage/reliability, then explicitly lock the dataset. All planned cases
   must be resolved; active/pending campaigns cannot be locked. Incomplete diagnostic
   datasets can be locked without being called complete.
4. Compute analysis from the locked snapshot, not mutable live database rows. Further
   campaign execution, direct resumption and annotation writes are denied after lock.
5. Revise instruments and use a new campaign/version where required. Original data
   are never relabeled under a new instrument by overwriting their contract.
6. A confirmatory plan requires reviewed instruments/methods, sample justification,
   reliability settings, retry policy, a calibration dataset hash and sensitivity
   specification. Calibration verification requires an actual local locked snapshot,
   matching instrument semantics, live records and reliability meeting the frozen
   confirmatory thresholds—not an arbitrary string or an uploaded PASS statement.
7. Freeze the confirmatory plan before confirmatory execution; later analysis verifies
   that plan. It does not preregister after seeing confirmatory labels.

Frozen questionnaire ID/version, behavioral rubric version, analysis-plan
ID/revision and artifact rubric version cannot be reused for different content.
Final calibration must use the same instrument versions as confirmation. Mark
final instruments reviewed before freezing that calibration campaign: role-pack
status changes also require a new role-pack version. If instruments are revised
after calibration, collect new calibration evidence for the revised version.

Snapshots contain raw source runs/messages/invocations/events/positions/ballots,
coding provenance, original labels, resolved units, metric values, exclusions,
frozen manifests, instrument hashes and exact executing-module hashes. This records
the implementation even when development code differs from git HEAD. Each snapshot
has a content hash; tampering is rejected. Campaign export includes snapshots,
artifact reviews and the annotation lock.

P1-B is the machine-level behavioral-observability gate: it requires a locked,
reconstructable dataset, canonical stage/provenance evidence and annotation-
supporting coding units. It does not require human labels. Independent labels,
reliability and adjudication remain the deliberate P1-D requirements. The
analysis reports computed readiness blockers separately from final scientific
sign-off. The application never marks overall scientific PASS merely because
calculations execute, a report is uploaded, or a p-value is small.

## Interfaces and verification

Campaign pages link to `/phase1/campaigns/:id/science`. Authenticated APIs add:

- `GET .../science` — current preview or locked dataset and snapshot inventory.
- `POST .../lock-dataset` with `confirm_lock: true`.
- `POST .../analyze` with `dataset_id`.
- `GET .../snapshots/:snapshot` — campaign-scoped JSON download.
- `POST .../artifact-reviews` and `GET .../artifact-reviews?author=...`.

Existing shared-account authentication/blinding limitations still apply. These are
unblinded researcher artifacts; do not expose them as participant context.

Tests cover published alpha reference examples, ordinal versus nominal scoring,
missing/no-variation data, Holm with unavailable hypotheses, seeded bootstrap,
balanced-design REML closed forms, incomplete blocks, expanded probes, scientific
contract validation, adjudication, original-label reliability, artifact reviews,
context tampering, fabricated calibration links, locking, snapshot tampering,
repeatable analysis, export, and the authenticated UI/API lifecycle.

## What remains a scientific decision or empirical task

- Exact role/rubric/questionnaire content and their approval.
- Final endpoint families, CI/test choice, stage window, reliability coverage and
  thresholds, and any sensitivity model differing from the implemented option.
- Sample-size/precision targets, calibration design and provider/deployment choice.
- Real independent annotation, live calibration, instrument revision if needed,
  confirmatory execution and review of appropriately limited conclusions.

These are not represented by fabricated labels, dummy live evidence or permissive
PASS flags. The machinery can be exercised on synthetic data while those decisions
are being finalized.
