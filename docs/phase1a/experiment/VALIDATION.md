# Pilot implementation validation on 12 November 2026

**Engineering rehearsal passes. Scientific execution remains pending.**

| Check | Observed result |
| --- | --- |
| TypeScript build | Pass |
| Full automated suite | 753 tests, 54 files, 0 failures |
| Production dependency audit | 0 vulnerabilities reported by npm audit |
| Patch whitespace | Pass |
| Complete synthetic campaign through CLI and SQLite | 12/12 workshops complete, 330/330 planned calls |
| Restart in a separate process | Same 12 run IDs and same 330 calls; completed calls not repeated |
| Unapproved-plan CLI check | Exit 2 with explicit blockers |
| Unapproved live launch | Rejected before credential lookup, output-directory creation or model calls |

The [machine-readable summary](validation-summary.json) records the reviewed plan hash, source/dependency hash, manifest hash and SHA-256 digests of every rehearsal evidence/analysis export. Full synthetic archives are operator-local under `artifacts/phase1a-rehearsal-20261112-qwen/`; raw archives are not included in Git. The example plan and rendered prompts are in [proposal](proposal/plan.json).

New tests additionally verify the explicit Qwen variant, rejection of undeclared or mixed Gemini/Qwen compositions, and historical Gemini compatibility. Tests cover positive admission of all four conditions with test-only approval fixtures, stale approval rejection, model drift, duplicate roster entries, missing/unsafe endpoints, response model identity, missing token accounting, explicit refusal, credential separation, complete durable execution, restart and a terminal t0 failure retaining the other 11 planned rows. Existing audit, runtime, isolation, tamper detection, WP06 analysis and UI tests remain in the full suite.

## Infrastructure status

NVIDIA Brev login succeeded in Safari and the CLI using the authorized existing account. SSH access succeeded after refreshing the local Brev configuration, despite a stale SHELL NOT READY indication during maintenance. GPU reservation state, device usage and local model catalogs were read without launching inference. Simon subsequently selected Qwen, removing the Gemini dependency from the proposed variant. The catalog confirms Qwen3 32B Q4_K_M and its pinned manifest digest. The Gemma/Qwen/Model X deployment set remains incomplete: Qwen needs a dedicated verified endpoint, and Gemma/Model X still need exact deployments. Existing specialized or other-project services were not substituted. No live model canary or scientific workshop was run.

The remaining readiness items are exact model/deployment/revision bindings and pinned endpoint URLs; storage, backup and retention choices; two named coders and their calibration evidence; infrastructure and second-operator reconstruction attestations; and Mateo's scientific approval of the final plan hash. These are listed by `phase1a:experiment check` and cannot be replaced with test results.
