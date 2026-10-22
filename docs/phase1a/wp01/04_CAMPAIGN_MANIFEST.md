# WP01.04 — Campaign and run manifests

## Three manifest levels

1. **Study contract:** stable requirements and condition matrix.
2. **Campaign manifest:** a planned campaign with contract, decision register,
   candidate prompt registry, counts, provenance and lifecycle.
3. **Run manifest:** one condition/replicate realization with participant slots,
   order candidate, logical model families, deployment bindings, agenda,
   prompt-registry hash, config hash and manifest hash.

Schemas are in `src/phase1a/wp01/manifests/campaign.ts`.

## Hash and immutability contract

The existing Phase 0 `canonicalize()` and `configHash()` utilities are reused.
Run and campaign hashes exclude only their own hash field. A validator
recomputes them and rejects a mutation. A scientific profile additionally
requires real, complete bindings, a frozen study contract, a resolved notice
timing, and `FROZEN` status.

Synthetic profiles may contain explicit synthetic bindings for GEMMA, GEMINI and
the unresolved logical MODEL_X reference. They are not real provider evidence.
Report-stage participant allocation is explicitly `UNRESOLVED`; D08 remains
open rather than assigning a writer or reviewer in the synthetic fixture.
The campaign field `timing_disposition` distinguishes the selected method from a
historical noncanonical timing candidate.

## Generated fixture paths

Run:

```text
npm run phase1a:fixtures
```

Outputs (ignored local artifacts):

```text
exports/phase1a_wp01_synthetic/after_t0_before_public.campaign.json
exports/phase1a_wp01_synthetic/before_t0.campaign.json
exports/phase1a_wp01_synthetic/README.txt
```

Each JSON contains 12 planned run manifests. The
`after_t0_before_public.campaign.json` file is the selected Option A sequence:
the report notice occurs after all three `t0` checkpoints and before public
discussion. The `before_t0.campaign.json` file is retained as
`HISTORICAL_NONCANONICAL` design-decision evidence and is not an approved
campaign. No messages, provider outputs, event rows, or scientific results are
generated.

## Consumer boundary

WP02 consumes the run agenda and lifecycle and owns core orchestration plus
model-provider integration. WP03 consumes the workshop/report stages, prompt
references and decision status and owns workflow semantics; it does not own
provider routing. WP04 consumes scope and source-link contracts; WP05 consumes
immutable hashes and provenance; WP06 consumes analysis units, probe/report
declarations and decision status.
