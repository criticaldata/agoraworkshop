# ADR-001: Work-package ownership and decision rights

Status: **ACCEPTED**  
Date: 2026-10-22  
Engineering decision owner: Simon Heilles

## Article claim supported

AGORA separates study design, execution, context/evidence, replay, and analysis
so that a software contributor cannot silently redefine the experiment.

## Context

The 13 October technical meeting assigned WP01 and WP02 jointly to Mateo and
Simon, WP03 to Tina, WP05 to Raúl, and WP06 to Aditya, Rawad, and Vishala. WP04
was explicitly left `TBD`. On 20 October the group proposed Noushin as a WP03
collaborator with Tina, focused on report drafting, independent review, and
validation. Simon subsequently shipped the runtime, the first WP05 mock
implementation, and the WP03 engineering baseline.

The repository now needs to preserve both facts: the collaboration decision made
by the group and the person accountable for code that is already merged. A code
commit does not silently transfer scientific authority or erase an earlier work
package assignment.

## Decision

| Package | Accountable engineering owner now | Scientific decision right | Handoff state |
|---|---|---|---|
| WP01 study contract | Mateo, with Simon as integration reviewer | Mateo plus designated freeze authority | Group assignment recorded |
| WP02 orchestration/providers | Simon, with Mateo on contract alignment | Study owner approves deployments and limits | Group assignment recorded |
| WP03 workshop/report | Simon maintains the merged code; Tina is the designated package lead; Noushin is a proposed collaborator | Study owner approves prompts, role allocation and report semantics | Engineering handoff to Tina/Noushin must be recorded |
| WP04 context/evidence | Simon, provisionally, for shipped code | Independent evidence/privacy reviewer approves live gate | No lead assigned in the 13 October meeting |
| WP05 replay/testing | Simon maintains the existing engineering baseline; Raúl is the designated package lead; Arshan contributed the draft specification | Scientific owner approves sampling, cues and outcomes | Engineering handoff remains to be recorded |
| WP06 metrics/validation | Aditya, Rawad, and Vishala were designated by the group | Scientific measurement owner | Acceptance and exact review roles still required |

The group assignment establishes intended responsibility. A maintainer handoff
still requires a repository-visible acceptance and access to the relevant code.
Until that happens Simon owns maintenance of the WP03 and WP05 code he shipped.

## Alternatives considered

- Treat code authorship as ownership. Rejected because it confuses engineering
  implementation with scientific authority.
- Leave every unassigned package owner blank. Rejected because shipped code
  would then have no accountable maintainer.
- Assign collaborators without consent. Rejected because a project document
  cannot create an obligation on their behalf.

## Consequences

- WP03, WP04, and WP05 code have an accountable engineering maintainer while the
  designated collaborators are onboarded.
- Scientific choices remain blocked until the relevant authority approves them.
- WP04 still requires a named lead and independent evidence/privacy reviewer.
- WP06 has designated contributors but still needs explicit measurement and
  validation decision rights before behavioral claims.

## Evidence and acceptance

- Community group message `WA-COM-210450` on 2026-10-13 records the six work-package
  assignments and leaves WP04 `TBD`.
- Community group messages `WA-COM-213320`-`WA-COM-213322` on 2026-10-20 record the proposed
  Tina/Noushin WP03 collaboration; Tina accepted the collaboration in message
  `WA-COM-213329`.
- PR #12 is scoped to WP01 contracts and fixtures.
- PR #13 contains the runtime and WP05 engineering baseline.
- PR #20 contains the merged WP03 engineering baseline.
- Acceptance requires repository-visible maintainer handoffs and named
  scientific decision rights for WP03-WP06.

## Revisit trigger

Supersede this ADR when the project records accepted named owners and reviewers
for WP03-WP06.
