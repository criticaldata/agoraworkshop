# Phase 1A Statistical Analysis Plan v1

**Version:** `agora-sap-v1`  
**Status:** frozen for calibration; calibration-derived precision and sample size
are the only intentionally data-dependent values.  
**Provenance:** the supplied *AGORA Phase 1A Statistical Analysis Plan v0.1
revised* and the Phase 1 scientific framework; implementation is tested in
`src/phase1/scientificAnalysis.ts` and `src/phase1/reliability.ts`.

## Estimand and unit

Phase 1A varies only the functional role treatment. The inferential unit is a
predeclared paired block containing one control and one treatment run. Messages
are nested observations, never independent experimental replicates.

For endpoint `Y`, the block difference is `Delta_b(Y) =
Y_b,treatment - Y_b,control`. The primary estimand is the mean paired difference
`ATE_Role(Y)`. Incomplete pairs are retained in campaign accounting but are not
imputed or silently deleted.

## Endpoint hierarchy

- Primary: Role Fidelity (`rf-v1`). Weighted 0–2 criterion scores are aggregated
  first within participant and then at run level. Missing or `not_assessable`
  review is not zero.
- Key secondary: Interaction Contingency Rate (`icr-v1`), based only on a
  substantive dependence on an earlier, actually exposed peer argument.
- Prespecified secondary inferential family: participation concentration/Gini and
  initial-to-final expressed-position change.
- Descriptive or exploratory: voting alignment, vote unanimity, structural
  minority preservation, final-output fidelity, relation subtypes and
  final-output quality. Exploratory outcomes cannot rescue a null primary.

Every exported metric carries its version, numerator, denominator, exclusions,
source/evidence IDs and missingness state. The interpretation boundary excludes
consciousness, latent preference, stable personality, persuasion, causality from
chronology and coalition formation from proximity.

## Missingness and exclusions

The analysis distinguishes valid behavioral zero, `NOT_EXERCISED`, executed but
invalid, executed but missing, infrastructure failure, measurement missingness and
annotation missingness. A zero valid denominator is `NOT_ESTIMABLE`. A valid
explicit abstention or no-op is behavioral evidence; timeout, provider failure,
deadline, budget exhaustion and unresolved retry are infrastructure missingness.
No missing or invalid observation is coerced to zero.

ICR eligibility requires a non-initial participant message, an earlier message by
another participant and authorized exposure to that earlier content. Chronology or
parallel monologue alone is insufficient. S7 and S8 are excluded from participant
behavioral interaction scoring.

## Uncertainty and multiplicity

The primary interval is a two-sided 95% paired-block nonparametric bootstrap with
10,000 resamples, fixed seed `20260911`, percentile interval and centered
bootstrap p-value where applicable. Resampling preserves each control/treatment
pair; individual messages are never resampled as replicates. The single primary
uses two-sided alpha `0.05`. Holm correction is applied within the prespecified
secondary family.

## Human measurement and reliability

Two authenticated reviewers independently code the same frozen calibration subset
before seeing each other's labels. RF uses ordinal Krippendorff alpha on 0/1/2
scores; ICR uses the appropriate categorical coding; relation subtypes are
reported diagnostically and do not gate RF. RF and ICR require alpha `>= 0.80`,
at least 30 pairable units per stratum and 100% eligible-unit coverage. Fewer than
30 pairable units is `INSUFFICIENT_COVERAGE`, never PASS. Disagreements are
inspected and adjudicated in a separate append-only record; original labels and
pre-adjudication alpha remain unchanged. Reliability is necessary, not proof of
construct validity.

## Calibration-dependent precision

The live calibration campaign measures run-to-run paired-RF variance, metric
computability, annotation burden, RF/ICR distributions, expressed-position change
and infrastructure contamination. After calibration, the final target half-width
`h*`, observed `sigma_delta`, paired-block count and planning justification are
frozen using `B ~= (z_0.975 * sigma_delta / h*)^2` and checked against the bounded
outcome distribution. Until that evidence exists, the plan reports
`PENDING_CALIBRATION_DATA`; this is not permission to redesign the endpoint or
silently choose a convenient N.

## Analysis states

The plan supports calibration and confirmatory snapshots. Confirmatory analysis
requires a locked snapshot, approved calibration-derived precision, complete
human coverage, empirical reliability and adjudication. A failed human criterion
produces `HUMAN_VALIDATION_FAILED_RECALIBRATION_REQUIRED`; it never mutates this
version or turns disagreement into agreement.
