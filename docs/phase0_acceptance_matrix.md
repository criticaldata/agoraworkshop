# AGORA Phase 0 / Phase 0.1 acceptance matrix

This is the repository's canonical acceptance matrix for the apparatus gate. It
operationalizes the protocol's minimum pilot requirements without claiming that the
protocol draft itself contained a complete Table 4. The matrix is versioned with the
code and every run reports the exact commit and configuration hash used.

`PASS` means the condition was exercised and met. `FAIL` means it was exercised and
violated. `NOT_EXERCISED` means there is no evidence to judge the condition; it is not a
pass and cannot close the phase.

## Core Phase 0 metrics

| ID | Gate | Metric | Acceptance condition | Primary implementation |
| --- | --- | --- | --- | --- |
| M1 | 1 | Response opportunity coverage | Every scheduled opportunity has a terminal outcome | `src/acceptance/metrics.ts` |
| M2 | 1 | Event sequence integrity | Event sequence is contiguous and free of sequence errors | `src/acceptance/metrics.ts` |
| M3 | 1 | Public routing integrity | Public deliveries match the independently derived recipient set | `src/acceptance/metrics.ts` |
| M4 | 1 | Private-channel isolation | Unauthorized private exposures = 0 | `src/acceptance/metrics.ts` |
| M5 | 1 | State-machine integrity | Illegal state transitions = 0 | `src/acceptance/metrics.ts` |
| M6 | 1 | Bounded execution | No run exceeds its declared termination/budget bounds | `src/acceptance/metrics.ts` |
| M7 | 1 | Persistence integrity | Required run objects and relationships persist | `src/acceptance/metrics.ts` |
| M8 | 1 | Export integrity | All required bundle files are present and hashed | `src/acceptance/metrics.ts`, `src/export/bundleContract.ts` |
| M9 | 2 | Failure classification coverage | Declared infrastructure failure categories are recorded | `src/acceptance/metrics.ts` |
| M10 | 2 | Behavioural/infrastructure separation | Infrastructure failures are not counted as behavioural availability | `src/acceptance/metrics.ts` |
| M11 | 2 | Retry traceability | Every retry joins to its parent opportunity/attempt | `src/acceptance/metrics.ts` |
| M12 | 2 | Controlled failure validation | Injected failures are classified correctly and recovery follows policy | `src/acceptance/metrics.ts` |
| M13 | 3 | Immutable configuration snapshot | Required experimental fields are present in the frozen snapshot | `src/acceptance/metrics.ts` |
| M14 | 3 | Deterministic configuration fingerprint | Same config gives the same hash; a changed condition changes the hash | `src/acceptance/metrics.ts` |
| M15 | 3 | Code/deployment provenance | Provenance is recorded or explicitly unavailable | `src/acceptance/metrics.ts` |
| M16 | 3 | Invocation provenance completeness | Every invocation carries provider, model, prompt, context, policy and outcome provenance | `src/acceptance/metrics.ts` |
| M17 | 3 | Context integrity | Stored context references resolve to persisted messages with correct channel provenance | `src/acceptance/metrics.ts` |
| M18 | 3 | Repeated-run evidence | At least two completed runs share the exact config hash | `src/acceptance/metrics.ts` |
| M19 | 1 | Authorized-context equality | Stored context equals the independently derived authorized visible set | `src/acceptance/metrics.ts` |
| M20 | 2 | Retry action idempotency | Duplicate actions per opportunity = 0 | `src/acceptance/metrics.ts` |
| M21 | 1 | Delivery uniqueness | Duplicate message-recipient deliveries = 0 | `src/acceptance/metrics.ts` |
| M22 | 2 | Budget accounting under retry | Each attempt is charged exactly once | `src/acceptance/metrics.ts` |

## Phase 0.1 robustness metrics

| ID | Metric | Dedicated evidence | Acceptance condition |
| --- | --- | --- | --- |
| M23 | Context material equality | Context-contract run | Rendered context, authorized raw IDs, summary IDs and hashes agree with independent recomputation |
| M24 | Summary scope and provenance | Summary run | Source IDs, chronological order, content/source hashes and visibility scope verify; no private-to-public leak |
| M25 | End-to-end trace completeness | All Phase 0.1 runs | Opportunities, retries, invocations, messages, deliveries, tools, semantic analyses and manifest entries join to the correct trace |
| M26 | Tool-gateway attribution | Tool-fault matrix | Timeout, unavailable, invalid response and permission denial are classified, scoped and retried as configured |
| M27 | Recovery idempotency | Four-point restart matrix | Resume leaves no unresolved opportunity, duplicate final message, duplicate delivery or duplicate terminal transition |
| M28 | Backup/restore integrity | Restore verification | Required tables, contiguous event sequence, config hash, regenerated artifact hashes and replay are valid after restore |
| M29 | Moderator boundary integrity | Scripted moderator plus live comparison | Moderator privacy, fixed-script provenance, message registration and state boundaries are verifiable |
| M30 | Live-adapter canary | Linked provider package | Baseline, exact-config rerun, fault run, complete exports and core Gates 1–3 all pass under the declared live provider |

## Closure rule

Phase 0 closes only when the core gates pass on their named evidence set. Phase 0.1
mock closure additionally requires M23–M29 to be `PASS`. Operational live closure
requires M30 `PASS`; a provider preflight or a single live run is insufficient. The
mock control, NVIDIA VLLM canary and any later Bedrock confirmation are separate
conditions and must never be pooled into one result.
