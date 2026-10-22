# WP01 — Study Contract and Experimental Specification

## Status

`IMPLEMENTATION_READY — SCIENTIFIC_FREEZE_PENDING`

WP01 is the only Phase 1A work package implemented in this change. It defines
the declarative input boundary for core orchestration and model-provider
integration (WP02), the workshop and report workflow (WP03), context and
visibility, replay, and analysis. It does not execute a workshop or choose a
real deployment.

## Public API

Other work packages should import from:

```text
src/phase1a/wp01/index.ts
```

The public API exports study and decision-register schemas, provider-neutral
deployment bindings, deterministic run agendas, candidate prompts, campaign/run
manifests, source-message linkage, and validation functions.

## Non-goals

WP01 does not implement WP02 orchestration/provider integration, WP03 workshop
or report workflow, WP04 context storage, WP05 replay, or WP06 behavioral
analysis. It does not select Model X, exact Gemma/Gemini versions, provider
endpoints, credentials, or operational budgets.
