# Writing specs for coding agents

Use this guide before asking an agent to implement an AGORA change. The objective is not a longer prompt. It is a contract that lets another contributor produce and verify the same intended behavior without a private conversation.

This is an **AGORA workshop synthesis**, not a published industry standard. Its external basis is:

- [GitHub Spec Kit: What is Spec-Driven Development?](https://github.com/github/spec-kit/blob/main/docs/concepts/sdd.md), for defining intent before implementation and refining it across multiple steps.
- [OpenAI: Iterating Development Workflows with Codex](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex), for repository instructions, outcomes, scope, non-goals, constraints, read-only discovery, approval gates, acceptance criteria, and observed verification evidence.
- [Martin Fowler: Test Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html), for the test list and Red-Green-Refactor loop.
- [Google Testing Blog: Test Behaviors, Not Methods](https://testing.googleblog.com/2014/04/testing-on-toilet-test-behaviors-not.html), for focusing tests on observable behaviors.

The specific fields and review questions below are the workshop's application of those sources to AGORA.

## 1. Start from verified context

External basis: GitHub's agent definition and OpenAI's repository-guided Codex workflow. See [masterclass references](../../docs/masterclass-references.md#coding-agents-and-repository-context).

1. Identify the exact model and the agent harness or product running it.
2. Complete `../templates/model-harness-brief.md` from current official documentation.
3. Confirm the active model, tools, permissions, sandbox, network, and repository state in the actual UI or CLI.
4. Link the relevant code, logs, artifacts, decisions, and existing specs. Do not rely on the agent to remember unstated project history.

## 2. Specify observable behavior

External basis: GitHub Spec Kit and OpenAI's Codex workflow. See [masterclass references](../../docs/masterclass-references.md#spec-driven-development).

A useful change spec contains:

- **Outcome** — one user- or system-observable result.
- **Context** — current behavior and the smallest evidence needed to understand it.
- **Contract** — inputs, outputs, invariants, errors, security, and privacy rules.
- **Boundary** — what is in scope, out of scope, permitted, and forbidden.
- **Examples** — a happy path, boundary case, failure case, and counterexample.
- **Acceptance** — named tests, commands, artifacts, and runtime evidence required to finish.
- **Open decisions** — unresolved choices with an owner; never silently invent them in code.

Prefer requirement statements such as:

> `AREA-01` — Given `<context>`, when `<action>`, then `<observable result>`.

Avoid adjectives such as “robust”, “clean”, “fast”, or “secure” unless the spec defines the observable condition that makes them true.

## 3. Challenge the spec before coding

External basis: OpenAI's read-only discovery and approval-before-writes workflow. The five questions are an AGORA review checklist.

Ask an independent reader—or an agent in review-only mode—to answer:

1. Which terms are undefined?
2. Which requirements admit two incompatible implementations?
3. Which failure, privacy, security, or concurrency paths are absent?
4. Which implementation details are unnecessarily prescribed?
5. What would a superficially passing but incorrect solution look like?

Update the spec before implementation begins.

## 4. Derive the behavioral test contract

External basis: Fowler's TDD loop and Google's behavior-focused testing guidance. The coverage matrix and rejection list are AGORA workshop controls.

Map every normative requirement and critical boundary to at least one meaningful test. Include positive, negative, boundary, failure, security, privacy, and replay scenarios where relevant.

Then read every test's setup, action, assertions, and failure message. A passing test counts only if its assertions prove the requirement. Reject:

- deleted, disabled, or skipped tests used to obtain green;
- tautological assertions or assertions unrelated to the outcome;
- excessive mocks that bypass the behavior under test;
- snapshot-only checks for semantic behavior;
- production code hard-coded to the fixtures;
- component tests presented as proof of an untested end-to-end claim.

## 5. Implement and close the loop

External basis: Fowler's Red-Green-Refactor loop, OpenAI's observed verification guidance, and Spec Kit's converge workflow.

1. Make the smallest change that satisfies the reviewed contract.
2. Follow repository engineering conventions and keep unrelated changes out.
3. Run the complete relevant suite until it is green.
4. Exercise the real path and inspect its logs or artifacts.
5. If evidence contradicts the contract, update the spec, tests, and decision log together.
6. Hand off the requirement ID, code, test, evidence, remaining decision, and next owner.

## Review question

Can a competent contributor implement and prove the same intent using only the repository, this spec, and the linked official documentation? If not, the spec is not ready.

