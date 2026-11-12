# Phase 1A pilot for scientific review

The implementation combines the t0 integrity, audit remediation and WP06 analysis branches. It can rehearse all 12 workshops, preserve their evidence and resume at a completed operation boundary. **Scientific execution remains blocked until Mateo validates the exact protocol and the real deployments are documented.** This is a proposed pilot, not an approved study or an experimental result.

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

The [plan](proposal/plan.json) contains the topic, candidate registry, deployments, parameters, budgets, analysis rules and approval records. Model IDs, immutable revisions and deployment identifiers must be filled from actual infrastructure evidence. Qwen is explicitly named in the new `gemma-qwen-model-x-v1` composition variant; historical Gemini contracts retain their original meaning and remain valid. The new campaign has a distinct ID and requires its own scientific approval. The Gemini API is no longer a dependency of this proposal. Gemma and Model X still require exact bindings.

The selected Qwen candidate is **Qwen3 32B, Q4_K_M**, exposed in the cluster's cached model catalog as `qwen3:32b`. Its Ollama manifest digest is `sha256:030ee887880fc378860c2dd35101da424377520441ae4bfe7be6deff8ade7840`, verified on 12 November. The digest identifies the quantized artifact, not a new model version called Gemini. Cached availability does not constitute a dedicated AGORA deployment or a successful inference canary: `deployment_id` and the approved endpoint remain unset. Provision and test those before live execution, including full context capacity and Qwen thinking/output behavior. The existing shared services were inspected read-only.

Proposed generation parameters are temperature 0.7, top-p 1, and at most 1024 generated tokens per call. Calls are sequential, with a 120-second timeout and at most one retry. The per-workshop thresholds are 62 calls and 500,000 accounted tokens, checked before the next call. These are not a guaranteed monetary cap: the final call can exceed the token threshold. Unknown token usage or ambiguous network completion stops further network calls and requires reconciliation. HTTP 429 can receive the single recorded retry; 401/403 is terminal. No SDK retry, model fallback, streaming, tools or silent parameter removal is used.

Real endpoints must expose a chat-completions interface and return the configured model identifier and token usage. Use HTTPS, or loopback HTTP through a private tunnel; URLs containing credentials or query strings are rejected. Endpoint addresses and credential variable names are separate from secret values. Secrets belong in the process environment, never the plan, Git, prompts or evidence exports. Deployment revision is an infrastructure attestation; the chat API model name alone cannot verify the weights revision.

On the shared NVIDIA node, follow its GPU reservation file before allocating compute, pin the allocated GPU, keep project files in the project storage area and use a project environment. Verify that AGORA usage is within the grant's authorized scope. No node stop/delete, global package changes or shared data access is needed for this pilot.

## Analysis and missingness

WP06 validates each evidence bundle before computing coverage, outcomes, retries and known token totals. Its report codebook defines proposition retention and preservation of public dissent. Two independent human coders must calibrate on material outside the 12 scientific workshops. Original ratings remain alongside a separate adjudication record. A zero dissent denominator is undefined; incomplete or ambiguous evidence is not coded as absent behavior. Named coders and a calibration evidence reference are still required.

Keep all 12 rows in the campaign roster, including not-started, partial and failed workshops. Stop on the first failed workshop; do not replace it or keep trying until it succeeds. Any subsequent replacement or protocol change requires a new declared plan. Report results per workshop and per condition with missingness. Do not infer private beliefs, causal identity effects, or participant personality from outputs. Private checkpoint texts support a separately reviewed qualitative comparison; this version does not compute a validated numerical position-change score.

WP06 deliberately retains its `PENDING_SCIENTIFIC_APPROVAL` label. A plan approval record travels with the campaign archive; a software pass does not turn an annotation or an interpretation into scientific approval.

## Review and launch sequence

1. Review the proposed wording, reviewer-context limitation, topic, order, parameters, budgets and codebook with Mateo. Resolve D02 and D05–D16 in the plan; retain Simon's scope decision.
2. Verify the three endpoints with small engineering canaries. Record deployment/weights revisions, supported parameters, token accounting, GPU reservation and grant scope. Pin each endpoint URL in `expected_url`, then configure its environment variable to the same address. An unauthenticated loopback endpoint may use `credential_env: null` only when intentionally protected by the tunnel.
3. Name the coders; record their calibration. Name storage, backup and retention arrangements. `storage_location` is the absolute private output directory on the runner; the live command enforces it. Do not keep raw private probes in a public repository or publish them through the preview UI.
4. Seal the final plan, regenerate the preview and obtain explicit attestations from the scientific reviewer, infrastructure owner and a second operator who reconstructs the rehearsal. The infrastructure and reconstruction requirements implement the existing D02/D09/D16 decisions; they are not automatically satisfied by tests. Approval records are human attestations with evidence references, not cryptographic identity verification.
5. Run `check`, then `run`. Keep the plan, source/dependency versions, roster, SQLite ledger, exports, annotation files and approval evidence together in the approved private archive.

```sh
npm ci
npm run build
npm test

# Prepare a new editable proposal outside the checked-in review example.
npm run phase1a:experiment -- init artifacts/phase1a-review

# After editing the plan, seal campaign and plan hashes together.
npm run phase1a:experiment -- seal artifacts/phase1a-review/plan.json
npm run phase1a:experiment -- preview artifacts/phase1a-review/plan.json artifacts/phase1a-review

# Rehearsal is synthetic and requires no credentials or scientific approval.
npm run phase1a:experiment -- mock artifacts/phase1a-review/plan.json artifacts/phase1a-rehearsal

# Record genuine approvals of the final plan_hash, then check and execute.
npm run phase1a:experiment -- check artifacts/phase1a-review/plan.json
npm run phase1a:experiment -- run artifacts/phase1a-review/plan.json artifacts/phase1a-live
```

`check` exits 2 when decisions or access evidence are incomplete. `run` rejects an incomplete plan before looking up credentials or contacting a model. The plan hash covers the source/dependency hash as well as the protocol: source changes invalidate readiness. `seal` clears previous approvals. After collecting approvals, do not seal again unless intentionally requesting a new review.

Reusing the same output directory resumes saved workshops without reissuing completed calls. A failed workshop remains failed. A lock prevents two concurrent runners in that directory. After a process crash, verify that its PID is dead and archive the lock before removing it; never unlock an active process. If a request was in flight or a retry sequence was incomplete, continuation is blocked. Reconcile provider usage and preserve the interrupted record; do not erase it or edit the ledger to force a rerun. Different directories are separate executions, so the operator must maintain one designated live archive for the approved campaign.

Exports contain private probes and provider material. Directory access is restricted to the operator; this is filesystem access control, not encryption or a backup. Configure the approved backup before live collection.

## Implementation and validation

This branch integrates PRs #22, #23, #24 and #25, resolving their overlaps. It fixes retry-order verification, preserves stricter t0 boundary validation, aligns WP06 with permission-denied outcomes, and allows explicitly bound Model X deployments and a resolved report allocation at scientific freeze. It adds the review plan, a credential-separated provider transport, a durable campaign runner and a complete roster.

See [validation evidence](VALIDATION.md) for the exact checked build, test counts, rehearsal hashes and access status. The final scientific decision belongs to Mateo; no approval or message to him has been fabricated or sent.
