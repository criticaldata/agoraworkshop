# Phase 1A architecture decision records

Status: **ACTIVE ENGINEERING GOVERNANCE**  
Decision authority: Simon Heilles for the engineering baseline.  
Scientific status: **SCIENTIFIC_FREEZE_PENDING**.

This register records the architecture and governance decisions needed to turn
the WP01 study contract into an executable, reviewable system. It is written to
support both implementation and the methods section of the AGORA article.

An `ACCEPTED` ADR is binding for the engineering baseline. It does not by itself
approve a scientific prompt, model deployment, budget, outcome measure, or live
pilot. Those decisions still require the named scientific authority.

## Article-facing ADR format

Every record states:

1. the research or engineering claim it supports;
2. the decision and its owner;
3. alternatives considered;
4. consequences and risks;
5. implementation and acceptance evidence;
6. the trigger that would require the team to revisit it.

This keeps the article's method claims traceable to code and evidence without
presenting an implementation choice as a scientific result.

## Current decisions

| ADR | Decision | Status | Engineering owner | Scientific authority |
|---|---|---|---|---|
| [ADR-001](ADR-001-work-package-ownership.md) | Work-package ownership and decision rights | ACCEPTED | Simon | Named scientific owners per package |
| [ADR-002](ADR-002-canonical-wp-integration.md) | WP01 is the canonical contract; live execution requires a versioned adapter | ACCEPTED | Simon / WP02 | Mateo / WP01 plus freeze authority |
| [ADR-003](ADR-003-t0-and-report-disclosure.md) | `t0` precedes report disclosure; A/C receive no condition notice | ACCEPTED | Simon / WP02-WP03 | Simon, following review with Mateo |
| [ADR-004](ADR-004-run-admission-and-provider-parity.md) | Admit only frozen manifests with exact provider/configuration parity | ACCEPTED, IMPLEMENTATION PENDING | Simon / WP02 | Study and infrastructure owners |
| [ADR-005](ADR-005-evidence-durability-and-integrity.md) | Durable append-only evidence and complete call-metadata integrity | ACCEPTED, IMPLEMENTATION PENDING | Simon / WP04 | Independent evidence reviewer |
| [ADR-006](ADR-006-report-role-allocation.md) | Counterbalance report roles across the three replications | ACCEPTED, SCIENTIFIC REVIEW REQUIRED | Simon / WP03 | Study owner |
| [ADR-007](ADR-007-context-locked-replay-baseline.md) | WP05 derives every cell from the exact parent request bytes | ACCEPTED, SCIENTIFIC REVIEW REQUIRED | Simon / WP05 engineering | WP05 scientific owner to accept |
| [ADR-008](ADR-008-outcome-and-failure-taxonomy.md) | Abstention, refusal, timeout and provider failure remain distinct | ACCEPTED | Simon / WP02-WP05 | WP06 measurement owner |
| [ADR-009](ADR-009-validation-and-release-evidence.md) | A release requires executed validation, structured CI evidence and human review | ACCEPTED, IMPLEMENTATION PENDING | Simon | Release reviewer |

## Ownership rule

Code authorship does not transfer scientific ownership. Until a named package
owner accepts a handoff, Simon remains accountable for the engineering code he
shipped, while unresolved scientific choices stay visibly pending.

## Relationship to other decision records

- `specs/phase1a/decision-log.md` tracks protocol decisions and freeze blockers.
- `docs/phase1a/wp01/02_DECISION_REGISTER.md` records WP01 study decisions.
- These ADRs govern architecture, package boundaries, and release evidence.

When the records disagree, the frozen scientific contract governs experimental
meaning; the ADR must then be superseded rather than silently reinterpreted.
