# WP04 — Context, visibility and evidence

Status: `ENGINEERING_BASELINE_IMPLEMENTED_ACCESS_REVIEW_PENDING`.

WP04 consumes source-message links, context snapshot references and visibility
rules from the WP01 execution contracts. The runtime enforces private/public and
reviewer isolation, binds provider metadata to request/raw artifacts, and can append
atomic snapshots to `Phase1aSqliteStore`. Abrupt-process restart tests prove that
committed calls resume without repetition. Bundle verification also binds the frozen
manifest to `run.created`, validates run identity across events, artifacts and calls,
checks the deterministic operation/completion links, and verifies retry chains.
Durable snapshot state, call and token counters are independently recomputed from the
bundle before append and restore. Deployment-specific access-control review and
retention policy remain required before live data collection.
