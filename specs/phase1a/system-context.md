# Phase 1A system context

Status: **PROPOSED**

## Outcome

Extend the validated Phase 0 evidence apparatus into a deterministic multi-agent workshop runner. Phase 1A must reuse working evidence and storage components rather than rebuild them.

## Boundaries

- `CTX-01` — The core pilot is hosted by a deterministic runtime, not an autonomous moderator.
- `CTX-02` — Provider adapters may vary by model, but the experiment contract and evidence envelope are provider-neutral.
- `CTX-03` — Phase 0 logging, timestamping, hashing, and response storage are reused where compatible.
- `CTX-04` — Phase 1A adds workshop state, visibility controls, report workflow, replay, and pilot metrics.
- `CTX-05` — A separate AI-coding tutorial may explain the engineering method; it must not replace the implementation session.

## Logical components

1. **Study contract** — matrix, topics, rounds, checkpoints, and fixed parameters.
2. **Runtime orchestrator** — deterministic state machine and provider dispatch.
3. **Workshop channel** — ordered public conversation history.
4. **Private checkpoint channel** — isolated t0/t1/t2 responses.
5. **Report pipeline** — draft, two isolated reviews, revision.
6. **Evidence store** — append-only events and immutable artifacts.
7. **Replay and test harness** — deterministic fixtures and failure injection.
8. **Metrics pipeline** — derived measures with traceable provenance.

## Reuse-versus-build rule

Before adding a component, the implementing PR must state whether the capability is reused, adapted, or new. A replacement of a Phase 0 capability requires a recorded decision and migration evidence.

## Non-goals

- Autonomous facilitation in the core baseline.
- An unconstrained “wild west” agent society inside the 2×2 pilot.
- Production-scale scheduling, participant management, or billing.
- Choosing final model identifiers or limits without an approved decision.
