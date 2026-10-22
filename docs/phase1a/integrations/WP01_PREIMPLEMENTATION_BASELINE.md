# Integration WP01-BASELINE — preimplementation record

**Status:** `HISTORICAL BASELINE RECORD — DO NOT USE AS CLEAN-BRANCH EVIDENCE`

The implementation started from branch `docs/phase1-pr9-independent-review`,
HEAD `4f20c23660d9e508c4d6724aedd7f1cb7a2c52ec`, with upstream
`origin/codex/phase1a-canonical-closure`. The only pre-existing working-tree
item was the untracked user file
`docs/phase1/AGORA_PHASE1_PR9_INDEPENDENT_REVIEW.md`; it was preserved.

The earlier WP01 work was isolated on `codex/wp01-study-contract`. No Phase 0 or
historical Phase 1 source file was modified, and no provider call or GPU access
was attempted.

## Historical broader-worktree results

- `npm test -- --reporter=dot`: 45 files, **466 tests passed**;
- `npx tsc --noEmit -p tsconfig.json`: pass;
- `git diff --check`: pass.

The corresponding earlier postimplementation result was **485 tests passed**.
The 466/485 pair belongs to the broader historical worktree and is preserved
for provenance only. It must not be substituted for the clean replacement
branch's 439 baseline or 458 isolated postintegration result.

## Clean replacement branch evidence

For `codex/wp01-study-contract-clean` against `origin/master`:

- clean baseline: 41 files, **439 tests**;
- isolated WP01 postintegration snapshot before the D13 follow-up: 42 files,
  **458 tests**;
- D13/t0 follow-up after four new focused tests: 42 files, **462/462 tests**.

The current follow-up result is the latest implementation evidence; 439/458
remain the canonical clean-scope baseline pair requested for comparison.
