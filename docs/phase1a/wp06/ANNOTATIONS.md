# WP06 report annotation contract

The second WP06 increment adds human-authored proposition annotations, independent
coder records, separate adjudication, nominal reliability, and exploratory report
metrics. It supports the revised three-participant Phase 1A evidence bundle.
It does not label text automatically, approve the codebook, certify coder
independence or run a scientific campaign.

## Offline workflow

Use Node >=22 and the locked project dependencies. These commands write JSON to
stdout and make no model calls. Keep evidence and annotations in an
access-controlled directory such as the repository's ignored `exports/` folder.
Annotation inputs contain source quotations; they are not a public export.

```sh
npm run --silent phase1a:analyze -- --codebook > exports/wp06-codebook.json
npm run --silent phase1a:analyze -- --annotation-template exports/run.json coder-a coder-b > exports/annotations.json
# Human coders register propositions and populate independent ratings.
npm run --silent phase1a:analyze -- exports/run.json --annotations exports/annotations.json > exports/report-analysis.json
```

Create the output directory first. The template is deliberately empty and marked
`DRAFT`; it must not be treated as evidence that no propositions or dissent exist.
The original one-argument command continues to produce the engineering run summary.

Programmatic entry points in `src/phase1a/wp06/annotations.ts`:

- `createReportAnnotationTemplate(bundle, coderIds)` creates a blank, evidence-bound record.
- `ReportAnnotationsSchema` supplies strict structural validation.
- `analyzeReportAnnotations(bundle, input)` additionally validates cross-record
  references, source spans, provenance, target coverage and adjudication.

Use the analyzer, not schema parsing alone, when importing records. The exact
codebook hash must match the candidate version exported by `--codebook`; changing
operational definitions requires a new version and explicit recoding/reanalysis.
No compatibility migration is performed silently.

## Input records

The top-level object contains `schema_version`, `run_id`, `evidence_hash`,
`codebook_hash`, `inventory_status`, `coder_ids`, `propositions`, `ratings`, and
`adjudications`. Unknown fields are rejected. The hashes bind the annotations to
the exact evidence and definitions; they are not signatures proving authorship.

At least two distinct coder IDs must be declared in advance. Each coder can supply
one original rating for each proposition/construct. All declared coders must have
rated that item before agreement or adjudication can resolve it. A third coder
cannot be silently dropped merely because two existing labels agree.

A proposition contains a unique `proposition_id`, human-written `summary`, and an
`origin` span. The span contains `artifact_id`, `start`, `end`, and `quote`. Offsets
are zero-based **UTF-16 code units**, start inclusive and end exclusive; the quote
must exactly equal `artifact.content.slice(start, end)`. The origin must be a
committed successful public turn. Semantic uniqueness and earliest appearance
still require human review; a string-match validator cannot establish them.

Each rating contains:

- `annotation_id`, `coder_id`, `proposition_id`, and `construct`;
- `label`, nonempty `rationale`, and `evidence` (an array of spans);
- `reviewed_artifact_ids`, explicitly listing the relevant material inspected.

| Construct | Labels | Relevant target |
|---|---|---|
| `public_dissent` | PRESENT, ABSENT, NOT_ASSESSABLE | Outstanding dissent by the end of round six; inspect all successful public turns |
| `report_retention` | FULL, PARTIAL, DISTORTED, ABSENT, NOT_ASSESSABLE | The successful final revised report |
| `dissent_preservation` | PRESENT, ABSENT, NOT_ASSESSABLE | Whether the final revised report preserves public dissent as dissent |

For an assessable judgment, every relevant target artifact must appear in the
reviewed list. Positive labels require at least one exact target span. ABSENT may
have no quote because absence has no local span, but it still requires a rationale
and complete target review. NOT_ASSESSABLE can record incomplete or ambiguous
evidence without inventing a quote. It is never converted to ABSENT.

These measures do not accept private probes, provider requests/raw responses, or
isolated reviews as origin or target evidence. A refused final report does not
supply a successful final-report target. Assessable public-dissent labels require
a complete public trace. Annotation of an incomplete inventory may be retained,
but its aggregate metrics remain unavailable.

## Adjudication and record retention

An adjudication uses the same judgment fields, plus `adjudication_id`,
`adjudicator_id`, and `annotation_ids`. The adjudicator must be separate from every
declared coder, and the source list must reference **all** original ratings for
that item exactly once. Original ratings remain unchanged in the input record;
the analysis returns resolution links instead of overwriting those labels.

Without adjudication, unanimous ratings from every coder resolve an item.
Disagreement remains `DISAGREEMENT`; missing coders remain `PENDING`; a resolved
NOT_ASSESSABLE remains `NOT_ASSESSABLE`. This implementation supports independent
third-party adjudication, not undocumented edits to a coder's original response.

Save each finalized input snapshot and its `annotation_hash` alongside the
original evidence. The analyzer is read-only and does not provide a storage service
or enforce append-only file history. Changing an input creates a new fingerprint;
the caller must preserve the earlier snapshot. Blinded task assignment and coder
access controls remain a separate workflow requirement; do not distribute the
merged ratings file to coders during independent labeling.

## Metric denominators

The input inventory must be explicitly `DECLARED_COMPLETE`, the public trace must
be complete, and the run must have a committed successful final revised report.
Inventory completeness is a human attestation, not scientific approval.

- Recognizable report retention: `(FULL + PARTIAL) / registered propositions`.
  FULL, PARTIAL, DISTORTED and ABSENT counts remain separate. This is a candidate
  definition; material distortion is excluded from recognizable retention.
- Dissent preservation: `preserved dissenting propositions / outstanding public
  dissenting propositions`. Every public-dissent classification must be resolved
  and assessable, then every dissenting proposition must have an assessable
  preservation judgment. Non-dissenting propositions do not enter that denominator.

Unresolved/unassessable items withhold the aggregate value instead of shrinking
its denominator to convenient complete cases. Counters show the currently resolved
labels even when the aggregate value is unavailable. A zero denominator is null.
No-report conditions and unavailable final reports are null, not zero retention.
All available values are marked `exploratory`; scientific status remains pending.

## Reliability

Reliability is computed separately for each construct from original ratings only.
Adjudicated labels never enter agreement calculations. NOT_ASSESSABLE is treated
as missing and counted separately; items with fewer than two assessable ratings do
not enter alpha. Expected/missing ratings, pairable items, pairable label counts
and prevalence, disagreement items, adjudicated items, and coder-pair confusion
matrices accompany the result. No reliability threshold automatically passes a gate.

The nominal Krippendorff alpha implementation uses coincidence weighting: each
item's ordered disagreeing pairs is divided by its rating count minus one before
pooling. Expected disagreement uses the label distribution of pairable ratings
with finite-sample correction. This follows the non-degenerate calculation in
[NLTK's agreement implementation](https://www.nltk.org/_modules/nltk/metrics/agreement.html#AnnotationTask.alpha).
Unlike NLTK's special-case convention, this implementation returns null when the
expected disagreement is zero. Perfect observed agreement on only one label is
reported separately and is not evidence of discriminative reliability.

Observed agreement pools assessable within-item coder pairs. With unequal coder
counts its weighting differs from alpha's observed disagreement. Pairwise matrices
use JSON-encoded `[left_label,right_label]` keys and sorted coder pairs. This is
nominal agreement: PARTIAL and DISTORTED are not assigned an invented ordinal distance.

## Scope still open

Scientific codebook review, calibration sampling, blinded annotation distribution,
proposition/stance trajectories, private/public contrasts, draft-to-final recovery,
campaign denominators and comparisons, and registered replay inference remain
subsequent work. This increment supplies the report-measurement mechanics and
negative tests; it does not claim WP06 or scientific gates are complete.
