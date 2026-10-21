# WP01.07 — Protocol-to-code traceability

| Requirement | Source | Code | Test/evidence | Consumer | Status |
|---|---|---|---|---|---|
| Four conditions A–D | Revised blueprint; Protocol §2 | `conditions/matrix.ts` | contract and campaign tests | WP02/WP03/WP06 | IMPLEMENTED |
| Three agents and six rounds | Blueprint; Protocol §3 | `contracts/study.ts`, `scheduling/agenda.ts` | agenda counts | WP02/WP03 | IMPLEMENTED |
| 12 runs / 3 repetitions | Blueprint; mandate §3 | `manifests/campaign.ts` | synthetic campaign test | WP02/WP05 | IMPLEMENTED |
| t0/t6/tR private checkpoints | Protocol §§3–4 | `contracts/study.ts`, `agenda.ts` | private-stage counts | WP03/WP04/WP06 | IMPLEMENTED |
| Report draft + two reviews + revision | Protocol §3.3 | `agenda.ts`, report prompts | report counts | WP02/WP03/WP06 | IMPLEMENTED |
| Deterministic host | Meeting slide 5; mandate §3 | study contract, host prompt | moderator policy assertion | WP02/WP03 | IMPLEMENTED |
| No tools/web/roles/breakouts | Protocol §4 | interaction policy | contract assertion | WP02/WP04 | IMPLEMENTED |
| Provider neutrality | Mandate §4 | deployment bindings | provider-leakage checks | WP02/WP03 | IMPLEMENTED |
| Model X unresolved | Mandate §4 | deployment validator, D07 | scientific-profile negative test | WP02 | IMPLEMENTED |
| Candidate prompt registry | Mandate §5.3 | `prompts/registry.ts` | hash/render/leakage tests | WP02/WP03/WP04 | IMPLEMENTED |
| t0 notice timing | Mandate §5.2 | D13, agenda builder | both timing tests | WP02/WP03/WP06 | IMPLEMENTED / OPEN |
| Source-message linkage | Mandate §5.5 | `contracts/interfaces.ts` | schema test | WP04/WP05 | IMPLEMENTED |
| Provider adapter boundary | Mandate §4 | `contracts/interfaces.ts` | descriptor test | WP02 | CONTRACT ONLY |
| Fault taxonomy boundary | Mandate §7 | `fixtures/faults.ts` | four fixture test | WP02 | AWAITING_INTEGRATION |
| Phase 0 compatibility | Mandate §4.1 | reuse `src/config/hash.ts`; no old files changed | 46 files / 483 tests | all | VERIFIED REGRESSION |
| G0 freeze readiness | Protocol §8 | lifecycle/status/decision register | validation | governance | PENDING_APPROVAL |
| G1 execution contract | Protocol §8 | public WP01 index and manifests | interface docs | WP02 | AWAITING_INTEGRATION |
| G2 visibility | Protocol §8 | scope/link contract and renderer boundary | privacy negative test | WP04 | AWAITING_INTEGRATION |
| G3 comparability | Protocol §8 | comparison rules, shared namespace | manifest/prompt tests | WP02/WP03/WP06 | IMPLEMENTED CONTRACT |
| G4 construct evidence | Protocol §8 | analysis-unit/probe declarations | probe approval open | WP06 | OPEN |
| G5 codebook/calibration | Protocol §8 | decision register only | no fake codebook | WP06 | OPEN |
| G6 analysis readiness | Protocol §8 | nested units and handoff | interface docs | WP06 | AWAITING_INTEGRATION |
| G7 claim boundaries | Protocol §8 | docs/lifecycle/limitations | documentation review | WP06 | IMPLEMENTED BOUNDARY |
| G8 reconstruction | Protocol §8 | hashes/provenance fields | replay contract only | WP05 | AWAITING_INTEGRATION |

`PASS` here means a local contract or test is implemented. It must not be
reported as a live scientific gate until the responsible work package and
approved protocol provide the required evidence.
