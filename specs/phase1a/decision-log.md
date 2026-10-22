# Phase 1A decision log

Status: **LIVE**

Do not resolve an open item implicitly in implementation. A decision is closed only when its rationale, approver, date, and affected specs are recorded.

| ID | Decision | Status | Owner | Needed before |
|---|---|---|---|---|
| `DEC-01` | Exact deployable identifiers for Gemma, Gemini, and Model X | OPEN | Study contract | first live-provider run |
| `DEC-02` | Token, time, cost, and retry limits | OPEN | Study + orchestration | first live-provider run |
| `DEC-03` | Speaking-order schedule across the three replications | OPEN | Study contract | pilot manifests |
| `DEC-04` | Topics and exact wording of round/checkpoint prompts | OPEN | Study contract | dry run with final prompts |
| `DEC-05` | Size and purpose of any “wild west” baseline outside the core 2×2 | OPEN | Research leads | analysis plan |
| `DEC-06` | Replay cases and tolerance rules | OPEN | Replay/testing | acceptance sign-off |
| `DEC-07` | Leads and reviewers for work packages 3, 4, and 6 | OPEN | Project leads | masterclass close |
| `DEC-08` | Dry-run and replication calendar | OPEN | Project leads | masterclass close |
| `DEC-09` | Timing of report-condition disclosure relative to `t0` | CLOSED | Simon / study design | Phase 1A implementation |

## Closed decisions

### DEC-09 — Report disclosure follows `t0`

Resolution: In report conditions B and D, collect and durably commit all three private `t0` responses before disclosing the frozen joint-report requirement. Disclose it once, with identical wording in B and D, before the first public discussion turn. Conditions A and C receive no disclosure.

Rationale and evidence: This keeps `t0` as a common pre-treatment baseline. `t1 − t0` can then capture the total effect of participating under the assigned condition, including anticipation of the report, while `t2 − t1` captures additional change associated with the report workflow.

Approved by: Simon, following the methodological review with Mateo.

Date: 2026-10-21.

Affected specs/tests: `README.md`, `experiment-contract.md` (`EXP-14`), `src/phase1a/index.ts`, and `tests/phase1aRuntime.test.ts`.

## Closed-decision format

```text
Decision: DEC-XX
Resolution:
Rationale and evidence:
Approved by:
Date:
Affected specs/tests:
```
