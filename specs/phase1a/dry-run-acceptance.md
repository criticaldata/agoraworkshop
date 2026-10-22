# First dry-run acceptance

Status: **PROPOSED**

The first dry run proves the apparatus, not the research hypothesis.

## Gates

### G1 — Contract and state

- `DRY-01` — A manifest creates one valid run and the state machine completes all six rounds.
- `DRY-02` — No early-stop path is taken.
- `DRY-03` — Restart after a committed turn resumes without duplicate provider calls.

### G2 — Visibility

- `DRY-04` — Canary leakage test passes for t0, t1, t2, and both reviewer contexts.
- `DRY-05` — Public history contains only public events.

### G3 — Failure semantics

- `DRY-06` — One injected provider timeout creates a failed attempt and a traceable retry.
- `DRY-07` — One model refusal is stored as a completed outcome, not a provider failure.
- `DRY-08` — A terminal provider failure preserves a replayable partial evidence bundle.

### G4 — Report and evidence

- `DRY-09` — A report-arm fixture creates immutable draft, isolated reviews, revision, and t2 artifacts.
- `DRY-10` — Evidence export passes schema and hash-chain validation.
- `DRY-11` — A second operator can replay the fixture and explain every state transition from committed evidence.

## Masterclass exercise

Teams select one gate, create a small change spec, implement or stub the behaviour, add an acceptance test, and attach evidence in a pull request.

## Definition of done for tomorrow

- At least one end-to-end fixture completes without privacy leakage.
- Failure and abstention semantics are demonstrated.
- Open research choices remain explicit in the decision log.
- Every merged change cites requirement IDs and has inspectable evidence.
- Every normative requirement in the implemented slice maps to a reviewed test whose assertions prove the intended behavior.
- The relevant suite is green and the demonstrated runtime path has been checked independently.
