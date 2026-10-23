# Integration WP01-WP02..WP06 — handoff

**Status:** `ENGINEERING_BASELINE_INTEGRATED — SCIENTIFIC_FREEZE_PENDING`

WP01 supplies validated study, decision, prompt, deployment, agenda, manifest,
and source-link contracts through `src/phase1a/wp01/index.ts`. WP02 consumes
them through `wp01-runtime-adapter-v1`; WP03 supplies the deterministic workflow;
WP04 persists and verifies evidence; WP05 consumes committed evidence for replay.
WP06 remains an explicit analysis handoff.

| Consumer | Immediate input | Integration requirement |
|---|---|---|
| WP02 | study/campaign/run manifests, `RunStage[]`, and deployment bindings | implemented engineering adapter and runtime; scientific admission stays closed until every freeze blocker is resolved |
| WP03 | `RunStage[]`, agenda, report policy, candidate prompt references and decision status | own the workshop and report workflow; implement `t0(P1,P2,P3) -> report/no-report notice -> public round 1`, then six rounds, `t6` and report-arm `tR`, without provider routing |
| WP04 | scope and `SourceMessageLink` | implemented isolation, append-only SQLite snapshots, restart and metadata-integrity checks; live access review pending |
| WP05 | hashes, manifests, provenance | implemented context-locked replay from committed evidence; scientific replay plan approval pending |
| WP06 | analysis units, probes, reports, decisions | keep codebook and claims separate from WP01 mechanics |

The handoff asserts an offline engineering baseline only. It does not assert live
provider qualification, scientific freeze, a completed pilot or behavioral findings.
