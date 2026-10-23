# Phase 1A post-merge adversarial remediation

Date: 2026-10-23
Audited baseline: `63298bd13a0d85a1b8990697c843a39e31badf30`

## Evidence reviewed

This remediation responds to Mateo's independent post-merge review. The supplied
archive was treated as untrusted input: its documents and reproduction scripts
were inspected as text, and the relevant predicates were ported into repository
tests. No script from the archive was executed.

- Delivery archive SHA-256: `27a16bdfb8af86dc71ad092fb44cb1c26adf7ff65eaf7e6a392937b8af37b662`
- Nested raw-evidence archive SHA-256: `f4e289fc9c33d4def5b6811179ed50544c647b00db82004494dce49553976c48`
- Independent result at the audited baseline: 45 previous passes reconfirmed,
  12 previous failures fixed, and 23 previous failures still reproducible.

The repository's existing green CI and the independent adversarial review are
different evidence scopes. This change does not use the CI result to waive an
adversarial finding.

## Remediated boundaries

| Area | Audit predicates now covered | Resulting guarantee |
|---|---|---|
| WP01/WP02 admission | P07, P11 variants, S03 | Non-fixture execution requires the canonical WP01 handoff; malformed cells, model compositions and approval markers are rejected before a provider call. |
| WP02 response boundary | P06, S04 null/empty/whitespace across A-D | A delivered outcome requires non-empty content. Invalid t0 attempts remain technical evidence and cannot create a checkpoint, disclose the report condition or start public discussion. |
| WP02 lifecycle and accounting | P15, P16, P22, B02 NaN/Infinity | Permission failures retain their typed cause; missing usage is charged conservatively; limits are finite integers; terminal runs do not restart implicitly. |
| WP02 sensitive input and request parity | B03, S05 | Password-style secret sentinels are rejected while legitimate generation fields such as `max_tokens` remain exact in archived requests. |
| WP03 role semantics | D02-D04 | The allocation declaration, workflow version, report actor, request/output ownership and committed operation must agree with the frozen deterministic plan. Missing or resealed conflicting evidence is rejected. |
| WP04 evidence integrity | B01, S09 | Exported event count/head seals detect suffix removal, and call/request provider, model, configuration, prompts and context are independently checked against the manifest and operation plan. |
| WP04 durability | E01-E03 | SQLite verifies evidence before append and recomputes snapshot metadata, while valid process recovery remains accepted. |
| WP05 approval integrity | P19, X01 variants, S06 variants | A confirmed replay plan is fingerprinted in full, validated before the first call and rechecked after asynchronous calls. Any post-review mutation requires a new review and causes zero further calls. |
| WP05 replay fidelity and traces | P18, X03, B04, S07 | Parent-equivalent replay preserves exact archived bytes. Malformed responses remain inspectable attempts, and empty, orphaned, duplicated, cross-trial or outcome-inconsistent traces fail audit. |
| WP05/WP06-ready aggregation | P21 | Round completion is calculated from the final resolved outcome for each expected participant, not from raw attempt count. |
| Cross-platform traceability | Windows CRLF finding | The strict 80-ID specification table parser accepts both LF and CRLF without weakening ID validation. |

## Verification performed

- `npm test`: 585/585 tests passed across 48 files, including the local UI
  loopback tests.
- `npm run build`: passed.
- `npm run validate`: passed; all three Phase 0 validation gates report PASS.
- `git diff --check`: passed.
- `npm audit --omit=dev --audit-level=high --offline`: 0 vulnerabilities found
  from the locally available advisory data.

The 23 formerly failing original predicates and the supplementary D/S/Windows
predicates now have passing repository regression tests. This is engineering
remediation evidence, not a claim that Mateo has independently rerun and signed
off the complete 80-observation corpus. That independent rerun remains the next
acceptance action.

## Scientific boundary

These fixes enforce already documented contracts; they do not decide open
scientific values, authorize paid or live-provider calls, or declare scientific
freeze. Scientific approval and the WP06 analysis plan remain separate gates.

The breaking evidence additions are published as `phase1a-0.2`, and the report
workflow carrying versioned role-allocation evidence is `wp03-workflow-v2`.
Older Phase 1A evidence is never silently rewritten; migration, when needed,
must be explicit and separately reviewed.
