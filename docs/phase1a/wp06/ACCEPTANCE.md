# WP06 engineering acceptance mapping

This mapping covers the descriptive and report-annotation WP06 increments. It does not modify the existing
80-requirement runtime/replay matrix or certify scientific gates.

| ID | Test in `tests/phase1aWp06.test.ts` | Observable evidence |
|---|---|---|
| ANA-01 | derives planned coverage for condition | A–D counts, checkpoint aliases, absent report stages, run unit and fixture provenance |
| ANA-02 | retains timeout attempts; derives the final attempt from event order | Retry preserved, no inflation of successful opportunity denominator; export array order does not change results |
| ANA-03 | keeps abstention and delivered refusal separate | Distinct raw counts and explicit rate denominator |
| ANA-04 | preserves failed and unattempted opportunities; retains interrupted and never-started run denominators; reports an in-flight retry as pending | Partial runs retain every planned opportunity, pending attempts stay distinct from terminal failures, and unavailable rates stay null |
| ANA-05 | reports missing usage explicitly | Missing versus known zero usage; private and raw text not emitted |
| ANA-06 | rejects tampering; rejects wrong commit linkage and duplicate committed opportunities | Fresh integrity verification and semantic linkage failures |
| ANA-07 | derives reproducible results | Exact source references, deterministic fingerprint and no source mutation |
| ANA-08 | runs the offline CLI | Valid JSON output and nonzero failure without partial output |
| ANA-16 | analyzes a WP01-admitted condition | A–D integration through the WP02 adapter preserves campaign/run hashes, engineering admission, participant slots and invocation counts |

Linked tests alone are not a passing test result. Run the named suites against
the proposed implementation before accepting it.


## Annotation and reliability tests

All tests below are in `tests/phase1aWp06Annotations.test.ts`.

| ID | Test coverage | Observable evidence |
|---|---|---|
| ANA-09 | Source-linked report measures | Known retention and dissent ratios; no mutation or private text in summaries |
| ANA-10 | Missing ratings, inventory and unassessable labels | All declared coders required; zero/unknown denominators remain null |
| ANA-11 | Independent adjudication | Every original rating referenced; reliability unchanged by adjudication |
| ANA-12 | Invalid records and scope | Reject wrong hashes, mismatched quotes, private material, invalid labels and incomplete review |
| ANA-13 | Ineligible report/public traces | No-report conditions, refusals and partial public traces do not produce a report metric |
| ANA-14 | Offline CLI modes | Blank template, candidate codebook and annotated JSON analysis; nonzero invalid-input exit |
| ANA-15 | Nominal reliability | Hand-calculated alpha, unequal coder counts, missing/singleton exclusions, undefined and negative cases |
