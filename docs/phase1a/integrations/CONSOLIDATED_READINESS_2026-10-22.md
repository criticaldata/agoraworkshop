# Phase 1A consolidated integration and scientific handoff

Date: 2026-10-22 (America/Guayaquil).

Scientific status: **IMPLEMENTATION_READY — SCIENTIFIC_FREEZE_PENDING**.

Audit base: `master` at `762ff0611bdf8446fb2feda3df7dae32a8f32dc3`.
Consolidation: PR #14, merge `da3dac5618a759c425c65a3b740926215ae233b2`.

## What was accepted

PR #12 supplies the active October WP01 contract; PR #14 incorporates it with
PR #7 correctness/privacy fixes and PR #13 runtime/WP05. PR #11 was a delivery
vehicle containing WP01 code, candidate prompts, schemas, tests and documents
plus inherited work. Closing #11 archived that vehicle; it did not discard the
intended WP01 implementation. PR #10's five-role scientific design remains
historical and does not govern this three-participant pilot.

Sources: [#11 comment](https://github.com/criticaldata/agoraworkshop/pull/11#issuecomment-6332319159),
[#12 comment](https://github.com/criticaldata/agoraworkshop/pull/12#issuecomment-6332319666),
[#14](https://github.com/criticaldata/agoraworkshop/pull/14).

## Contract/runtime/replay crosswalk

| Contract | Runtime/evidence | Evidence or remaining boundary |
|---|---|---|
| Four cells, three participants, three replications | `Phase1aManifest.cell`, participants, replication | New integration suite exercises A–D × 1–3 through explicit test-only projection |
| 216 public + 90 private + 24 report calls = 330 | 24 operations in A/C, 31 in B/D | Compare every committed invocation with the WP01 agenda, including the complete operation order |
| `T0` | `checkpoint.t0`, `t0:agent_N` | Three private artifacts and three commits before report disclosure |
| `T6` | `T1`, `checkpoint.t1` | Same post-six-round measurement time; alias must be explicit in real manifest adapter |
| `TR` | `T2`, `checkpoint.t2` | Same post-revised-report time; present only in B/D |
| D13 Option A | `DEC-09`, `EXP-14`, `discloseReportRequirement()` | B/D: disclosure after all t0 commits and before first public call; A/C: no disclosure |
| Candidate prompts and hashes | Runtime prompt strings and recorded hashes | Test projection renders candidates; production adapter and full prompt-composition parity are still required |
| Participant slots P1–P3 | Runtime IDs agent_1–agent_3 in fixtures | Explicit fixture mapping only; report allocation still requires approval |
| Evidence replay | `replayEvidence()` | Reconstructs committed operations from a serialized bundle without model calls |
| Context-locked cue replay | `createReplayPlan()`, `executeReplayPlan()` | Parent request, prompt/context hashes and public source IDs preserved; draft requires human review before replay calls |

Sources: `src/phase1a/wp01/manifests/campaign.ts`,
`src/phase1a/wp01/scheduling/agenda.ts`, `src/phase1a/index.ts`,
`src/phase1a/contextLockedReplay.ts`, `specs/phase1a/experiment-contract.md`.

## Executed evidence

New suite: `tests/phase1aConsolidatedIntegration.test.ts` (15 cases).

- Twelve condition/replicate cases complete the 330 planned mock invocations.
- Each operation sequence equals the model-invocation projection of WP01's agenda.
- Private outputs stay out of public/report requests; t0 receives no report notice.
- Each report run discloses once, after all three t0 commits; no-report runs do not disclose.
- Terminal t0 timeout prevents disclosure/public turns and retains failed-run evidence.
- JSON serialize/restore immediately after t0 preserves all three calls and discloses once.
- WP05 locks the selected parent request; all four cue cells validate; execution of
  the draft is rejected with zero replay provider calls pending human review.

These are offline integration checks using explicit fixture budgets, order,
writer allocation and candidate wording. They do not approve those scientific
choices, exercise a real provider, demonstrate disk/process crash durability,
or implement a production manifest adapter. No human approval was fabricated.

The original #14 CI passed 45 files / 510 tests, build, whitespace and production
audit. Source: [Actions](https://github.com/criticaldata/agoraworkshop/actions/runs/39719431542).
Fresh local verification on this branch:

| Check | Result |
|---|---|
| New integrated suite | 15/15 passed |
| WP01 + runtime + WP05 + traceability + new integration subset | 5 files, 79/79 passed |
| Full repository suite | 46 files, 525/525 passed; zero failures |
| TypeScript (`--noEmit`) and build | PASS |
| Production dependency audit | PASS; zero vulnerabilities |
| Whitespace | PASS |
| `npm run validate` | Exit 0; module import only, not campaign execution (I-08) |
| Live / paid calls / replay human approval | Not executed / not fabricated |

Machine-readable local report: `artifacts/phase1a-consolidated-tests.json`
(ignored by Git). SHA-256:
`f6c417c57165fe454b0bf7540556e57619f099982f445e7667fa6f7e7e20e42e`.
The historical 439/458/462/466/485 snapshots remain distinct.

## Technical findings to close before live

| ID | Finding and evidence | Required work / responsible package |
|---|---|---|
| I-01 | WP01 `RunManifest` and runtime `Phase1aManifest` are independent schemas. Runtime does not import/validate the WP01 register or refs; `createManifest()` accepts supplied strings such as `approvedAt` without authenticating scientific approval. | WP01/WP02: versioned adapter, hash links and explicit freeze authorization gate; do not use test projection as live admission |
| I-02 | `Participant.configuration` is archived by `EvidenceLedger.providerCall()`, but `ProviderCallSpec` and `perform()` do not pass configuration to `invoke(spec)`. WP05 does pass configuration. | WP02: explicit decoding-parameter contract and adapter request test, including unsupported parameters and provenance parity |
| I-03 | `operationPlan()` hardcodes agent_1 as writer/reviser and agent_2/3 as reviewers, while WP01 report allocation is `UNRESOLVED`. Unknown IDs fall back to participant zero in `perform()`. | Scientific D08 approval, then WP02/WP03: explicit assignment and reject unknown participant IDs |
| I-04 | `verifyEvidenceBundle()` checks event/artifact hashes and manifest, but does not bind all call metadata. Reproduction: alter `bundle.provider_calls[0].model` to `tampered-model`; verifier returns `valid:true`. | WP04/WP05: independent request/call/raw/context linkage and tampering-negative tests before treating bundle validity as complete provenance validation |
| I-05 | `mapPhase1aOutcome('abstained')` returns `delivered_refusal`. | WP05/WP06: preserve abstention/refusal as distinct analysis outcomes, with explicit crosswalk |
| I-06 | `EvidenceLedger` uses in-memory arrays; restore accepts a supplied bundle. Existing interruption checks and the new test restore serialized data, not a durable storage backend under process kill. | WP02/WP04: storage transaction contract, actual kill/restart and committed-write evidence for operational durability |
| I-07 | WP05 `buildReplayCell()` renders a speaker/endorsement wrapper in every cell, including the parent-cue combination. Cue spans refer to that rendered representation. | WP05/scientific review: document whether the comparison baseline is this normalized representation or the original provider-request bytes; approve before live cue effects are interpreted |
| I-08 | `npm run validate` executes `src/scripts/validate.ts`, which exports `runValidationPackage()` but contains no CLI entrypoint calling it. Observed exit 0 produces no new campaign. | Engineering: use the actual validation caller with explicit mock config/output, or add a CLI entrypoint in a separate change; do not count exit 0 alone as an exercised gate |

These findings are not repaired by reducing acceptance thresholds or declaring
mock success equivalent to live readiness. No Phase 0 or historical Phase 1
code is changed by this review branch.

The first fresh full-suite run on Windows produced 523 passes and two failures
in `tests/specTraceability.test.ts`: its line-splitting retained CR characters
and the matrix regex read zero rows. The parser now accepts LF and CRLF using
`split(/\r?\n/)`; the expected 79 requirements and every assertion are unchanged.

## Reconciled disclosure documentation

The active code agendas already omit a no-report notice. `DEC-09` / `EXP-14`
explicitly confirm A/C receive no disclosure. WP01 prose was corrected to match
that approved decision. The unused `no-report-condition` prompt remains in the
candidate registry for provenance; no candidate text/hash or historical manifest
hash was changed. Retention is not permission to schedule that candidate.

## Scientific decision handoff

The following owners are package roles from the existing registers. Assignment
of a named person remains for project leads (`DEC-07`); this document does not
appoint collaborators or record unreceived approvals.

| WP01 / runtime ID | Required decision package | Accountable role | Status / dependency |
|---|---|---|---|
| D01, D03, D04 | Preserve Phase 0; four cells; deterministic host | Study contract | CONFIRMED in WP01 |
| D13 / DEC-09 | t0 before B/D disclosure; no A/C disclosure | Simon / study design | CONFIRMED; retain recorded 2026-10-21 decision |
| D02, D07 / DEC-01 | Exact Gemma/Gemini/Model X IDs, hosting, revisions, endpoints and supported decoding parameters | Scientific + infrastructure owners | OPEN; needed before live; no model selected here |
| D05 / DEC-03 | Speaking/seat schedule and recorded variations across three replications | Study owner + WP02 | PROPOSED/OPEN; choose approved order scheme, not fixture order by default |
| D06, D14 / DEC-04 | Final topic, complete system/user prompts, notice and private instruments; version/hash approval | Scientific reviewer + WP01/WP03/WP04 | OPEN; candidate registry available for line review |
| D08 | Writer/reviewer allocation: fixed versus balanced assignment, and unit of balancing | Study owner + WP03 | PROPOSED; contrast confounding and cost before choosing |
| D09 / DEC-02 | Calls, tokens, cost, wall-time, retries, concurrency and provider errors | Study + WP02 | OPEN; record numeric ceilings and actual enforced mechanisms |
| D10 / DEC-05 | Include/exclude and purpose of extra Wild West arm | Research leads | OPEN; core matrix remains 12 runs until approved amendment |
| D11 | Behavioral constructs, codebook, human rubric and calibration evidence | WP06 + scientific reviewer | PROPOSED; no automatic inheritance of September calibration |
| D12 / DEC-06 | Replay selection, trial count, labels/endorsement provenance, tolerance and reviewer | WP05 + study owner | OPEN; approve plan before provider calls |
| D15 | Authorized freeze sign-off and approved campaign version | Research governance | OPEN; technical merge does not resolve it |
| D16 | Independent reconstruction/replay, archive and replication evidence | WP04/WP05/WP06 | OPEN; nominate receiving operator and acceptance evidence |
| DEC-07, DEC-08 | Named owners/reviewers and dry-run/calendar | Project leads | OPEN; propose only after model access and above dependencies are clear |

Approval record for each unresolved item:

```text
Decision ID(s):
Chosen alternative and exact approved values:
Rationale and expected bias/tradeoff:
Approver and role:
Approval date / source URL:
Affected contract/prompt/manifest version and hashes:
Required implementation and acceptance evidence:
```

All fields are intentionally blank. Completing this review handoff does not
close any scientific decision without actual approval.

## Minimal ordered dry-run plan

1. Review the technical findings and decision handoff; confirm named owners.
2. WP01/WP02 implement the real manifest adapter and admission gate, then close
   parameter routing, assignment, evidence-linkage and outcome distinctions.
3. Obtain scientific approval of exact deployments, complete prompts, order,
   assignment, budgets and the engineering-only live dry-run manifest. Scientific
   pilot freeze and engineering dry-run authorization must be recorded separately.
4. Read-only preflight approved endpoints: model identity/revision, authentication,
   context limit and supported parameters. Store receipt without credentials.
5. After authorization, execute one A/C-style and one B/D-style live fixture,
   an identical-condition repetition, a controlled technical fault, restore and
   visibility checks. Specify actual composition and cost ceiling first. These
   are engineering runs, not substituted pilot observations.
6. Prepare WP05 draft from a completed authorized public opportunity; human
   review must confirm argument preservation and cue edits before trials.
7. Archive manifest, source commit, request/raw data with access control,
   failures, checks, hashes and independent replay results. Review against
   `specs/phase1a/dry-run-acceptance.md` before admitting the 12-run pilot.

Live provider execution: **NOT_EXECUTED**. No endpoint, model, credential,
paid call, GPU deployment or scientific approval was selected by this review.

## Reproduce offline review

```powershell
npm ci
npx vitest run tests/phase1aConsolidatedIntegration.test.ts tests/phase1aWp01.test.ts tests/phase1aRuntime.test.ts tests/contextLockedReplay.test.ts --reporter=verbose
npm test
npx tsc --noEmit -p tsconfig.json
npm run build
npm run validate
npm audit --omit=dev --audit-level=high
git diff --check
```

`npm run validate` currently imports the validation module and exits; it is not
evidence of executing `runValidationPackage()` (I-08). The existing validation
package tests exercise that function with mock fixtures. A machine-readable Vitest report can be generated with
`--reporter=json --outputFile.json=artifacts/phase1a-consolidated-tests.json`.
