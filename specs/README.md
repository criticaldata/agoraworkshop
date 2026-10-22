# AGORA Spec-Driven Development pack

Status: **implemented mock-provider baseline — 2026-10-21**.

## What Spec-Driven Development means here

A specification is the shared contract between intent and implementation. It states observable behaviour, boundaries, invariants, examples, and acceptance checks before code is merged. It is not a long design document and it is not frozen forever: when evidence changes the design, the spec changes in the same pull request.

The working loop is:

1. **Observe** a concrete workflow, failure, or research requirement.
2. **Specify** the smallest behaviour that resolves it.
3. **Map behavioral coverage** from every requirement to positive, boundary, negative, failure, security, and privacy scenarios where relevant.
4. **Audit the tests** by reading their setup, action, assertions, and failure message; confirm what each test actually proves.
5. **Challenge ambiguity** with an independent reader before coding.
6. **Implement** one traceable slice using the project's engineering standards.
7. **Iterate to green** by correcting the code, test, or specification when evidence exposes a mismatch.
8. **Verify the real path** in the running environment and inspect the evidence.
9. **Record deviations** and update the spec, tests, and decision log together.

“Complete coverage” means every normative requirement and critical boundary has meaningful evidence. A line-coverage percentage alone does not establish behavioral coverage.

## Rules for tomorrow

- Before specifying a change, complete `templates/model-harness-brief.md` from official documentation and the actual product settings.
- Use `guides/writing-specs-for-coding-agents.md` to challenge the spec before deriving tests.
- Start every change from one spec file or a new file based on `templates/change-spec.md`.
- Mark unresolved choices as `OPEN`; do not silently invent them in code.
- Every normative requirement uses a stable ID such as `ORCH-04`.
- Tests and pull requests cite the requirement IDs they cover.
- Private outputs must never be inserted into public context.
- A refusal or abstention is a model outcome; a timeout or provider error is a technical failure.
- Preserve exact prompts, contexts, timings, retries, errors, model identifiers, and hashes.
- A change is done only when code, tests, evidence, and spec agree.

## Spec map

| File | Contract owned |
|---|---|
| `guides/writing-specs-for-coding-agents.md` | practical authoring and review method for agent-ready specs |
| `guides/architecture-before-code.md` | architecture questions, AGORA defaults, and a slice design record for coding agents |
| `templates/model-harness-brief.md` | dated one-page brief for the active model and execution surface |
| `templates/change-spec.md` | reusable outcome, boundary, examples, acceptance, and traceability template |
| `phase1a/system-context.md` | boundaries, reused Phase 0 components, new Phase 1A work |
| `phase1a/experiment-contract.md` | 2×2 study design, rounds, checkpoints, arms |
| `phase1a/runtime-orchestrator.md` | deterministic runtime state machine and provider routing |
| `phase1a/context-visibility.md` | public/private context rules and leakage invariants |
| `phase1a/report-workflow.md` | draft, two isolated reviews, revision, final checkpoint |
| `phase1a/evidence-schema.md` | event envelope, response records, traceability |
| `phase1a/context-locked-replay.md` | WP05 frozen snapshots, cue cells, independent trials, fault and visibility checks |
| `phase1a/dry-run-acceptance.md` | end-to-end scenarios and gates for the first dry run |
| `phase1a/requirement-test-matrix.md` | executable mapping from all normative requirements to behavioral proof |
| `phase1a/decision-log.md` | decisions that remain open and how they are closed |

## Pull request checklist

- [ ] Spec and requirement IDs are cited in the PR.
- [ ] Acceptance checks are automated where practical.
- [ ] A requirement-to-test matrix accounts for every normative requirement and critical boundary.
- [ ] Reviewers have inspected what each new or changed test actually asserts.
- [ ] New or changed events conform to the evidence schema.
- [ ] Privacy and visibility boundaries are tested.
- [ ] Failures, retries, and partial results are preserved rather than hidden.
- [ ] The decision log is updated if an open choice was resolved.
- [ ] A reviewer can replay the demonstrated path from committed evidence.
- [ ] The complete relevant suite is green and the running workflow has been checked.
