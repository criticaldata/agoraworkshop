# ADR-013: Current Workshop topology and deterministic host

Status: **ACCEPTED, SCIENTIFIC FREEZE PENDING**  
Date: 2026-10-13  
Engineering owner: Simon Heilles / WP02-WP03

## Article claim supported

The core pilot changes group composition and report requirement while keeping
the Workshop sequence and host behavior deterministic and inspectable.

## Context

The Workshop design changed several times. July proposed five participants and
one moderator. September proposed a three-part breakout/debrief design, then a
six-agent, fourteen-experiment program with novelty-based stopping. The October
pilot reduced the first executable study to a three-agent 2x2 design.

## Decision

The current core pilot is:

- three participants per run;
- conditions A/B with three Gemma participants;
- conditions C/D with Gemma, Gemini, and a frozen `Model X` deployment;
- no report in A/C and the joint-report workflow in B/D;
- six public rounds, two for each fixed agenda topic;
- private checkpoints before and after public discussion, plus a post-report
  checkpoint in B/D;
- deterministic host-controlled state transitions and eligibility;
- no autonomous moderator deciding when to stop, route, count, or advance;
- a speaking order fixed within each run and controlled across replications.

The following remain outside the core pilot unless the study contract adds them:
breakout groups, novelty stopping, the fourteen-experiment wave plan, uncensored
models, human-observation framing, moderator-model comparisons, and a separate
“wild west” baseline.

`Model X`, exact prompt wording, and the scientific speaking-order schedule
remain open freeze decisions even though the runtime supports the structure.

## Alternatives considered

- Five participants plus an agent moderator. Superseded after the pilot was
  reduced to three participants and deterministic hosting.
- Three-part intro/breakout/debrief. Superseded by the six-round core protocol.
- Six agents with novelty stopping and fourteen experiments. Superseded for the
  first pilot because it added too many simultaneous variables.
- Autonomous moderator. Rejected because its choices would add an uncontrolled
  experimental actor and complicate failure attribution.

## Consequences

The runtime can execute the same operation graph for every core condition.
Variation in group composition and report work stays explicit. Future
experiments remain possible without being misreported as part of the pilot.

## Evidence and acceptance

- `WA-COM-186071` on 2026-07-24 records the initial five-agent-plus-moderator
  controlled pilot and provider-neutral architecture.
- `WA-COM-201452` on 2026-09-11 records the three-part design and
  Gemma-vs-Gemini comparison, later superseded.
- `WA-COM-206640` on 2026-09-30 records the six-agent, novelty-stop, and
  fourteen-experiment proposal, later superseded.
- `WA-COM-209305` on 2026-10-09 records the 2x2, twelve-run, six-round pilot,
  private checkpoints, report contrast, and replay addition.
- `WA-COM-210450` on 2026-10-13 records the deterministic host, fixed
  within-run order, separate order-effect experiment, and open `Model X` choice.
- PR #20 implements the WP03 operation graph and report workflow for the current
  topology.

Acceptance requires the WP01 frozen manifest to name the exact deployments,
prompts, limits, and speaking-order schedule before live provider calls.

## Revisit trigger

Review when WP01 changes participant count, conditions, agenda, round count,
host authority, or the core-pilot status of any future experiment.
