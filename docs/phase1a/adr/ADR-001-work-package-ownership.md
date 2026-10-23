# ADR-001: Work-package ownership and decision rights

Status: **ACCEPTED**  
Date: 2026-10-22  
Engineering decision owner: Simon Heilles

## Article claim supported

AGORA separates study design, execution, context/evidence, replay, and analysis
so that a software contributor cannot silently redefine the experiment.

## Context

The October scope named Mateo for WP01 and Simon for WP02. Leads for WP03,
WP04, and WP06 were not confirmed. Raúl requested WP05 and a programming buddy,
but that preference was never recorded as an accepted ownership handoff. Simon
subsequently shipped the runtime and the first WP05 mock implementation.

## Decision

| Package | Accountable engineering owner now | Scientific decision right | Handoff state |
|---|---|---|---|
| WP01 study contract | Mateo | Mateo plus designated freeze authority; Simon reviews integration | Accepted ownership |
| WP02 orchestration/providers | Simon | Study owner approves deployments and limits | Accepted ownership |
| WP03 workshop/report | Simon, provisionally, for shipped code | Study owner approves prompts, role allocation and report semantics | Scientific owner unassigned |
| WP04 context/evidence | Simon, provisionally, for shipped code | Independent evidence/privacy reviewer approves live gate | Reviewer unassigned |
| WP05 replay/testing | Simon for the existing engineering baseline | Scientific owner must approve sampling, cues and outcomes | Offer handoff to Raúl; acceptance required |
| WP06 metrics/validation | Unassigned | Scientific measurement owner | Owner required before claims |

No person becomes accountable merely because this ADR names them as a proposed
recipient. Raúl becomes WP05 scientific owner only after explicitly accepting
the handoff. Until then Simon owns maintenance of the code he shipped.

## Alternatives considered

- Treat code authorship as ownership. Rejected because it confuses engineering
  implementation with scientific authority.
- Leave every unassigned package owner blank. Rejected because shipped code
  would then have no accountable maintainer.
- Assign collaborators without consent. Rejected because a project document
  cannot create an obligation on their behalf.

## Consequences

- WP03, WP04, and WP05 code now have an accountable engineering maintainer.
- Scientific choices remain blocked until the relevant owner/reviewer accepts.
- WP06 must receive a named owner before the project makes behavioral claims.

## Evidence and acceptance

- The repository scope names Mateo/WP01 and Simon/WP02.
- PR #12 is scoped to WP01 contracts and fixtures.
- PR #13 contains the runtime and WP05 engineering baseline.
- Acceptance requires explicit recorded handoffs for WP03-WP06.

## Revisit trigger

Supersede this ADR when the project records accepted named owners and reviewers
for WP03-WP06.
