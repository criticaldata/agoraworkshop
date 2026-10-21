# Architecture before code

Use this guide before asking a coding agent to implement an AGORA requirement. Architecture is the set of decisions that tells the agent where behavior belongs, what may cross each boundary, what must persist, and how failure changes the system state.

This is an **AGORA workshop synthesis**, not a published architecture framework. It applies:

- [Microsoft Azure Architecture Center: AI agent orchestration patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns), especially the guidance to use the lowest reliable complexity, keep predictable sequences deterministic, manage state at human checkpoints, and account for coordination failure modes.
- [OWASP LLM07:2025 System Prompt Leakage](https://genai.owasp.org/llmrisk/llm072025-system-prompt-leakage/), especially the guidance to keep sensitive data out of prompts and enforce privilege separation and authorization in deterministic systems outside the language model.
- The [AGORA Phase 1A specifications](../phase1a/), which own the exact runtime, visibility, evidence, failure, and reporting requirements for this project.

The six questions below are a workshop checklist derived from those sources and the AGORA contract.

## The six questions

For the selected requirement, answer these before implementation:

1. **Entry point** — Which command, event, or function starts the behavior?
2. **State owner** — Which component owns the current state and may commit a transition?
3. **Trust boundary** — Which visibility class applies to every input and output?
4. **Persistence point** — What evidence must be durable before the next transition?
5. **Failure semantics** — Which outcomes are model behavior, and which are technical failures?
6. **Forbidden flow** — What data, dependency, or side effect must never occur?

## AGORA defaults

- The deterministic orchestrator owns workshop state.
- Context builders enforce public, private-agent, reviewer-isolated, and operator visibility.
- A state transition commits only after its required evidence records persist.
- Provider adapters return a common envelope and preserve provider-native raw fields.
- Refusal and abstention are completed model outcomes. Timeouts and provider errors are technical failures.
- Resume reconstructs the last committed state and must not repeat a committed provider call.
- Open research choices stay in the decision log. Implementation must not invent them.

## Architecture sketch

```text
run manifest
    |
    v
deterministic orchestrator
    |
    +--> context builder --> provider adapter --> response envelope
    |         |                                      |
    |         +-- enforces visibility                |
    |                                                v
    +------------------------------------------> evidence store
                                                     |
                                                     v
                                             replay / validation
```

The evidence store receives every attempt and committed transition. Analysis reads preserved evidence after execution; it does not rewrite the underlying record.

## Slice design record

```text
Requirement IDs:
Entry point:
State owner:
Inputs and visibility:
Outputs and visibility:
Persistence before commit:
Completed model outcomes:
Technical failures:
Forbidden flows:
Open decisions:
Tests that prove the design:
Runtime evidence required:
```

## Review test

Give the spec and this design record to another contributor. Ask them to draw the component and data-flow boundaries without seeing your code. If their drawing is materially different, the architecture is not explicit enough for an agent to implement safely.
