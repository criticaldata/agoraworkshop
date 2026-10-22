# WP01.02 — Pre-freeze decision register

The machine-readable register is `createDefaultDecisionRegister()` in
`src/phase1a/wp01/contracts/decisions.ts`. Statuses are deliberately separated:

- `CONFIRMED`: direction recorded in the available meeting/protocol evidence;
  not necessarily a final scientific freeze.
- `PROPOSED`: an implementation candidate requiring review.
- `OPEN`: no approved choice is recorded.
- `DEFERRED`: intentionally postponed.

## Register

| ID | Decision | Status | Blocking effect |
|---|---|---|---|
| D01 | Preserve Phase 0 as closed milestone | CONFIRMED | None |
| D02 | Exact Gemma/Gemini deployments | OPEN | Scientific freeze |
| D03 | Four-cell 2×2 structure | CONFIRMED | None |
| D04 | Deterministic host, no autonomous moderator | CONFIRMED (meeting direction) | None |
| D05 | Speaking order and seat allocation | PROPOSED | Scientific freeze |
| D06 | Final prompt wording/version | OPEN | Scientific freeze |
| D07 | Model X instantiation | OPEN | Scientific freeze |
| D08 | Report-writer allocation | PROPOSED | Scientific freeze |
| D09 | Budgets, timeouts, retries, concurrency | OPEN | Scientific freeze |
| D10 | Wild West scope | OPEN | Scientific freeze |
| D11 | Behavioral codebook and calibration | PROPOSED | Scientific freeze |
| D12 | Replay trials and selection | OPEN | Scientific freeze |
| D13 | Notice before/after t0 | CONFIRMED by Simon (meeting direction) | Scientific freeze |
| D14 | Private probe contents | OPEN | Scientific freeze |
| D15 | Freeze authorization | OPEN | Scientific freeze |
| D16 | Reconstruction/replication evidence | OPEN | Scientific freeze |

D17 was a redundant label for the same report-notice/t0 question. It is retired
and preserved in `consolidation_notes` as `D17 -> D13`.

## D13 — confirmed methodological timing

Simon Heilles selected Option A:

> "Here I'd say option A: the purpose of the baseline is to see what happens with the smallest amount of information possible."

The machine-readable decision records this as:

- selected alternative: `T0_BEFORE_REPORT_NOTICE`;
- manifest timing: `AFTER_T0_BEFORE_PUBLIC`;
- stage order: all three private `t0` opportunities, then the report/no-report
  notice, then the first public contribution in report arms;
- decision status: `CONFIRMED` at meeting-direction level;
- `decision_date`: not fabricated;
- overall scientific freeze: still pending.

This confirms the methodological baseline rule without resolving Model X,
deployments, prompt approval, budgets, writer allocation, probes, codebook,
replication evidence or freeze authorization.

Every record also contains alternatives, current evidence, approver,
scientific/engineering impact, source references and associated configuration
fields. The implementation does not fill `approved_wording` or `decision_date`
for unresolved matters.

## D04 provenance boundary

The available October implementation meeting direction and the WP01 mandate
support a deterministic procedural host for the current baseline. The register
records this as meeting direction, not as a claim that all governance approvals
are complete.

## Sources

The register cites the revised blueprint, Protocol v0.9, the implementation
meeting slides, and the WP01 mandate. A transcript or formal sign-off can
replace the meeting-direction evidence during review without changing the
schema.
