# WP05 — Replay and reconstruction

Status: `ENGINEERING_BASELINE_IMPLEMENTED_SCIENTIFIC_REVIEW_PENDING`.

WP05 consumes immutable campaign/run manifests and committed evidence through
`contextLockedReplay.ts`. It locks the exact parent request, builds the four cue
cells, requires human approval before provider calls, preserves abstention and
refusal as distinct outcomes, and exports linked retry/failure evidence. Trial
selection, cue interpretation and the normalized baseline representation still
require scientific approval before behavioral interpretation.
