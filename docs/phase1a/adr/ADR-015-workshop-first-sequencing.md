# ADR-015: Workshop-first project sequencing

Status: **ACCEPTED**  
Date: 2026-08-17  
Owner: AGORA project leadership

## Article claim supported

The Reimagining Humans Workshop is AGORA's first executable research use case;
Peer Review and the healthcare ecosystem follow after the Workshop instrument is
demonstrated.

## Context

The initial AGORA roadmap contained three use cases: Workshop, Peer Review, and a
healthcare ecosystem simulation. Parallel activity on the first two projects
created fragmented documents and competition for implementation attention.

## Decision

Complete and evaluate the Workshop first. Pause Peer Review execution while the
Workshop reaches a usable controlled baseline. Preserve Peer Review documents
and concepts for the next project stage rather than mixing its roles, metrics,
or manuscript workflow into the Workshop runtime.

## Alternatives considered

- Build Workshop and Peer Review in parallel. Rejected for the current stage
  because the team had not completed the first Workshop baseline.
- Start with the healthcare ecosystem. Rejected because it is the most complex
  use case and depends on infrastructure not yet validated.

## Consequences

Shared infrastructure may be reused later, but Workshop-specific ADRs cannot be
treated as decisions for Peer Review or healthcare. Project communication should
identify which AGORA use case a proposal belongs to.

## Evidence and acceptance

- `WA-COM-186021` on 2026-07-20 records the order: Workshop, Peer Review, then
  healthcare ecosystem.
- `WA-COM-192144` and `WA-COM-192270` on 2026-08-17 explicitly pause the other
  project and direct the group to execute the Workshop first.
- `WA-OLD-204614` on 2026-09-20 records the group consolidation under the same
  sequence: Workshop first, Peer Review afterward.

Acceptance means the current Phase 1A repository and review interface remain
scoped to the Workshop unless a document explicitly says otherwise.

## Revisit trigger

Supersede when AGORA leadership opens the next use case with its own frozen
contract, owners, and acceptance criteria.
