# P0 remediation specification and change report: P06 / S04

Scoped engineering verdict: **P06/S04 FIXED_VERIFIED**. Reproduced first on
fetched `origin/master`, `63298bd13a0d85a1b8990697c843a39e31badf30`, then
corrected and reexecuted on the isolated `codex/p0-t0-baseline-integrity` branch
(2026-10-23). This is not an overall post-merge acceptance or pilot approval.
Scientific status remains **IMPLEMENTATION_READY — SCIENTIFIC_FREEZE_PENDING**.

## Authorized specification and implementation sequence

This implements the user's P0 t0-baseline-integrity mandate, not a scientific
decision. Controlling requirements: D13 Option A; ADR-003 (three committed
private baselines before B/D disclosure, no A/C notice); ORCH-05/06/07/08
(provider envelopes, retained provenance, bounded retries and distinct outcomes).

1. Reproduce the unchanged P06 and S04 predicates before production edits.
2. Add failing boundary regressions for all four canonical engineering cells.
3. At the existing WP02 `perform()` admission boundary, classify `success`
   without a nonempty string as existing technical `invalid_response`, retaining
   the received envelope in operator-only raw evidence. Do not trim valid text.
4. Reuse the existing attempt ledger, hashes, retry linkage, configured retry
   count and failure path. Invalid attempts must not commit a checkpoint.
5. Reexecute the original adversarial predicates, focused regressions, full
   suite, TypeScript, build and audits. Compare failures with the untouched base.
6. Submit this scoped correction for Simon's review; do not merge or run live
   providers. No prompt, WP05, report allocation or dependency changes.

The content check implements the Phase 0 principle documented in
`src/orchestrator/runner.ts` (`classifyContent`): missing/empty text is technical,
not inferred agent silence. It belongs in the existing Phase 1A envelope
admission point alongside identity validation, not in another validator or a
prompt-specific scientific rubric. Nonempty text is a transport/content-contract
check, not a claim of semantic quality. ORCH-08 delivered refusal and abstention
remain distinct completed outcomes; this correction does not invent a new
policy for them.

## Evidence inputs and preservation

The four controlling post-merge documents were read in the preserved
`codex/phase1a-postmerge-independent` worktree:
`02_PREVIOUS_FINDINGS_RETEST_MATRIX.md`,
`03_ADVERSARIAL_REGRESSION_RESULTS.md`, `04_REMAINING_DEFECTS.md`, and
`06_FINAL_ACCEPTANCE_VERDICT.md` (under
`docs/phase1a/acceptance-review/post-merge/`).

Original private archive: `AGORA_PHASE1A_POSTMERGE_EVIDENCE_2026-10-23_0019.zip`;
SHA-256 independently rechecked:
`f4e289fc9c33d4def5b6811179ed50544c647b00db82004494dce49553976c48`.
Original scripts are `independent-probes.mts` (P06) and
`postmerge-supplementary.mts` (S04); their predicates are retained unchanged in
the reproduction harness and new regression suite. Old worktrees, raw records
and archives are not edited or overwritten.

Fresh private evidence is under the new feature worktree's ignored
`artifacts/`, not substituted into the original audit. The focused report and
tests are reviewable; raw bundles are engineering fixtures, not scientific data.

## Original reproduction

Original location: `src/phase1a/index.ts:551` at the audited base:
`const content = response.content ?? \`[${response.outcome}]\`;`.
Success content is not checked before commit. Null becomes `[success]`; empty
and whitespace strings are accepted unchanged. The three commits then satisfy
the existing disclosure boundary despite not being valid responses.

Fresh `npx tsx artifacts/p0-t0-probes.mts before` reproduces **4/4 violations**:
P06 and S04 null/empty/whitespace each reach COMPLETE with one disclosure.
Baseline full suite: **535 pass / 2 fail / 537**, 48 files. The two existing
Windows CRLF parser failures are retained separately, not disabled or fixed here.

## P07 investigation and scope boundary

P07 is a different admission defect: a lower-level fixture manifest can supply
report-contaminated t0 text. The canonical WP01 adapter renders `private-t0`
from the hash-validated candidate registry, without report metadata. This
content correction does not make a caller-supplied manifest scientifically
authorized or remove exposure from arbitrary prompts. P07 remains open and
requires a separately scoped admission/fixture policy change; no keyword
filter, prompt rewrite or silent scientific approval is introduced here.

## Verification and final scoped verdict

### Failing evidence before production correction

The new suite was written before the production guard. Its first execution
returned exit 1: **64 failed, 12 passed, 76 total**. These failures directly
exercise missing/malformed success, retries and t0 ordering, not an absent
implementation import or a changed scientific prompt. File:
`artifacts/p0-t0-red.json`.

After the initial production correction, a test-only hash-domain assertion was
corrected: artifact hashes cover the serialized string, while a provider call's
raw-response hash covers the parsed raw object. The final test asserts both
domains with the existing canonical hash utility. No production hash contract
or original adversarial predicate was weakened.

Independent read-only code review found two additional cases at the same
boundary: a non-JSON BigInt/cyclic content value could throw during evidence
serialization, and early identity normalization could suppress the existing
identity-mismatch diagnostic for a combined fault. **12 more tests were added
first**; the expanded suite was RED at **76 pass / 12 fail / 88** in
`artifacts/p0-t0-review-red.json`. This justified a bounded extension of the
same admission guard, not a change to P07 or scientific policy. That intermediate
expanded suite passed **88/88**.

The review then caught a security regression in the intermediate diagnostic
string fallback: field-aware credential redaction was lost after stringification.
Twelve canary controls were added first: **92 pass / 8 fail / 100** in
`artifacts/p0-t0-redaction-red.json`. The fallback was removed entirely. The
existing redactor now retains typed BigInt/circular-reference diagnostics while
applying the same field-aware redaction. Final suite: **100/100 PASS**. The
independent reviewer reran it, checked ordinary JSON/hash compatibility and
non-cyclic aliases, and reported no remaining material issue in this scope.

### Exact production change

Only `src/phase1a/index.ts` changes executable code: **22 added / 3 removed
lines**. The required-content guard is in `Phase1aRuntime.perform()`, immediately
after provider invocation and before identity normalization, attempt recording
and outcome admission. Its existing `redactSecrets()` helper receives the
bounded diagnostic-safety change described below. No dependency/import is added.

For `outcome === 'success'`, a content value that is not a string or whose
`trim().length === 0` becomes the existing `invalid_response` outcome. The
received envelope (including its original `success`, content, identity, finish
reason and native `raw`) is nested as `provider_response` in operator-only raw
evidence. `validation_error`, `content_type` and `content_present` record the
reason and distinguish missing/undefined from null. JSON cannot encode an
undefined value itself; its type and presence are retained explicitly.

The envelope stays structured under `provider_response_format: redacted-json-v1`.
The existing redactor represents BigInt as
`{ non_json_type: 'bigint', decimal: '42' }` and an ancestor cycle as
`{ non_json_type: 'circular_reference' }`. The ancestor set is cleared on return
so repeated non-cyclic aliases are preserved. The existing key/scalar redaction
rules remain in force at every level; no unredacted string fallback or second
secret policy is used. Ordinary JSON serialization/redaction bytes and hashes
are preserved. Diagnostic markers do not claim to reconstruct a non-JSON
object graph or supply scientific output. Existing identity validation still
runs, retaining `adapter_identity_mismatch` alongside the content diagnosis.

Existing secret redaction remains in force: this is an auditable normalized
envelope, not a claim to retain unredacted network bytes. Usage remains in the
existing provider-call record. Existing timestamps, request/raw references,
hashes and `previous_attempt_ids` are unchanged. A malformed response enters
the same technical retry/exhaustion branch already used by `invalid_response`;
there is no checkpoint artifact or committed operation for that failed attempt.

This is the common required-text admission boundary, so it also rejects malformed
success for later operations; no new stage-specific validation system is added.
Valid response text is not trimmed or rewritten. Delivered `refused` and
`abstained` remain distinct under ORCH-08, without changing their legacy behavior
or inferring either from a blank `success`. Existing non-success marker handling
is not offered as evidence of a model-written baseline.

Source identity (Git blob hashes, not a fabricated clean-commit provenance):

| Source | Blob |
|---|---|
| Base `src/phase1a/index.ts` | `d325581f34ce011cc35448849fdac119ea645c86` |
| Tested corrected `src/phase1a/index.ts` | `127e48de63a0f4fb265b0ab607eedb76d3657ef9` |
| Tested new regression file | `0a5ea05d0d5ccee9a71a463769df16363b5fb7e2` |

Tests were executed against these working-tree bytes before the final report
commit. The Phase 0 validation's automatic commit field consequently records
the base HEAD; it must be read together with these tested-source identities,
not represented as a clean committed build of the base.

### Original probes, unchanged predicates

| Original probe | Before correction | After correction |
|---|---|---|
| P06, lower-level B success/null | COMPLETE, three `[success]`, one notice: FAIL | FAILED, no t0 artifacts, no notice: PASS |
| S04, canonical B success/null | COMPLETE, one notice: FAIL | FAILED, no t0 artifacts, no notice/public calls: PASS |
| S04, canonical B success/empty | COMPLETE, one notice: FAIL | FAILED, no t0 artifacts, no notice/public calls: PASS |
| S04, canonical B success/whitespace | COMPLETE, one notice: FAIL | FAILED, no t0 artifacts, no notice/public calls: PASS |

The exact predicate strings in the new harness were compared with the scripts
read directly from the original ZIP: **both match**. Source script SHA-256:

- `independent-probes.mts`:
  `d4c6907e9c1d5375346dedf5eacf0b2d3b88b998fec073a8cc989d94672bb503`.
- `postmerge-supplementary.mts`:
  `7aaeb92251f62a02f0e6f578abb8a97f02b1d46476a6083ba03f51920a6314b1`.
- Original archive's `POSTMERGE_EVIDENCE_SHA256.json`:
  `c67f021ce53e24ef87f1d5e90ca57a1cc3ede6dc9c0a7fcfe68fc7e1217edbbd`.

### New acceptance coverage

`tests/phase1aT0Integrity.test.ts` executes real runtime/ledger/admission logic
with deterministic local provider fixtures. No live provider or model is called.

| Cases | Executed count | Result |
|---|---:|---|
| A–D × null, empty, whitespace, undefined, number, boolean, object, array | 32 | PASS; invalid_response, bounded linked attempts, operator-only raw envelope, no t0 commit/disclosure/public artifact |
| A–D × absent content field | 4 | PASS; distinct presence/type evidence |
| A–D × invalid first, second or third mandatory t0 | 12 | PASS; only preceding valid checkpoints remain, no disclosure/public dispatch |
| A–D × zero or two authorized retries | 8 | PASS; exactly one or three attempts, no extra retry |
| A–D valid controls | 4 | PASS; exact text, three commits, 24 A/C or 31 B/D calls, B/D-only notice in correct order |
| A–D invalid then valid third-t0 retry | 4 | PASS; failed attempt retained, one final checkpoint commit, normal completion |
| A–D × delivered refusal/abstention | 8 | PASS; distinct statuses/text, no technical retry |
| Original P06 plus three S04 predicates | 4 | PASS |
| A–D × BigInt/cyclic rejected content, after review | 8 | PASS; labelled diagnostic evidence, linked invalid attempts, no public dispatch |
| A–D × malformed content plus identity mismatch, after review | 4 | PASS; both causes preserved |
| A–D × null/BigInt/cycle credential-canary controls | 12 | PASS; credentials redacted, harmless native fields retained |
| **Total** | **100** | **100 PASS** |

### Executed verification and compatibility

Environment: Windows PowerShell, Node **v24.18.0**, npm **11.16.0**, locked
Vitest **4.1.12**, `core.autocrlf=true`. `npm ci` succeeded; no dependency or
lockfile upgrade was made. Its install-script policy warning did not prevent
build or SQLite execution.

| Command / evidence | Actual result |
|---|---|
| `npx tsx artifacts/p0-t0-probes.mts before` | Collection exits 0; **four FAIL predicates** (not a passing acceptance) |
| `npx vitest run tests/phase1aT0Integrity.test.ts --reporter=json --outputFile.json=artifacts/p0-t0-red.json` before correction | Exit 1; **12 pass / 64 fail / 76** |
| Initial same new-file command with `p0-t0-green.json` | Exit 0; **76/76**, before review hardening |
| Expanded new-file command, `p0-t0-review-red.json`, before hardening | Vitest exit 1; **76 pass / 12 fail / 88** |
| Expanded new-file command, `p0-t0-review-green.json`, after hardening | Exit 0; **88/88** |
| Credential-canary RED, `p0-t0-redaction-red.json` | Exit 1; **92 pass / 8 fail / 100**, before final correction |
| Final new-file run, `p0-t0-verified-green.json` | Exit 0; **100/100** |
| Final focused command below | Exit 0; **187/187**, seven files |
| Full suite, before production edit: `npx vitest run --reporter=dot --reporter=json --outputFile.json=artifacts/p0-t0-baseline-suite.json` | Exit 1; **535 pass / 2 fail / 537**, 48 files |
| Initial corrected full suite, `p0-t0-final-suite.json` | Exit 1; **611 pass / 2 fail / 613**, 49 files, before review hardening |
| Intermediate corrected full suite, `p0-t0-review-final-suite.json` | Exit 1; **623 pass / 2 fail / 625**, 49 files |
| Final corrected full suite, `p0-t0-verified-full.json` | Exit 1; **635 pass / 2 fail / 637**, 49 files |
| `npx tsc --noEmit -p tsconfig.json` | Exit 0 |
| `npm run build` | Exit 0 |
| `npm audit --omit=dev --audit-level=high` | Exit 0; **0 vulnerabilities** |
| `npm audit --audit-level=high` | Exit 0; **0 vulnerabilities** |
| `git diff --check` | Exit 0 |
| `npx tsx artifacts/p0-t0-probes.mts after` | Collection exits 0; **four PASS predicates**, P07 separately STILL_OPEN |
| Phase 0 compatibility campaign below | Exit 0; **ready=true, Gates 1–3 PASS** |

```powershell
npx vitest run tests/phase1aT0Integrity.test.ts tests/phase1aWp01.test.ts tests/phase1aRuntime.test.ts tests/contextLockedReplay.test.ts tests/phase1aWp02Adapter.test.ts tests/phase1aWp03.test.ts tests/phase1aDurability.test.ts --reporter=json --outputFile.json=artifacts/p0-t0-final-focused.json

$env:AGORA_DB_PATH = Join-Path (Get-Location) 'artifacts/p0-t0-phase0-verified.sqlite'
npm run validate -- --config configs/agora_phase0_mock_baseline.yaml --fault-config configs/agora_phase0_faultdemo_mock.yaml --out artifacts/p0-t0-phase0-verified
```

Focused breakdown: new P0 **100**, WP01 **23**, WP02 adapter **16**, runtime
**24**, WP03 **9**, durability **2**, unchanged WP05 replay regressions **13**.
Existing focused regressions remain **87/87**. The full suite reran all **537**
historical tests: same **535** pass and exact same two failures. Historical
Phase 1 behavioral/campaign/UI suites are **17/17**, **18/18**, **2/2**; Phase 0.1
acceptance suite is **11/11**. There are **no additional full-suite failures**.

The two Windows failures remain `tests/specTraceability.test.ts`:
“accounts for every normative requirement exactly once” and
“keeps the implemented status totals explicit”. The existing LF-only parser
leaves CR in anchored table rows, returning no parsed rows. Neither the parser,
matrix, test thresholds, line endings nor test selection was changed to hide
this. Full local-suite status is **not green**; Linux CI is separate evidence.

Phase 0 mock compatibility IDs:

- Baseline: `run_1b6fb45d-d6fc-4fe7-a4a5-6905ba3de8d8`.
- Rerun: `run_1c3ae116-6e9a-472d-9c04-98dbb9503f14`.
- Fault: `run_8eb3a5ad-5295-45b2-b7ae-c4ffcde3e8f2`.
- Baseline/rerun configuration fingerprint remains
  `sha256:9aec2b3420a41a0d97835c3815cc8702b899c25bb5de2fac6e8bf4da1c57be5c`.

### Raw evidence receipt

New private archive in the outer AGORA workspace:
`AGORA_P0_T0_REMEDIATION_EVIDENCE_2026-10-23_VERIFIED.zip`;
**252 files, 1,530,692 bytes**; SHA-256:
`bc07fb1b9e547a03b23c4d8638bd1a260d3d038554f374ab99c6d3536076ada4`.
It contains the reproduction harness and before/after bundles, RED/GREEN/full/
focused JSON, verification transcript, P07 observation, Phase 0 exports and
SQLite, and exact tested runtime/test source. It is a private local evidence
receipt, not an assertion of immutable institutional archival or remote upload.
The earlier 90-file and 171-file intermediate archives are also preserved
separately, not overwritten or represented as the final tested-source package.

| Evidence file | SHA-256 |
|---|---|
| `artifacts/p0-t0-probes.mts` | `7a67d11a693c454b21e042324918aa80cf11ce9b68da8f55a6b80d666767192a` |
| `artifacts/p0-t0-red.json` | `864e68a44b96db63ea23ae31419847327516a3b2cf18e6548d9aa7ef836fd505` |
| `artifacts/p0-t0-green.json` | `dfb61a6f352ab9fe16ca3210a22c68389f7b030c7f1602f10ba93d0c313caeed` |
| `artifacts/p0-t0-focused.json` | `03ee423f027810c45a8c18b983e344361269808aac70d31f5648ddda7b4f255c` |
| `artifacts/p0-t0-baseline-suite.json` | `02afeb2ce6dbdeee7ca98ec0e63a1822f6d3fee134cfda0fa0b87cc585e34987` |
| `artifacts/p0-t0-final-suite.json` | `b56ab722823ec3ecbdde9d44d9af40acfc809bf30029cdfe038fea14d4db7559` |
| `artifacts/p0-t0-verification.log` | `b3571eb45e0490ccf69856720bcdb2e5896b8463dbfa09bdddebfd96fb3811cc` |
| `artifacts/p0-t0-review-red.json` | `37726890383eaefffbe1f23cccf97996b04385b48f6a8e12c4e9f6d8495242ab` |
| `artifacts/p0-t0-review-green.json` | `3b99f97aa8bfedd1aa1cc8787b9f6784da939d080c9e7b7486d2815dc9ba55de` |
| `artifacts/p0-t0-review-focused.json` | `79a6c58022ab3f6a62304ef6fe69fb0cee75c21f423ef71fd58245f8ff8715b0` |
| `artifacts/p0-t0-review-final-suite.json` | `3b2201c9a9862fb11bf45d83d0d23212f0b80f800dd3a0270a8467e2ca286427` |
| `artifacts/p0-t0-review-verification.log` | `8ae56b5aa8e4ccfe58fba78e73a60a07d9af8a03360509b0f2e36968d8ebb821` |
| `artifacts/p0-t0-redaction-red.json` | `97ee3dd1d885e1552de44ca099c4622bf309d300acd9040fc0ae955051cfe279` |
| `artifacts/p0-t0-verified-green.json` | `93db710bffe59cdd9360b2f6123ec027528f33b37e0203d254ed734cb69e7d86` |
| `artifacts/p0-t0-final-focused.json` | `ba32ea3f0ec324e57bb0cdcd42bf2d5833eac10da034d06f4d2791ad45665f6d` |
| `artifacts/p0-t0-verified-full.json` | `ad87c8556f25d5db0118179a5a767af880d647921c9d92cf3b5169dc5795d168` |
| `artifacts/p0-t0-verified-checks.log` | `8aba1035daa94216dcabf2db0f60512a7a5a8112a8ace6c48f98f34f2fbc8199` |

## Scope inventory and remaining limitations

| Changed path | Reason |
|---|---|
| `src/phase1a/index.ts` | Existing WP02 admission guard and its redactor's diagnostic safety, 22 added / 3 removed lines |
| `tests/phase1aT0Integrity.test.ts` | 100 focused real-runtime regressions and original predicates |
| `docs/phase1a/acceptance-review/P0_T0_BASELINE_REMEDIATION_2026-10-23.md` | Specification, reproduction, verification, custody and scoped verdict |

No Phase 0 source, historical Phase 1 source, WP01 candidate, WP03 workflow,
WP05, dependency/lockfile, root README, shared CI policy or other branch is
changed. Existing work and audit evidence remain preserved.

Remaining t0-related limits are **not silently closed**:

- **P07/P11/S03:** arbitrary lower-level manifest admission/exposure remains
  unsafe. Fresh P07 still delivers the contaminated fixture text. Canonical
  tests do not prove universal admission protection.
- **P22:** the preexisting terminal-state/reinvocation policy remains separate;
  this patch does not authorize continuing a failed run or repair that guard.
  Automatic retries within the tested invocation are bounded by the manifest.
- Nonempty text is not semantic adequacy, scientific approval, or a new refusal/
  abstention interpretation. Existing non-success handling remains unchanged.
- Unknown token usage, broader malformed envelope/SDK schema handling,
  secret-redaction issues and evidence tampering are not generally remediated by
  this required-success-content check. Rejected BigInt/cyclic content retains a
  labelled diagnostic representation, not a reconstructable native JSON object.
- No live provider was used; no Model X binding, candidate prompt approval or
  scientific freeze was inferred. Other post-merge audit findings, including
  WP05 replay defects, retain their own status.

**Conclusion:** the original P06/S04 failure is no longer reproducible for its
unchanged predicates; all added required-content regressions and existing
focused regressions pass. This removes that specific malformed-success path
to fabricated t0 evidence and premature public discussion. Overall apparatus
acceptance remains **REQUEST_CHANGES**, scientific approval remains pending,
and live pilot authorization remains **NOT_AUTHORIZED**. Submit for Simon's
review; no automatic merge.
