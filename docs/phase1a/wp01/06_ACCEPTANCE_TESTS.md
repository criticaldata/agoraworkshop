# WP01.06 — Acceptance tests

## Executed offline tests

The focused test file is `tests/phase1aWp01.test.ts`. The WP01 consistency
baseline had 19 executed test cases, including the two negative assertions for
retired decision IDs and prompt-hash mutation. This Option A update adds four
focused cases for selected timing, t0 prompt isolation, noncanonical fixture
status and manifest timing consistency. The focused suite therefore contains
23 executed test cases:

| Area | Assertions |
|---|---:|
| Study contract and invalid boundaries | 3 |
| Report timing and deterministic agenda | 4 |
| Decision register D01–D16 plus D17 consolidation trace | 2 |
| Deployment binding separation and freeze rejection | 1 |
| Prompt registry, hashes, leakage and t0 isolation | 5 |
| Synthetic campaign, selected/historical timing, tamper rejection and linkage | 7 |
| Provider-adapter and tool-fault boundary fixtures | 1 |
| WP02–WP06 scaffolding boundary | 1 |
| **Total** | **23** |

The tests do not call a model provider. They check planning, schema, hashes,
negative paths, and privacy contracts.

Final verification on this checkout:

- focused WP01: 23/23 passed;
- full repository: 42 files, 462/462 tests passed;
- Phase 0 / historical Phase 1 regression subset: 5 files, 100/100 passed;
- `npx tsc --noEmit -p tsconfig.json`: PASS;
- `npm run build`: PASS;
- `git diff --check`: PASS;
- synthetic fixture validation: both 12-run manifests `valid = true`.

Dependency audit is a separate repository concern and is not clean on this
checkout: `npm audit --omit=dev --audit-level=high` reports one critical
`proxy-addr` advisory and one moderate `qs` advisory in the existing runtime
dependency tree; the full audit also reports existing development-tool
advisories. WP01 did not upgrade dependencies or hide this result because that
would be outside the study-contract scope.

## Required commands

```text
npx vitest run tests/phase1aWp01.test.ts --reporter=dot
npx tsc --noEmit -p tsconfig.json
npm test -- --reporter=dot
npm run build
git diff --check
npm run phase1a:fixtures
```

## Executed versus runtime integration coverage

The 23 focused tests are executed offline in this checkout. They cover the
WP01 contract, Simon's selected timing, schemas, planning counts, candidate
prompts, t0 isolation, hashes, negative boundaries, canonical and historical
synthetic manifests, source linkage, provider-neutral descriptors, fault
fixtures and ownership scaffolds. They do not call a model provider or execute
a workshop.

The following tests are intentionally not claimed as executed because their
runtime owners are not implemented in WP01:

| Runtime dependency | Required integration evidence | Owner | Status |
|---|---|---|---|
| Core orchestration and model-provider integration | Run lifecycle, adapter invocation, retries, provenance and fault classification against approved deployments | WP02 | AWAITING_INTEGRATION |
| Workshop and report workflow | Six-round execution, `t0(P1,P2,P3) -> report notice (B/D only) -> public round 1`, `t6`/`tR`, report draft/reviews/revision; A/C receive no condition notice | WP03 | See consolidated integration audit for executed mock coverage and remaining live dependencies |
| Context, visibility and evidence persistence | Runtime public/private isolation, context assembly, source-message links and persisted evidence | WP04 | AWAITING_INTEGRATION |
| Replay and reconstruction | Replay from immutable manifests, event reconstruction and hash parity | WP05 | AWAITING_INTEGRATION |
| Analysis and scientific claims | Approved codebook, calibration, report analysis and claim gating | WP06 | AWAITING_INTEGRATION / PENDING_SCIENTIFIC_APPROVAL |

These are integration requirements, not hidden failures and not false passes.
They must be added to the corresponding work-package acceptance suites when
those implementations exist.

## Acceptance boundary

Passing WP01 tests proves that the contract is internally consistent and that
mechanically testable boundaries fail closed. It confirms the selected
methodological timing in the contract, but does not prove model behavior,
provider equivalence, semantic prompt neutrality, runtime integration, or a
scientific protocol freeze.

The four offline fault fixtures cover timeout, unavailable, invalid response and
permission denied at the contract boundary. They deliberately mark
`provider_call_executed = false` and `AWAITING_INTEGRATION`; they are not a
second tool gateway and cannot be reported as runtime fault evidence.
