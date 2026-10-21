# WP02 — Core orchestration and model-provider integration

Status: `AWAITING_INTEGRATION`.

WP02 will consume the validated study, campaign and run manifests exported by
`src/phase1a/wp01/index.ts`. It owns core orchestration, stage execution,
opportunity lifecycle, model-provider adapter selection/invocation, provenance,
and retry behavior. No WP02 runtime is implemented in this WP01 change.

WP03 is the separate owner of the workshop and report workflow semantics; WP02
executes that workflow through the provider-neutral stages and bindings supplied
by WP01.
