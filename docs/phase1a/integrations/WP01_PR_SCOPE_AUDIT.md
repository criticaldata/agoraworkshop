# WP01 Pull Request Scope Audit

**Date:** 2026-10-21
**Status:** `IMPLEMENTATION_READY — SCIENTIFIC_FREEZE_PENDING`
**Purpose:** isolate the existing Phase 1A WP01 implementation from the broader PR #11 history before review and merge.

## 1. Comparison basis

The audit compares the exact remote PR tree with the current integration base:

| Item | Value |
|---|---|
| Repository | `criticaldata/agoraworkshop` |
| Base branch | `master` |
| Base commit | `7f0cd4d2d3bc972b5244294c98faacc87e3a46cb` |
| PR reviewed | #11 |
| PR head commit | `90f92a020c3197a62a37ba66e087cb37809eb578` |
| PR state | Open, not merged |
| GitHub file count | 80 |
| GitHub additions/deletions | 10,956 / 6,955 |
| Replacement branch base | `origin/master` at `7f0cd4d2d3bc972b5244294c98faacc87e3a46cb` |

PR #11 is intentionally left open and unchanged. It is retained as the comparison artifact, not as the replacement delivery vehicle.

## 2. Why the remote line counts are misleading

The local Git reconstruction of the same logical work, using the committed WP01 branch and `git diff --ignore-space-at-eol`, reports 80 paths with 4,032 additions and 31 deletions. The file set is unchanged when end-of-line whitespace is ignored.

Therefore:

- there is no separate local file whose only semantic change is an end-of-line conversion;
- the much larger GitHub PR line count includes line-ending/serialization noise in the API-created PR tree, especially in inherited historical files;
- the scope decision is based on path ownership and semantic diffs, not the inflated remote line totals.

## 3. Classification of the 80 files in PR #11

### 3.1 WP01 implementation — 36 paths

These are the paths introduced by the WP01 implementation and its explicit test/fixture integration:

**Documentation (15):**

- `docs/phase1a/README.md`
- `docs/phase1a/integrations/README.md`
- `docs/phase1a/integrations/WP01_PHASE0_COMPATIBILITY.md`
- `docs/phase1a/integrations/WP01_PREIMPLEMENTATION_BASELINE.md`
- `docs/phase1a/integrations/WP01_PROVIDER_CANARY_READINESS.md`
- `docs/phase1a/integrations/WP01_README_INTEGRATION_PROPOSAL.md`
- `docs/phase1a/integrations/WP01_WP02_WP06_HANDOFF.md`
- `docs/phase1a/wp01/01_STUDY_CONTRACT.md`
- `docs/phase1a/wp01/02_DECISION_REGISTER.md`
- `docs/phase1a/wp01/03_PROMPT_REGISTRY.md`
- `docs/phase1a/wp01/04_CAMPAIGN_MANIFEST.md`
- `docs/phase1a/wp01/05_INTERFACE_CONTRACTS.md`
- `docs/phase1a/wp01/06_ACCEPTANCE_TESTS.md`
- `docs/phase1a/wp01/07_PROTOCOL_TO_CODE_MAPPING.md`
- `docs/phase1a/wp01/README.md`

**Implementation and scaffolds (19):**

- `src/phase1a/wp01/__tests__/README.md`
- `src/phase1a/wp01/conditions/matrix.ts`
- `src/phase1a/wp01/contracts/decisions.ts`
- `src/phase1a/wp01/contracts/interfaces.ts`
- `src/phase1a/wp01/contracts/study.ts`
- `src/phase1a/wp01/deployments/bindings.ts`
- `src/phase1a/wp01/fixtures/faults.ts`
- `src/phase1a/wp01/fixtures/generate.ts`
- `src/phase1a/wp01/fixtures/synthetic.ts`
- `src/phase1a/wp01/index.ts`
- `src/phase1a/wp01/manifests/campaign.ts`
- `src/phase1a/wp01/prompts/registry.ts`
- `src/phase1a/wp01/scheduling/agenda.ts`
- `src/phase1a/wp01/validation/validate.ts`
- `src/phase1a/wp02/README.md`
- `src/phase1a/wp03/README.md`
- `src/phase1a/wp04/README.md`
- `src/phase1a/wp05/README.md`
- `src/phase1a/wp06/README.md`

**Test (1):** `tests/phase1aWp01.test.ts`.

**Essential integration (1):** `package.json`, adding only the reproducible `phase1a:fixtures` script. It does not change dependencies or historical runtime behavior.

### 3.2 Inherited previous work — 44 paths

These paths were already part of the historical Phase 1 development chain before the WP01 commit. They are not copied into the clean replacement branch.

**Phase 1 documentation:**

- `docs/phase1/BEHAVIORAL_PROTOCOL.md`
- `docs/phase1/CANONICAL_PROTOCOL.md`
- `docs/phase1/IMPLEMENTATION_SPEC.md`
- `docs/phase1/REVIEW.md`
- `docs/phase1/SCIENTIFIC_ANALYSIS.md`

**Core and acceptance infrastructure:**

- `src/acceptance/phase01.ts`
- `src/config/schema.ts`
- `src/db/schema.ts`
- `src/events/types.ts`
- `src/export/exporter.ts`
- `src/orchestrator/runner.ts`
- `src/orchestrator/stateMachine.ts`

**Historical Phase 1 modules:**

- `src/phase1/analysis.ts`
- `src/phase1/artifactReview.ts`
- `src/phase1/behavioralAnalysis.ts`
- `src/phase1/campaign.ts`
- `src/phase1/canonicalContract.ts`
- `src/phase1/cli.ts`
- `src/phase1/closure.ts`
- `src/phase1/collective.ts`
- `src/phase1/contracts.ts`
- `src/phase1/evaluationContract.ts`
- `src/phase1/export.ts`
- `src/phase1/mixedModel.ts`
- `src/phase1/positions.ts`
- `src/phase1/preview.ts`
- `src/phase1/scienceContract.ts`
- `src/phase1/scienceProvenance.ts`
- `src/phase1/scienceStore.ts`
- `src/phase1/scientificAnalysis.ts`
- `src/phase1/scientificDataset.ts`
- `src/phase1/statistics.ts`

**Other historical integrations and tests:**

- `src/prompts/registry.ts`
- `src/providers/scriptedModerator.ts`
- `src/providers/types.ts`
- `src/semantic/phase1Annotations.ts`
- `src/server/docs.ts`
- `src/server/pages.ts`
- `src/server/phase1.ts`
- `tests/phase1Canonical.test.ts`
- `tests/phase1Science.test.ts`
- `tests/phase1ScienceUi.test.ts`
- `tests/phase1Statistics.test.ts`
- `tests/phase1Ui.test.ts`

These files are explained as inherited rather than discarded: they remain available in their original branches and in PR #11, but are outside the authorized WP01 replacement scope.

### 3.3 Line-ending classification

No standalone line-ending-only path is included in the clean branch. The remote PR's inflated additions/deletions are treated as representation noise layered over the inherited historical changes. The replacement branch is reconstructed from the current `origin/master` tree and receives normalized committed WP01 content only.

## 4. Replacement-branch inventory

The clean branch contains 37 changed paths after adding this audit record:

| Group | Count | Scope decision |
|---|---:|---|
| `docs/phase1a/**` | 16 | WP01 documentation, handoff records, and this scope audit |
| `src/phase1a/**` | 19 | WP01 contracts, fixtures, manifests, prompts, and WP scaffolds |
| `tests/phase1aWp01.test.ts` | 1 | WP01 contract and negative tests |
| `package.json` | 1 | Required `phase1a:fixtures` command only |
| **Total** | **37** | **No historical Phase 0/Phase 1 code** |

The implementation portion is 36 paths; the 37th path is this audit document required to make the scope decision reviewable.

## 5. Explicit outside-namespace explanation

The only path outside `docs/phase1a/**`, `src/phase1a/**`, and the WP01 test path is:

| Path | Why it is included | Why it is minimal |
|---|---|---|
| `package.json` | Exposes `npm run phase1a:fixtures`, the documented deterministic fixture-generation command used by manifest validation. | One script entry only; no dependency, compiler, provider, Phase 0, or historical Phase 1 changes. |

No root README, `src/config`, `src/db`, `src/events`, `src/orchestrator`, `src/acceptance`, `src/export`, `src/phase1`, `src/providers`, `src/prompts`, `src/semantic`, `src/server`, or historical test file is changed by the replacement branch.

## 6. Preservation gates

The replacement branch is acceptable only if all of the following remain true:

1. The changed-path allowlist contains only the 37 paths listed above.
2. `git diff --exit-code origin/master...HEAD` is clean for all historical Phase 0 and Phase 1 paths.
3. The WP01 focused suite passes, including the D13 Option A, t0-isolation,
   D17-retirement and prompt-hash negative tests.
4. The full repository suite and TypeScript/build checks pass.
5. Both synthetic 12-run manifest fixtures validate with recomputed hashes.
6. No provider API, GPU, credential, or experimental call is made by WP01.

## 7. Review boundary

This replacement PR is a scoped delivery for architectural and scientific review. It does not merge PR #11, close PR #11, resolve scientific-freeze decisions, select a provider/model, or claim runtime integration with WP02–WP06.

The scientific lifecycle remains:

`IMPLEMENTATION_READY — SCIENTIFIC_FREEZE_PENDING`

## 8. Verification evidence on the clean branch

The isolated-scope record and the D13/t0 follow-up are reported separately so
the clean 439/458 comparison is not confused with the four new D13 tests.

| Check | Result |
|---|---|
| `origin/master` baseline full suite | 41 files, 439 tests passed |
| Isolated WP01 postintegration snapshot before D13 follow-up | 42 files, 458 tests passed |
| D13/t0 focused follow-up | 1 file, 23 tests passed |
| Full suite after D13 follow-up | 42 files, 462 tests passed |
| Phase 0 / historical Phase 1 regression subset | 5 files, 100 tests passed |
| TypeScript (`npx tsc --noEmit -p tsconfig.json`) | PASS |
| Build (`npm run build`) | PASS |
| Changed-path allowlist | 37 staged paths, 0 forbidden paths |
| `git diff --cached --check` | PASS |
| GitHub Actions `AGORA Phase 0 #34` tests/build/whitespace | PASS |
| GitHub Actions production dependency audit | FAIL — separate security-maintenance blocker (`proxy-addr` critical; `qs` moderate) |
| Synthetic manifest `after_t0_before_public` | Valid; 12 runs; `SELECTED_METHOD`; campaign hash `sha256:012db7156d2f60c8e358fa8d8d443c6cffe70108f1769741dda49468dcc7e63b` |
| Synthetic manifest `before_t0` | Valid; 12 runs; `HISTORICAL_NONCANONICAL`; campaign hash `sha256:f8a27ccc1b0d9db9c121f904f7f437fbbc4745dcc3f1b3572732fd74035fce4d` |
| Provider/GPU/credential calls | None |

The manifest validator recomputed the campaign, run, configuration, study-contract, decision-register, and prompt-registry relationships and returned `valid=true` with no issues for both synthetic candidates.

The earlier 466/485 results are historical broader-worktree evidence only; they
are not used to validate this clean replacement branch.
