# Context-locked cue replay and fault visibility (WP05)

Status: **approved engineering baseline for the mock milestone — 2026-10-20**

This specification merges the WP05 draft with the implemented Phase 1A evidence contract. Cue replay is a child experiment over one completed parent opportunity; it is not evidence replay and it is not a four-workshop rerun.

## Registered decisions for the mock milestone

- The parent is one explicitly selected provider call, including its exact attempt number. The stored request artifact is authoritative.
- The endorsement records `observed` or `synthetic` provenance. Its wording, the neutral hidden label, the trial count, the order seed and the retry policy are explicit plan inputs; the runtime supplies no scientific defaults.
- A human reviewer must confirm that the cue edits preserve the argument's meaning before provider calls can begin. Residual identity inside the argument is flagged and never rewritten.
- Retry eligibility, maximum attempts and delay are registered in the plan. Every attempt uses the parent's provider, model and decoding configuration.
- Successful and delivered-refusal traces require an output. Infrastructure failures require an attempt/failure record and must not invent a message or delivery.
- The results JSON is a derived view over the evidence bundle, never a parallel source of truth.

## Replay requirements

### RPL-01 — Repeat and Replay are distinct

Repeat SHALL create a new run from an identical frozen manifest and link the source run. Replay SHALL be available only for a valid completed run, SHALL expose a draft four-cell plan, and SHALL make no provider call until human confirmation.

### RPL-02 — Parent context is locked

Replay SHALL archive and verify the exact ordered source message IDs, prompt hashes, provider, model, decoding configuration, selected attempt and snapshot hash. Missing or inconsistent parent evidence SHALL stop execution before a provider call.

### RPL-03 — Only registered cues change

The runtime SHALL build R1 shown/shown, R2 hidden/shown, R3 shown/hidden and R4 hidden/hidden. Argument bytes and non-target messages SHALL remain identical. Every speaker-label or endorsement change SHALL carry character spans; any other change SHALL fail validation.

### RPL-04 — Trials are independent

Each trial SHALL start from the same cell projection of the frozen snapshot. Trial outputs SHALL never enter another trial's context. The plan SHALL record a seed and the replay set SHALL record the deterministic realized order.

### RPL-05 — Parent records are immutable

Replay records SHALL be children linked to the parent run, parent opportunity and snapshot. The stable parent evidence fingerprint SHALL be identical before and after replay.

### RPL-06 — Outcomes are archived and classified

Each trial SHALL archive exactly one final outcome. Delivered text SHALL be retained. Technical outcomes SHALL not invent output records, and permitted retries SHALL remain on the locked provider and model.

## Test requirements

### TST-01 — Behavioral and provider refusals are distinct

A model-written refusal SHALL be `delivered_refusal`, retain its text and remain behavioral data. A provider policy block SHALL be `provider_refusal`, carry no delivered output and count as infrastructure/missing observation.

### TST-02 — Private text never leaks

Replay planning SHALL accept only authorized public source messages for the mock milestone. The audit SHALL scan replay contexts for registered private markers and fail with evidence when one appears.

### TST-03 — Hidden identity remains testable

R2 and R4 SHALL replace registered speaker metadata with the explicit neutral label. Participant ID, display name and visible label SHALL be scanned. Identity already present in argument bytes SHALL trigger pending human review and SHALL not be rewritten.

### TST-04 — Injected faults are classified

Mock acceptance SHALL exercise timeout, malformed response, rate limit and provider refusal. Retry attempts SHALL be preserved and linked to their retry parent, and the final trial outcome SHALL equal the last resolved attempt.

### TST-05 — Trace requirements depend on outcome

Every trial SHALL link to its parent run, opportunity and snapshot and to all attempts. Success and delivered refusal SHALL also link to an archived output. Technical failures SHALL require no nonexistent message or delivery. A missing required link SHALL report the adjacent record IDs.

### TST-06 — Results are derived per round and workshop

The result view SHALL contain settings, six round entries, raw per-agent token usage, checks and supporting event/message/context/call identifiers, plus workshop gates. Missing usage SHALL be `unavailable`, never zero.

### TST-07 — Every acceptance rule has negative evidence

Every requirement from RPL-01 through RPL-06 and TST-01 through TST-06 SHALL have a deliberately damaged or invalid fixture that is rejected or produces FAIL before its passing fixture counts as proof.

## Deferred cross-provider decisions

The mock milestone does not decide the live provider panel, experimental outcome measure, final endorsement wording, production trial count or token-outlier threshold. Those values must be registered by their scientific owners before a paid cross-provider dry run.
