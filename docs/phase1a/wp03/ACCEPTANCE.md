# WP03 acceptance record

Date: 2026-10-22  
Scope: provider-neutral workshop and report workflow engineering baseline

## Requirement coverage

| Requirement | Executed evidence |
|---|---|
| `RPT-01` | Draft context contains the complete public history and excludes private probes; no-report arms omit the branch. |
| `RPT-02` | Runtime regression proves the committed draft remains immutable. |
| `RPT-03`–`RPT-04` | Both reviewers receive exactly one common draft and never the peer review. |
| `RPT-05`–`RPT-06` | Revision fails closed until one draft and two terminal reviews exist, then consumes them in fixed order. |
| `RPT-07` | Runtime records prompts, exact context hashes, provider attempts, outcomes, artifact hashes, and role allocation separately. |
| `RPT-08` | `t2`/`TR` follows the committed revision and is absent in no-report arms. |
| `RPT-09` | Refusal creates a terminal behavioral artifact; technical failure follows WP02 retry/failure handling. |
| `RPT-10` | Replications 1–3 rotate the writer P1→P2→P3 and preserve the selected allocation as evidence. |

## Executed validation

- focused WP03 plus runtime and traceability: 3 files, 37 tests passed;
- full repository: 46 files, 519 tests passed;
- TypeScript production build: passed;
- patch whitespace check: passed.

## Acceptance boundary

This evidence accepts the deterministic engineering workflow. It does not approve
candidate prompt wording, provider deployments, D08 as a frozen scientific choice,
or any behavioral claim. A live pilot remains blocked on the corresponding WP01
scientific decisions and WP04 durable-evidence gate.
