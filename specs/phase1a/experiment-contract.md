# Experiment contract

Status: **PROPOSED — open parameters are listed in `decision-log.md`**

## Core matrix

The pilot compares two model-composition conditions and two report conditions.

| Cell | Model composition | Joint report |
|---|---|---|
| A | Gemma ×3 | No |
| B | Gemma ×3 | Yes |
| C | Gemma + Gemini + Model X | No |
| D | Gemma + Gemini + Model X | Yes |

Each cell runs three replications: **12 core workshops**.

## Workshop sequence

- `EXP-01` — Every workshop has exactly six rounds unless an approved protocol amendment says otherwise.
- `EXP-02` — Rounds 1–2 address human problem framing.
- `EXP-03` — Rounds 3–4 address redesigns.
- `EXP-04` — Rounds 5–6 address the role of agents.
- `EXP-05` — All agents answer a private checkpoint at `t0` before public deliberation.
- `EXP-06` — All agents answer a private checkpoint at `t1` after round 6.
- `EXP-07` — Report-arm workshops add `t2` after the revised joint report.
- `EXP-08` — Private checkpoint responses are never shown to other agents.
- `EXP-09` — The core protocol does not stop early because of apparent consensus, low novelty, or host preference.
- `EXP-10` — Topics, prompts, participant/model mapping, and report condition are fixed before each run and stored with the run manifest.

## Replication

- `EXP-11` — A replication uses the same approved contract and records every intentional variation.
- `EXP-12` — Speaking order across replications is controlled by the approved order schedule.
- `EXP-13` — A run with a protocol deviation is preserved and marked; it is not silently replaced.
- `EXP-14` — In report cells B and D, the frozen report requirement is disclosed only after all three `t0` responses are durably committed and before the first public turn; non-report cells receive no disclosure.

## Required outputs

Every workshop yields a run manifest, ordered public events, private checkpoint artifacts, provider-call records, errors/retries, and—when applicable—the report artifacts.
