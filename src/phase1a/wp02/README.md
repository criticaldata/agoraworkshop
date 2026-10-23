# WP02 — Core orchestration and model-provider integration

Status: `ENGINEERING_BASELINE_IMPLEMENTED_SCIENTIFIC_FREEZE_PENDING`.

WP02 consumes the validated study, campaign and run manifests exported by
`src/phase1a/wp01/index.ts` through `wp01-runtime-adapter-v1`. It owns core orchestration, stage execution,
opportunity lifecycle, model-provider adapter selection/invocation, provenance,
and retry behavior. Engineering admission accepts explicitly labelled synthetic
campaigns. Scientific admission rejects every non-frozen campaign, unresolved
freeze decision, unresolved allocation, unsupported parameter or invalid binding
before the first provider call.

WP03 is the separate owner of the workshop and report workflow semantics; WP02
executes that workflow through the provider-neutral stages and bindings supplied
by WP01. Exact live deployments, cost/duration/concurrency ceilings and scientific
authorization remain freeze inputs, not implicit runtime defaults.

Every provider result crosses a fail-closed WP02 response boundary before an
operation can be committed. A delivered outcome (`success`, `abstained`, or
`refused`) requires non-empty archived text plus a valid provider envelope.
Malformed results are recorded as `invalid_response`, follow the explicit retry
limit with every failed attempt preserved, do not
create checkpoint artifacts, and cannot unlock report disclosure or public
discussion. This is especially important for `t0`: a scheduled collection
opportunity is never treated as a collected baseline response.
