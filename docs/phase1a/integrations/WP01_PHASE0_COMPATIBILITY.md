# Integration WP01-P0 — Phase 0 compatibility

**Status:** `TESTED_WITH_MOCKS` for the new contracts; historical Phase 0
behavior remains preserved by regression testing.

## Boundary

WP01 reuses `src/config/hash.ts` for canonicalization and SHA-256 identity. It
does not edit `src/config/`, `src/orchestrator/`, `src/providers/`,
`src/events/`, `src/db/`, `src/acceptance/` or `src/export/`. The historical
role-based Phase 1 modules under `src/phase1/` remain untouched and are not
reinterpreted as the October pilot.

New fields live under `src/phase1a/` and use new schema/namespace identifiers.
No legacy `phase1a-v1` prompt or Phase 0 configuration hash is replaced.

## Verification

The clean `origin/master` baseline was 41 test files and **439 passing tests**.
The isolated WP01 integration snapshot before the Simon D13 follow-up was
verified at 42 test files and **458 passing tests**. Those are the baseline and
postintegration counts for the clean replacement scope.

The D13/t0 follow-up adds four focused contract tests. Its fresh local result is
42 test files and **462/462 passing tests**, with the Phase 0/historical Phase 1
regression subset at 5 files and 100/100 tests. TypeScript, `npm run build`,
and `git diff --check` pass locally. This current follow-up result is reported
separately so it does not overwrite the verified 439/458 isolated-branch
record.

The earlier **466-test baseline and 485-test postimplementation result** came
from a broader historical worktree and are retained only as labeled historical
evidence in `WP01_PREIMPLEMENTATION_BASELINE.md`; they are not compatibility
evidence for the clean WP01 branch.

## Separate security-maintenance blocker

GitHub Actions run `AGORA Phase 0 #34` for the current PR merge ref passed
`npm test` (42 files, 462 tests), `npm run build`, and `git diff --check`. The
separate production dependency audit failed and must remain visible:

- `proxy-addr` — critical, IP-spoofing advisory `GHSA-jqcg-44mw-7w3h`;
- `qs` — moderate, array-limit / `isBuffer` advisories
  `GHSA-x5fp-wj9c-mxmx` and `GHSA-4mjr-xmp4-gh2g`.

This is a repository security-maintenance blocker, not a WP01 contract failure.
This PR does not disable the audit or introduce unrelated dependency upgrades.
It must be handled in a separate security-maintenance change.

## Limitations

Compatibility of the new manifests with WP02–WP06 runtime is not claimed until
those work packages consume the public index. No live provider evidence is part
of WP01.
