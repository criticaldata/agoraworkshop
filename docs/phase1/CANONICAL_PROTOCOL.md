# Canonical Phase 1A: eight-stage engineering increment

Follow-up: [SCIENTIFIC_ANALYSIS.md](SCIENTIFIC_ANALYSIS.md) now implements the
configurable scientific machinery listed as pending in this historical increment.
The eight-stage execution contract itself remains unchanged.

Status: implemented for review, not scientific closure. Based on Mateo's explicit
September 10 confirmation of S1–S8 and his Scientific Foundation and Experimental
Framework. The stage order is confirmed; the concrete voting rule below is a
proposed operational choice, not an approval attributed to Mateo.

This increment builds on merged PR #6 (`7f0cd4d`). No live campaign, production
deployment, paid provider call, or Phase 1B capability experiment is part of it.

## Frozen stage contract

`PlanInput.canonical` opts into `canonical-eight-stage-v1`. The exact contract is
copied into each run and included in its config hash and paired comparability
check. Omission retains legacy execution. Existing frozen manifests are not migrated.
UI/CLI templates select canonical mode; the programmatic `starterInput(base)` stays
legacy-compatible (`starterInput(base, true)` opts in).

| Stage | Implementation | Participant evidence |
| --- | --- | --- |
| S1 Independent Initial Position | Five assessment calls, empty workshop history | Structured private assessment records |
| S2 Public Plenary I | Existing public rounds, frozen scripted opening | Public interaction messages |
| S3 Private Rooms / Breakouts | Existing private rounds; exactly one group per participant | Scoped private interaction messages |
| S4 Public Reconvening | New `PUBLIC_RECONVENING` state, one participant round | Participant-selected public reports of breakout points |
| S5 Public Plenary II | Existing final-discussion state with a distinct interaction instruction | Further public responses, not the final questionnaire |
| S6 Independent Final Position | Five assessment calls using authorized dialogue history | Structured private final assessments |
| S7 Sealed Collective Outcome | At most five single-attempt calls, deterministic aggregation | Researcher-only individual ballots |
| S8 Structured Final Output | Schema-validated deterministic artifact; no model call | **Not participant behavior** |

Canonical mode requires five participants, the fixed scripted moderator, no tools,
zero introduction rounds, positive S2/S3/S5 rounds, and breakout membership for each
participant exactly once. The moderator's procedural closing message occurs after
S8, outside participant measurement. It does not summarize or influence the outcome.

All five S6 records must be valid before **any** S7 call. Every ballot receives the
same dialogue snapshot, filtered separately by the frozen access/context policy.
No initial/final assessment, previous ballot, aggregate outcome, or S8 artifact is
inserted into participant context. S4 reports are intentional participant behavior;
the system does not automatically expose private transcripts to the public group.

## Proposed S7 voting rule

Version: `single_choice_absolute_majority_v1`.

- One exact questionnaire option per question; JSON `null` is explicit abstention.
- A decision requires all five valid ballots and at least three votes for an option.
- Abstention does not lower the majority threshold. Questionnaire options such as
  “no preference” remain substantive options, distinct from ballot abstention.
- Ties or any fully observed result without three votes remain `no_majority`.
  No ordering-based tie breaker and no moderator discretion are used.
- Missing, invalid, interrupted or budget-excluded ballots yield `incomplete`,
  never a manufactured decision—even if three of the available votes agree.
- A ballot is reserved durably before calling the provider. There is no repair or
  retry. Pending or unknown-usage attempts block further calls on resume.
- Votes use the same provider/model, agent budgets and campaign admission ledger as
  dialogue and assessments. Five new maximum ballot attempts per run are shown in
  the workload preview. No call is made to generate S8.

The ballot format is `{"ballots":[{"question_id":"…","choice":"exact option"}]}`.
Every frozen questionnaire question must occur exactly once. Invalid raw responses
are retained with their error and usage. Ballots are not normal discussion messages
and do not inflate dialogue participation or interaction metrics.

## S8 artifact and provenance

Version: `deterministic_collective_artifact_v1`. For each questionnaire question,
the artifact includes counts, abstentions, decision/status, majority position,
minority option counts, and unresolved expressed voting differences. It also
contains the run/config identifiers and S6/ballot record IDs. Raw individual records
remain available to researchers; the artifact does not quote private dialogue.

This is a decision over questionnaire options, **not** a generated narrative action
plan. It does not infer unspoken agreement, reasons, coalitions or semantic disputes.
When no majority exists, supported options are listed as unresolved rather than
arbitrarily designating one as the majority. Individual final positions and ballots
are distinct measurements and may legitimately differ.

The saved artifact has a deterministic content hash. Resuming after S8 cannot
silently replace it with a different aggregation. An auditor reconstructs the
ballot contexts from the authorized transcript, verifies responses/usage, checks
the S6-before-S7 event barrier and recomputes the artifact. It reports failures,
not a nonzero-effect requirement.

`phase1_stages`, `phase1_ballots`, `phase1_collective_outputs` are persisted in SQLite,
included in campaign bundles and exported for individual canonical runs. A failed
stage can be incomplete or running at interruption; unstarted stages are shown as
pending. A run status of COMPLETED does not establish complete measurement.

## Closure dashboard: scope and remaining work

The dashboard shows provisional **machine-evidence** checks, not a certificate that
every scientific gate in Mateo's framework has passed:

- P1-A: recorded canonical protocol integrity plus existing runtime checks.
- P1-B: machine-level behavioral observability and provenance completeness.
- P1-C: role-only paired comparability and full role/order balance. A multiple of
  ten blocks crosses five rotations with AB/BA; it is not a power calculation.
- P1-D: scientific closure remains BLOCKED. No automatic upgrade from uploads or
  mock success. Human measurement validation is still required.

These checks allow an observed zero position change, zero reviewed interaction,
or a fully observed no-majority vote. They do not mistake missing observations for
zero. Mock runs validate machinery, not behavior. Role-sensitive oracle calibration,
reviewer-reliability calculations/coverage thresholds, and an agreed inferential
analysis executor are **not implemented by this increment**.

The append-only evidence registry stores actual document text, author, timestamp,
hash, exact campaign-manifest binding and related evidence hashes. It accepts:
`protocol_approval`, `analysis_plan`, `calibration_report`, `reliability_report`,
`analysis_report`. Approval and analysis-plan entries must precede any case starting;
later amendments require a new frozen campaign. Other reports may be added later.
Multiple revisions remain visible; there is no implicit “latest approved” selection.
Identity is self-declared using the existing shared researcher credential, not a
signature or independent verification. The registry cannot backdate preregistration.

CLI example (also available in the authenticated campaign UI and API):

```sh
npm run agora -- phase1 closure-evidence CAMPAIGN_ID --input evidence.json
```

```json
{
  "version": "phase1-closure-evidence-v1",
  "manifest_hash": "sha256:REPLACE_WITH_EXACT_64_HEX_MANIFEST_DIGEST",
  "kind": "analysis_plan",
  "author": "Named researcher",
  "title": "Analysis plan, draft for review",
  "body": "Insert the actual plan, including uncertainty, missing data and multiple primary outcomes.",
  "related_evidence_hashes": []
}
```

The receipt explicitly says `recorded_not_independently_validated`. Evidence is
included in the unblinded researcher export. Do not upload credentials or personal
data unrelated to the study. API: `POST /api/phase1/campaigns/:id/closure-evidence`.

## Next scientific/implementation increment

1. Review the proposed voting rule, role instructions, questionnaire and outcomes;
   incorporate Mateo's rubric and agree reliability measures, coverage and thresholds.
2. Freeze an analysis plan with run/block as unit, uncertainty, missing-data policy,
   multiple-primary-outcome handling and appropriately limited claims.
3. Implement and test rubric-specific calibration/reliability and inferential
   evaluators against that frozen contract. Do not invent thresholds to turn gates green.
4. With explicit live-run authorization, freeze and execute a calibration campaign.
   Mateo supplies annotation/adjudication; record and evaluate the resulting evidence.
5. Review scientific closure before starting Phase 1B.

## Review workflow

Start the existing app and open `/phase1`. The canonical editor explains S1–S8,
S7 rules and draft status. Preview/freeze a mock campaign; inspect “Scientific
closure gates” and “Eight-stage outcomes.” Expand each case for the stage ledger,
artifact, audit and researcher-only ballot records. No live authorization is needed
for mock execution; non-mock execution still requires explicit live confirmation.

The isolated tests cover order, sealing, S6 failure, missing/invalid votes,
majority/minority/ties/abstention, unknown usage, resumed ballots, idempotent output,
context/artifact tampering, role/order balance, pre-execution evidence registration,
export and authenticated UI. Existing legacy tests remain in the suite.
