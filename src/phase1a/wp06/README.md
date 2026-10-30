# WP06 — Analysis, codebook and scientific claims

Status: `DESCRIPTIVE_AND_ANNOTATION_BASELINE_IMPLEMENTED` / `PENDING_SCIENTIFIC_APPROVAL`.

`analyzeRun` in `index.ts` consumes a revised Phase 1A `EvidenceBundle`, verifies
its integrity and output linkage, and returns run-level opportunity accounting,
stage coverage, retry/failure counts, usage missingness and evidence provenance.
`cli.ts` exposes the same offline analysis through `npm run --silent phase1a:analyze`.

`annotations.ts` adds evidence-bound proposition records, independent ratings,
separate adjudication and exploratory report metrics. `codebook.ts` exports the
versioned candidate definitions; `reliability.ts` computes nominal agreement from
original ratings. Scientific codebook approval, blinded calibration, campaign
comparisons and scientific claims remain pending. See `docs/phase1a/wp06/README.md` and its acceptance map.
