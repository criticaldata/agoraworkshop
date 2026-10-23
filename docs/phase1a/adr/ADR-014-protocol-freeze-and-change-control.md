# ADR-014: Protocol freeze and change-control gate

Status: **ACCEPTED**  
Date: 2026-09-22  
Owner: WP01 study owner and designated freeze authority

## Article claim supported

The implemented experiment is reviewed as a protocol before live execution,
and later ideas cannot silently enter an active campaign.

## Context

The discussions produced increasingly detailed designs quickly. On 11 September
the group said no experiment should run until agent scripts were collectively
reviewed. On 22 September the author of the technical-scientific blueprint
agreed to treat it as a pre-read and hold implementation until the group had
worked through the main decisions and open questions.

## Decision

Live execution requires a frozen, versioned WP01 contract approved by the named
study authority. The freeze includes conditions, deployments, prompts, agenda,
speaking order, limits, retry policy, report semantics, replay interventions,
and measurement definitions.

New ideas raised in chat remain `PROPOSED` until they are added through a
recorded amendment. Code may implement mock-supporting mechanics before the
scientific freeze, but it must label them as an engineering baseline and must
not authorize live runs.

Human review is required where an intervention could change semantic content,
including replay cue edits. Automated diffs and tests supplement that review.

## Alternatives considered

- Implement every blueprint item immediately. Rejected because the document
  contained unresolved methodological choices.
- Treat a meeting summary as freeze approval. Rejected because summaries can
  describe proposals as decisions and omit later corrections.
- Block all mock engineering before scientific freeze. Rejected because mocks
  can validate interfaces and failure behavior without making scientific claims.

## Consequences

The team can progress on provider-neutral engineering while preserving a clear
gate before compute spend and data collection. The article can distinguish
protocol decisions from implementation experiments.

## Evidence and acceptance

- `WA-COM-201452` on 2026-09-11 records collective prompt review before any
  experiment.
- `WA-COM-205276`-`WA-COM-205278` on 2026-09-22 record the blueprint review request and
  the decision to hold implementation until group discussion.
- `WA-COM-213113` on 2026-10-20 requires human meaning-preservation review for
  replay cue edits and distinguishes open ideas from meeting decisions.
- `WA-COM-213417` on 2026-10-21 records the subset incorporated into the
  engineering baseline.

Acceptance requires the adapter gate in ADR-002 and release evidence in ADR-009.

## Revisit trigger

Review when the project designates a different freeze authority or adopts a
formal protocol-amendment system.
