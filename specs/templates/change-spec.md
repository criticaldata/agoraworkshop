# Change spec: <short outcome>

Status: `DRAFT | REVIEW | APPROVED | IMPLEMENTED`

Owner: `<name>`  
Reviewers: `<names>`  
Target: `<branch / pull request>`

## Problem and evidence

What concrete workflow, failure, or study requirement are we addressing? Link the smallest useful evidence.

## Intended outcome

One observable outcome. Avoid implementation language unless the implementation itself is constrained.

## Non-goals

- What this change deliberately does not solve.

## Requirements

- `AREA-01` — Given `<context>`, when `<action>`, then `<observable result>`.
- `AREA-02` — The system must preserve `<invariant>`.

## Interfaces and data

Inputs, outputs, event fields, provider calls, and compatibility constraints.

## Acceptance examples

| ID | Scenario | Expected evidence |
|---|---|---|
| `AREA-A1` | Happy path | trace, assertion, or artifact |
| `AREA-A2` | Boundary/failure path | trace, assertion, or artifact |

## Requirement-to-test coverage

| Requirement | Test | What the assertion proves | Status |
|---|---|---|---|
| `AREA-01` | `<test name>` | `<observable behavior>` | `RED | GREEN` |

Before implementation, read each test's setup, action, assertions, and failure message. A passing test counts only when its assertions prove the intended requirement.

## Risks and open decisions

- `OPEN`: question, owner, deadline.

## Traceability

- Code:
- Tests:
- Evidence:
- Decision log:
