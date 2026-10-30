# WP06 Analysis — descriptive and annotation tooling

Status: **DESCRIPTIVE_AND_ANNOTATION_BASELINE_IMPLEMENTED — SCIENTIFIC_APPROVAL_PENDING**

WP06 now derives an operator-facing, run-level descriptive summary from the revised
Phase 1A `EvidenceBundle`. It uses the existing WP03 plan and WP04 evidence format.
The [report annotation contract](ANNOTATIONS.md) adds a draft codebook, validated
independent ratings, adjudication, nominal reliability and exploratory report
retention/dissent metrics. It does not call models, change the evidence ledger, or reuse the historical
five-participant role-study metrics under `src/phase1/`.

## Use

For a read-only visual inspection, run `npm run phase1a:preview` and open
http://127.0.0.1:3006. The [preview guide](PREVIEW.md) explains file loading,
synthetic examples, source inspection, data handling and analysis export.

With Node 22 or newer and the repository's locked dependencies installed:

```sh
npm ci
npm run --silent phase1a:analyze -- /path/to/evidence-bundle.json > /path/to/analysis.json
npm test -- --run tests/phase1aWp06.test.ts tests/phase1aWp06Annotations.test.ts
npm run build
```

The input is one complete or partial JSON bundle returned by
`Phase1aRuntime.exportEvidence(runId)`, not a WP01 planning manifest, a legacy
Phase 0 export, or a WP05 replay grid. The output remains operator-scoped. The
CLI writes JSON to stdout and returns a nonzero status on invalid evidence.
Use `--silent` when redirecting npm output to keep its script banner out of JSON.

Import `analyzeRun` from `src/phase1a/wp06/index.ts` for direct use.

## What the summary means

- The independent unit is the run. Participant, opportunity, and retry records
  remain nested evidence, not independent observations.
- The frozen WP03 plan supplies every expected opportunity, including those
  never attempted after an interruption, budget stop, or technical failure.
- A–D conditions are preserved. A/C have 24 opportunities; B/D have 31.
  All have 18 public opportunities. Runtime `t1` maps to scientific `T6` and
  runtime `t2` maps to `TR`. Report stages and `TR` have zero planned
  opportunities in no-report conditions; their response rates are null.
- `success`, `abstained`, `refused`, `timeout`, `provider_error`,
  `invalid_response`, and `rate_limit` remain separate. These are runtime labels;
  the analyzer does not guess a finer provider-failure subtype from text.
- Outcome counts describe the last recorded attempt per opportunity. Attempt
  counts and technical-attempt counts retain failed retries separately. An
  uncommitted response never enters the committed behavioral denominator.
  Completed attempt order follows the event ledger, not the provider-call array.
  `attempts` counts recorded terminal calls; `started_attempts` also includes
  in-flight calls, and `pending_attempts` counts starts without a call record.
  An in-flight retry keeps the opportunity pending while retaining the prior
  attempt's outcome and technical-attempt count.
- The descriptive response rate is committed `success` divided by committed
  `success + abstained + refused`. It is an engineering aggregation proposal,
  not an approved scientific participation estimand. A zero denominator is null.
  Planned, unattempted, pending, failed and uncommitted counts accompany it.
- Usage includes all recorded attempts. Missing usage is null; `known_total`
  is only the observed subtotal. A known zero remains zero.
- Outputs retain manifest/source hashes, admission class, source event/call IDs,
  output artifact IDs, and an algorithm version. The evidence fingerprint omits
  the verifier's timestamp so re-verification alone does not change it.
- Integrity is recomputed. Duplicate commits, invalid output linkage and
  inconsistent completed runs are rejected. This does not authenticate an
  externally supplied bundle against a trusted publisher or certify all runtime
  semantics; retain the original sealed export and its provenance.
- No private checkpoint bodies, report bodies, prompts, or raw responses appear
  in this summary. It still contains operator metadata and is not a public export.

A committed response means delivery evidence exists; it does not mean substantive
agreement, valid stance measurement, persuasion, or scientific eligibility. Fixture
and engineering results retain their admission class. Every output leaves
scientific approval pending. The one-argument engineering summary leaves behavioral
outcomes unavailable; the annotation mode computes only explicitly labeled
exploratory report measures when all evidence and annotation prerequisites hold.

## Acceptance evidence

The tests use the real Phase 1A runtime with deterministic providers. They are
engineering fixtures, not a pilot dataset. See [acceptance mapping](ACCEPTANCE.md).

## Next WP06 increments

1. Agree a versioned proposition/stance codebook with PRESENT, ABSENT, and
   NOT_ASSESSABLE labels, exact evidence spans, boundary cases and counterexamples.
2. Validate the implemented independent coder records, separate adjudication and
   reliability reporting with a blinded calibration sample. Record approval
   externally; successful tests do not approve the codebook.
3. Review the implemented report retention/dissent definitions and extend them
   with stance trajectories and draft-to-final recovery after codebook review.
4. Join the declared campaign roster to run summaries so unstarted runs remain in
   campaign denominators; version exclusions and retain reviewer decisions.
5. Add run-level comparisons and WP05 replay contrasts only after the estimands,
   case selection, repeat trials, and interpretation rules are registered.

G4 construct evidence, G5 measurement reliability, G6 complete scientific analysis
readiness, and G7 claim review are not passed by this milestone. No exclusions,
scientific-freeze decisions, ownership assignments, or review verdicts are made.

## Basis and scope decisions

Repository baseline: `b366c852e3fe304848b5c4480df27882e793dd25`.
The revised Phase 1A source precedence in `docs/phase1a/README.md` controls the
implementation. The WP01 interface handoff, WP03 workflow, ADR-008 outcome taxonomy,
and current runtime evidence contracts define the integration boundary.

The supplied Technical Architecture and Experimental Protocol v0.9, sections
12–15, and Phase 1A Technical Implementation Meeting, pages 5 and 10, support a
separate analysis plane, explicit missingness, run-level units, and pending human
annotation/calibration. These documents are reference material; they do not grant
permission to run a live campaign, assign contributors, or publish findings.
