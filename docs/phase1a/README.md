# AGORA Phase 1A — Reimagining Humans

## WP01 implementation status

**Implementation status:** `IMPLEMENTATION_READY — SCIENTIFIC_FREEZE_PENDING`

This directory is the entry point for the revised October Phase 1A pilot. It is
separate from the historical role-based implementation under `docs/phase1/` and
does not alter the closed Phase 0 evidence or configuration hashes.

WP01 implements the study contract, pre-freeze decision register, candidate
prompt registry, provider-neutral deployment contracts, deterministic agenda,
campaign/run manifests, synthetic planning fixtures, and the interfaces that
WP02–WP06 consume. WP02 owns core orchestration and model-provider integration.
WP03 now implements the provider-neutral workshop/report plan and context rules.
WP04–WP06 own context persistence, replay and analysis; their scientific gates
remain separate from WP03's engineering baseline.

## Scientific boundary

The current contract represents four conditions, three participants per run,
three repetitions per condition, and six public rounds. It plans 12 runs, 216
public opportunities, 90 private elicitation opportunities, 24 report-stage
invocations, and 330 expected model invocations before retries. These are
planning counts, not model results.

The exact deployments, Model X, prompt approval, speaking order, budgets,
private probes, replay policy, codebook, and scientific freeze authority remain
explicit decisions. Simon confirmed D13 Option A: the report notice occurs
after all three private `t0` checkpoints and before public discussion in report
arms (`AFTER_T0_BEFORE_PUBLIC`). The prior `BEFORE_T0` sequence remains only as
`HISTORICAL_NONCANONICAL` evidence; D17 is retired in the register's
consolidation note. The overall scientific freeze remains pending.

## Deliverables

- [WP01 README](wp01/README.md)
- [WP03 workshop and report workflow](wp03/README.md)
- [WP03 engineering decisions](wp03/DECISIONS.md)
- [WP03 acceptance record](wp03/ACCEPTANCE.md)
- [Study contract](wp01/01_STUDY_CONTRACT.md)
- [Decision register](wp01/02_DECISION_REGISTER.md)
- [Candidate prompt registry](wp01/03_PROMPT_REGISTRY.md)
- [Campaign and run manifests](wp01/04_CAMPAIGN_MANIFEST.md)
- [WP01 interface contracts](wp01/05_INTERFACE_CONTRACTS.md)
- [Acceptance tests](wp01/06_ACCEPTANCE_TESTS.md)
- [Protocol-to-code mapping](wp01/07_PROTOCOL_TO_CODE_MAPPING.md)
- [Integration records](integrations/README.md)

## Source precedence

1. Revised October Phase 1A scientific direction.
2. Technical Architecture and Experimental Protocol v0.9, where it is
   consistent with the revised direction.
3. October implementation meeting decisions, only where actually resolved.
4. October 16 engineering masterclass for implementation practice, not as a
   scientific approval record.
5. Earlier five-participant role-based Phase 1 remains historical and is
   preserved; it is not silently converted into the revised pilot.
6. Phase 0 remains a closed technical milestone.

## Verification commands

```text
npx vitest run tests/phase1aWp01.test.ts --reporter=dot
npx tsc --noEmit -p tsconfig.json
npm run phase1a:fixtures
```

The fixture command writes ignored offline planning artifacts under
`exports/phase1a_wp01_synthetic/`. It performs no provider calls and does not
create event, message, or scientific-result records.
