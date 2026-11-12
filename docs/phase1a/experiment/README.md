# Phase 1A pilot for scientific review

The implementation combines the t0 integrity, audit remediation and WP06 analysis branches. It can rehearse all 12 workshops, preserve their evidence and resume at a completed operation boundary. **Scientific execution remains blocked until Mateo approves the exact final plan, including the explicit collection/analysis gate amendment.** This is a proposed pilot, not an approved study or an experimental result.

Simon confirmed the core-only scope and requested Mateo's scientific review on 11 November 2026. On 12 November he selected Qwen; this proposed amendment replaces Gemini in C/D, keeps A/B homogeneous Gemma, and retains the 12-workshop design. InterSystems, Wild West, Grok and additional identity-cue replay experiments are outside this campaign.

## Design for Mateo to approve

| Condition | Composition | Joint report | Repetitions | Calls per workshop without retries |
| --- | --- | --- | --- | --- |
| A | Gemma, Gemma, Gemma | No | 3 | 24 |
| B | Gemma, Gemma, Gemma | Yes | 3 | 31 |
| C | Gemma, Qwen, Model X | No | 3 | 24 |
| D | Gemma, Qwen, Model X | Yes | 3 | 31 |

The 12 workshops contain 216 public opportunities, 90 private checkpoints and 24 report operations: **330 planned model calls**. The workshop is the independent unit. Three repetitions per cell support an exploratory descriptive pilot; turns and propositions are not independent experimental replicates. Composition comparisons concern these particular model assignments, not model diversity in general.

The proposed execution order is A1, B1, C1, D1, A2, B2, C2, D2, A3, B3, C3, D3. It is deterministic and not randomized. P1, P2 and P3 speak in that order in each of six rounds. Rounds 1–2 examine human limitations, 3–4 proposed changes, and 5–6 the role and limits of AI agents. All three t0 responses precede any report disclosure. B/D receive the report notice just before round one; A/C receive no report notice or negative reminder. All arms have private t0 and post-round-six checkpoints. Only B/D have a post-report checkpoint.

For B/D, the writer rotates P1, P2, P3 over repetitions. Each other participant independently reviews the same draft, then the writer revises it. Both reviewers receive identical system and user instructions. The current review context contains the draft only, not the original public transcript; review therefore cannot independently verify omitted public material. Mateo must explicitly accept that limitation or request a context-contract change before freeze. Revision sees the draft and both reviews. Private responses are excluded throughout the public/report branch.

## Proposed wording changes

`pilot-candidate-2` and `wp01-runtime-adapter-v2` make the intended prompt delivery explicit:

- Shared participant, neutral agent, procedural opening and abstention instructions reach every model call.
- The six public prompts now express the 2/2/2 topic sequence; it was previously only metadata.
- Both report reviews use the same wording and neutral reviewer instruction.
- Public participants are instructed to participate, rather than receiving the old system label describing a workshop host.
- The unused `no-report-condition` candidate remains in the historical registry but is not delivered. This avoids an additional negative cue in A/C.

The historical candidate registry and archived manifests remain readable. The [rendered preview](proposal/prompt-preview.json) exposes the exact system/user prompts for all 330 opportunities. It is an engineering preview with synthetic model identities, not a live result. Context is serialized in chronological public-artifact order; provider requests retain internal artifact references, while the transport sends message roles and text. No new model-identity labels are inserted into model-visible text.

## Operational proposal

The [plan](proposal/plan.json) binds the topic, candidate registry, deployments, parameters, budgets, analysis rules and approval records. The dedicated NVIDIA deployment uses **Gemma 3 27B Q4_K_M**, **Qwen3 32B Q4_K_M**, and **Llama 3.1 8B Instruct Q4_K_M** as Model X. Exact aliases, manifest digests, engine and gateway hashes are in [deployment.json](deployment/deployment.json). The final choice of Model X and the Qwen amendment require Mateo's scientific approval.

Ollama 0.40.16 and its model files are isolated under `/data/PROJECTS/simon/agora-pilot`. The service binds loopback only. An authenticated gateway and private SSH tunnel expose one endpoint for the three models; neither public ingress nor a paid cloud API is required. Requests verify model-manifest identity, disable thinking, reject context overflow, and return a pinned deployment digest checked by the runner. Context capacity is 32768 tokens; `top_k=0`, `repeat_penalty=1`, `truncate=false`, `shift=false`. Each call reserves GPU 0 atomically only when both its lease and actual memory usage are free, then unloads and releases it. Existing shared services and other teams' reservations are not modified.

Proposed generation parameters are temperature 0.7, top-p 1, and at most 1024 generated tokens per call. Calls are sequential, with a 120-second timeout and at most one retry. The per-workshop thresholds are 62 calls and 500,000 accounted tokens, checked before the next call. These are not a guaranteed monetary cap: the final call can exceed the token threshold. Unknown token usage or ambiguous network completion stops further network calls and requires reconciliation. HTTP 429 can receive the single recorded retry; 401/403 is terminal. No SDK retry, model fallback, streaming, tools or silent parameter removal is used.

Real endpoints must expose a chat-completions interface and return the configured model identifier and token usage. Use HTTPS, or loopback HTTP through a private tunnel; URLs containing credentials or query strings are rejected. Endpoint addresses and credential variable names are separate from secret values. Secrets belong in the process environment, never the plan, Git, prompts or evidence exports. The dedicated gateway checks the installed manifest digest before each request and returns it with its configuration digest. The client rejects missing or changed digests. These are operational checks within a shared host, not independent hardware attestation.

On the shared NVIDIA node, follow its GPU reservation file before allocating compute, pin the allocated GPU, keep project files in the project storage area and use a project environment. Verify that AGORA usage is within the grant's authorized scope. No node stop/delete, global package changes or shared data access is needed for this pilot.

## Analysis and missingness

WP06 validates each evidence bundle before computing coverage, outcomes, retries and known token totals. Its report codebook defines proposition retention and preservation of public dissent. Two independent human coders must calibrate on material outside the 12 scientific workshops. Original ratings remain alongside a separate adjudication record. A zero dissent denominator is undefined; incomplete or ambiguous evidence is not coded as absent behavior. Coders are not yet confirmed and calibration has not happened. Simon authorized submission of a change on 12 November: Mateo may approve collection first, with naming and calibration mandatory before any human scoring. Only automated integrity, coverage and token accounting are allowed in the meantime. The scientific review must explicitly cover this timing change.

Keep all 12 rows in the campaign roster, including not-started, partial and failed workshops. Stop on the first failed workshop; do not replace it or keep trying until it succeeds. Any subsequent replacement or protocol change requires a new declared plan. Report results per workshop and per condition with missingness. Do not infer private beliefs, causal identity effects, or participant personality from outputs. Private checkpoint texts support a separately reviewed qualitative comparison; this version does not compute a validated numerical position-change score.

WP06 deliberately retains its `PENDING_SCIENTIFIC_APPROVAL` label. A plan approval record travels with the campaign archive; a software pass does not turn an annotation or an interpretation into scientific approval.

## Review and launch sequence

1. Mateo reviews the exact models, prompts, reviewer-context limitation, deterministic order, budgets, codebook, data policy and collection/analysis amendment. D16 now proposes accepting the attached automated restore verification instead of a second human operator's pre-launch attestation. Simon authorized submitting this proposal; neither Simon's request nor the test pass constitutes Mateo's approval.
2. Record Mateo's genuine approval of the final `plan_hash`, with timestamp and evidence reference, as the sole `scientific` approval record. Do not seal after adding it: sealing invalidates approvals. If Mateo requests changes, regenerate the proposal and seek approval of the new hash.
3. Run the operator launcher preflight, then launch only when the approval has been received. The live archive is fixed by `data_policy.storage_location`. The launcher loads credentials from the operator's private configuration and checks the deployment before any scientific call.

```sh
npm ci
npm run build
npm test
npm run test:deployment

# No approval is generated by either command.
python3 src/phase1a/deployment/launch.py docs/phase1a/experiment/proposal/plan.json
# After genuine Mateo approval only:
python3 src/phase1a/deployment/launch.py docs/phase1a/experiment/proposal/plan.json --run
```

`check` rejects an unapproved plan before credential reads, output creation or model calls. Legacy plans still require the earlier human calibration/infrastructure/reconstruction attestations. The new optional `collection_gate` requires checksum-pinned successful model canaries and encrypted-restore evidence, plus Mateo's approval of this exact policy. It does not manufacture human approvals. Source/dependency or substantive plan changes invalidate the approval; model configuration or revision drift stops collection.

See [OPERATIONS.md](OPERATIONS.md) for service restart, tunnel, backup and failure handling. No experiment, annotation, message to Mateo or approval has been generated by preparation.

Reusing the same output directory resumes saved workshops without reissuing completed calls. A failed workshop remains failed. A lock prevents two concurrent runners in that directory. After a process crash, verify that its PID is dead and archive the lock before removing it; never unlock an active process. If a request was in flight or a retry sequence was incomplete, continuation is blocked. Reconcile provider usage and preserve the interrupted record; do not erase it or edit the ledger to force a rerun. Different directories are separate executions, so the operator must maintain one designated live archive for the approved campaign.

Exports contain private probes and provider material. Directory access is restricted to the operator; this is filesystem access control, not encryption or a backup. The launcher encrypts a stopped archive with age, uploads only ciphertext to NVIDIA, retrieves it, compares every restored file and verifies each evidence bundle in a fresh process. The rehearsal restore is attached. This protects archived data; live data since the last successful backup remains on the Mac. The private decryption identity stays on the Mac and must be preserved for recovery.

## Implementation and validation

This branch integrates PRs #22, #23, #24 and #25, resolving their overlaps. It fixes retry-order verification, preserves stricter t0 boundary validation, aligns WP06 with permission-denied outcomes, and allows explicitly bound Model X deployments and a resolved report allocation at scientific freeze. It adds the review plan, a credential-separated provider transport, a durable campaign runner and a complete roster.

See [validation evidence](VALIDATION.md) for the exact checked build, test counts, rehearsal hashes and access status. The final scientific decision belongs to Mateo; no approval or message to him has been fabricated or sent.
