# WP01 test boundary

Vitest currently includes `tests/**/*.test.ts` at repository level. WP01 tests
are kept there so the production TypeScript build continues to emit only
runtime modules. This directory records the intended logical ownership of the
tests without adding a second test runner.
