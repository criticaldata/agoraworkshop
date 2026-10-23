# ADR-011: WhatsApp decision provenance and supersession

Status: **ACCEPTED**  
Date: 2026-10-22  
Engineering decision owner: Simon Heilles

## Article claim supported

AGORA can explain how its experimental and software architecture evolved without
presenting proposals, meeting summaries, and implemented decisions as equivalent
evidence.

## Context

Project decisions were discussed in two WhatsApp groups before they were fully
captured in the repository:

- `AGORA Workshop (agentic group)`, the historical group active from August to
  September 2026;
- `AGORA: Agentic Game of Research and Academia`, the MIT Critical Data community
  group containing the later consolidated Workshop discussions.

The discussions contain confirmed decisions, proposals, later corrections, and
superseded designs. Several meeting summaries use decisive language for items
that later messages explicitly describe as ideas still under discussion.

## Decision

Every ADR derived from WhatsApp must preserve a discussion source key, date, and
decision status. The register uses these statuses:

| Status | Meaning |
|---|---|
| `ACCEPTED` | Current engineering or governance baseline |
| `SCIENTIFIC REVIEW REQUIRED` | Implemented or selected for engineering, but not scientifically frozen |
| `PROPOSED` | Discussed without a final recorded decision |
| `SUPERSEDED` | Previously selected or summarized, then replaced by a later decision |
| `OPEN` | A choice the group explicitly left unresolved |

Source keys use `WA-OLD-<message-id>` for the historical Workshop group and
`WA-COM-<message-id>` for the community group. They identify the conversation,
date, and exact local WhatsApp message without copying unrelated chat content
into the repository.

The chronological decision map is:

| Date | Source | Decision or proposal | Current status | Governing ADR |
|---|---|---|---|---|
| 2026-07-20 | `WA-COM-186021` | Run the Workshop use case before Peer Review and healthcare simulations | ACCEPTED | ADR-015 |
| 2026-07-24 | `WA-COM-186071` | Use a phased controlled pilot, modular provider-neutral adapters, and observable moderator actions | ACCEPTED IN PRINCIPLE; pilot size superseded | ADR-002, ADR-005, ADR-012 |
| 2026-08-09 | `WA-OLD-189497`-`WA-OLD-189520` | End Phase 0 only after instrument-integrity, failure-attribution, reproducibility, isolation, state, and retry gates | ACCEPTED | ADR-005, ADR-008, ADR-009, ADR-012 |
| 2026-08-10 | `WA-OLD-189901`-`WA-OLD-189905` | Keep identical prompts as the Phase 0 control; move role packs after the instrument baseline | ACCEPTED | ADR-012 |
| 2026-08-17 | `WA-COM-192144`, `WA-COM-192270` | Pause Peer Review execution and focus on completing the Workshop first | ACCEPTED | ADR-015 |
| 2026-09-11 | `WA-COM-201452` | Use a three-part moderated/breakout/debrief design and Gemma-vs-Gemini comparison | SUPERSEDED | ADR-013 |
| 2026-09-22 | `WA-COM-205276`-`WA-COM-205278` | Treat the blueprint as a pre-read and hold implementation until group review | ACCEPTED | ADR-014 |
| 2026-09-30 | `WA-COM-206640` | Use six agents, novelty stopping, and a fourteen-experiment wave plan | PROPOSED, THEN SUPERSEDED | ADR-013 |
| 2026-10-09 | `WA-COM-209280`, `WA-COM-209305` | Use the three-agent 2x2 pilot, six rounds, private probes, independent report reviews, passive context logging, and replay tests | ACCEPTED BASELINE; some scientific choices remain open | ADR-003, ADR-005, ADR-006, ADR-007, ADR-013 |
| 2026-10-13 | `WA-COM-210450` | Separate specification, orchestrator, adapters, and evidence; use a deterministic host; assign WPs | ACCEPTED | ADR-001, ADR-002, ADR-013 |
| 2026-10-20 | `WA-COM-213108`-`WA-COM-213317` | Reuse Phase 0, organize code by WP, lock replay parentage, preserve cue provenance, and add human review | ACCEPTED ENGINEERING BASELINE | ADR-002, ADR-007, ADR-009 |
| 2026-10-20 | `WA-COM-213320`-`WA-COM-213329` | Pair Noushin with Tina on WP03 while onboarding the new contributor | ACCEPTED COLLABORATION; maintainer handoff pending | ADR-001 |

## Alternatives considered

- Copy meeting summaries into the ADRs as final truth. Rejected because later
  messages correct several of them.
- Record only the current design. Rejected because the article and project team
  need to explain why earlier designs were abandoned.
- Publish full chat exports in Git. Rejected because unrelated personal and
  scheduling messages are outside the project evidence scope.

## Consequences

The ADR section becomes the durable, reviewable interpretation of the two
WhatsApp histories. WhatsApp remains provenance, not the runtime configuration.
Current code and frozen specifications still decide what may execute.

## Evidence and acceptance

The two named groups were queried from their first locally available message
through 2026-10-22. The historical group contains 173 messages, including 168
text messages. The community group contains 485 messages, including 428 text
messages. Only Workshop-specific architecture, protocol, testing, ownership,
and sequencing decisions were included.

Acceptance requires every WhatsApp-derived assertion in this register to name a
source key and to label superseded or unresolved material explicitly.

## Revisit trigger

Reconcile this record when an older export, deleted message, meeting recording,
or signed protocol decision materially changes the chronology.
