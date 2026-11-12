# WP05 — Replay and reconstruction

Status: `ENGINEERING_BASELINE_IMPLEMENTED_SCIENTIFIC_REVIEW_PENDING`.

WP05 consumes immutable campaign/run manifests and committed evidence through
`contextLockedReplay.ts`. It locks the exact parent request, builds the four cue
cells, records a SHA-256 fingerprint of the complete confirmed plan at human
approval, and refuses every provider call if any execution input changes after
approval. A changed plan must be reviewed again. It also preserves abstention and
refusal as distinct outcomes and exports linked retry/failure evidence. A
parent-equivalent cell keeps the exact archived target bytes, malformed provider
envelopes become retained `malformed_response` attempts, trace audit rejects empty,
missing, cross-trial and inconsistent attempt chains, and round completion is based
on each participant's final resolved outcome rather than the raw attempt count. Trial
selection, cue interpretation and the normalized baseline representation still
require scientific approval before behavioral interpretation.
