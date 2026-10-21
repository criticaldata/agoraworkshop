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

The preimplementation baseline on this checkout was 45 test files and 466
passing tests, with `npx tsc --noEmit -p tsconfig.json` passing. The final
implementation verification is complete: the focused WP01 suite passed 19/19,
the full repository passed 46 files and 485/485 tests, `npm run build` passed,
and `git diff --check` passed. Reviewers can distinguish this regression
evidence from the 466-test baseline.

## Limitations

Compatibility of the new manifests with WP02–WP06 runtime is not claimed until
those work packages consume the public index. No live provider evidence is part
of WP01.
