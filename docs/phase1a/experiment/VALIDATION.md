# Pilot deployment and implementation validation — 12 November 2026

**The three dedicated models and collection tooling are prepared. Only Mateo's approval of the final plan remains in the collection gate. No scientific workshop has run.**

| Check | Observed result |
| --- | --- |
| TypeScript build | Pass |
| Automated TypeScript suite | 755 tests, 54 files, 0 failures |
| Gateway Python suite | 6 tests, 0 failures |
| Production dependency audit | 0 vulnerabilities reported |
| Complete synthetic CLI/SQLite campaign | 12 workshops, 330 calls |
| Separate-process resume | Same 12 run IDs and 330 calls, no repeated completed call |
| Encrypted backup and retrieval | Remote SHA-256 matches; decrypted files byte-identical |
| Fresh-process restored evidence verification | 12 bundles, 330 calls |
| Unapproved launcher | Rejected before credentials, output creation or model calls |
| Prepared plan readiness | Exactly one blocker: missing/stale scientific approval |

## Real deployment canaries

Installed in the dedicated NVIDIA project with Ollama 0.40.16, authenticated loopback gateway and private SSH tunnel. All models use Q4_K_M weights, 32768 context tokens, thinking disabled, temperature 0.7, top-p 1, top-k 0, repetition penalty 1, and a 1024-token output limit. Exact artifact digests and binary/source checksums are in [deployment.json](deployment/deployment.json).

| Model | Short response | Long-context input tokens | Initial marker recalled | Long-call elapsed |
| --- | --- | --- | --- | --- |
| Gemma 3 27B IT | Pass | 24,053 | Pass | 21.0 s including one recorded resource-busy retry |
| Qwen3 32B | Pass | 24,057 | Pass | 35.7 s |
| Llama 3.1 8B Instruct | Pass | 24,049 | Pass | 11.3 s |

The [canary record](deployment/canary.json) includes requests' benign response text, usage, identities, effective parameters, revision/configuration pins and timings. The long prompt is a technical marker-recall probe, not a realistic workshop or a scientific performance measurement. The over-capacity Gemma prompt returned HTTP 400, with no silent truncation. Unauthenticated access returned HTTP 403. Final health was clear. After testing, the dedicated backend had no loaded models, GPU 0 used 0 MiB, and its lease was free.

An earlier engineering attempt was interrupted by the Brev multiplexed tunnel, and another encountered a transient resource-busy response. Their local records are retained under `artifacts/phase1a-deployment-20261112/`. The final non-multiplexed session completed all six successful checks and the explicit overflow/authentication checks; its one 429 retry is retained in the published evidence. It is not represented as seven successes. Canary calls are excluded from the 12-workshop campaign.

The server starter was also run successfully against the deployed services, verifying binary/gateway hashes, engine version, GPU UUID and authenticated configuration health. It allocated no GPU. This does not claim boot-time service supervision or permanent availability on the shared cluster.

## Evidence and scientific boundary

The [machine-readable summary](validation-summary.json) records the reviewed plan/source/manifest hashes and every final rehearsal evidence/analysis file digest. Full mock archives remain operator-local under `artifacts/phase1a-rehearsal-20261112-deployed-final/`. The [initial restored rehearsal proof](deployment/restore.json) is checksum-pinned by the plan. A [second backup/restore](deployment/rehearsal-restore.json) covers the final deployed-plan rehearsal, including its exact plan bytes. No raw private scientific data exists in these engineering fixtures.

Tests cover the explicit Qwen variant while preserving historical Gemini compatibility, four-cell admission, stale approvals, exact endpoint/model/configuration/revision pinning, fail-stop transport, credential separation, t0 integrity, complete roster, durable resume, missingness, and the collection-only gate. The optional gate requires genuine checksum-matching successful technical evidence and still blocks without Mateo. Legacy plans retain the earlier human attestations.

Simon authorized submitting two changes to Mateo on 12 November: calibrating two independent human coders after collection but before scoring, and accepting automated restoration verification in place of a second operator's pre-launch human attestation. **Neither calibration nor an independent human attestation is claimed complete.** Mateo must accept these changes, model choices, exact prompts, reviewer-context limitation, analysis plan and data policy in his approval of the final hash. Any requested substantive or implementation change invalidates that hash.

No scientific approval was fabricated, no message was sent to Mateo, and the PR remains draft and unmerged. See [OPERATIONS.md](OPERATIONS.md) for the concrete preflight, launch and recovery commands.
