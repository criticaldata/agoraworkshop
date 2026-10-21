# Integration WP01-WP02..WP06 — handoff

**Status:** `AWAITING_INTEGRATION`

WP01 supplies validated study, decision, prompt, deployment, agenda, manifest,
and source-link contracts through `src/phase1a/wp01/index.ts`. The five
consumer directories contain README scaffolds only; no duplicate runtime or
dummy database was added.

| Consumer | Immediate input | Integration requirement |
|---|---|---|
| WP02 | study/campaign/run manifests, `RunStage[]`, and deployment bindings | own core orchestration and model-provider integration; preserve run/opportunity IDs, deterministic host stages, retries and provenance |
| WP03 | `RunStage[]`, agenda, report policy, candidate prompt references and decision status | own the workshop and report workflow; preserve six-round, checkpoint and report-stage semantics without provider routing |
| WP04 | scope and `SourceMessageLink` | independently enforce private/public isolation |
| WP05 | hashes, manifests, provenance | replay only declared inputs and preserve reconstruction evidence |
| WP06 | analysis units, probes, reports, decisions | keep codebook and claims separate from WP01 mechanics |

The handoff does not assert that any consumer runtime exists or that an
integration test has passed.
