# Context and visibility contract

Status: **PROPOSED**

## Visibility classes

| Class | Examples | Visible to |
|---|---|---|
| Public | prompts, ordered workshop turns | all workshop agents and host |
| Private-agent | t0/t1/t2 response, agent-specific notes | originating agent pipeline and evidence store |
| Reviewer-isolated | report draft plus one review prompt | assigned reviewer only |
| Operator | secrets, provider credentials, operational logs | authorized operators only |

## Invariants

- `VIS-01` — A public prompt or history contains no private checkpoint text or derivative summary.
- `VIS-02` — Reviewer 1 and Reviewer 2 do not receive each other’s review.
- `VIS-03` — The revision step receives the draft and both reviews only after both reviews are committed.
- `VIS-04` — Evidence exports preserve visibility labels.
- `VIS-05` — Secrets never appear in prompts, committed fixtures, public events, or participant branches.
- `VIS-06` — Context assembly is deterministic for the same manifest and event history.
- `VIS-07` — Every provider call stores a hash of the exact assembled context and an authorized raw reference.

## Leakage test

Plant distinct canary tokens in each private channel. Run all public and reviewer context builders. The build fails if a token appears outside its authorized class.
