# Response to Mateo’s review — 12 November 2026

Status: requested changes implemented in the review candidate; off-Mac recovery outstanding; no scientific approval and no collection.

Source: Mateo’s incoming WhatsApp message at 21:09:56 America/Guayaquil on 12 November 2026, stanza `3EB029CDC143170C32F9F6`, read from the local WhatsApp database. The full source is retained privately; this document paraphrases it. His message confirms receipt and explicitly withholds permission to collect. He accepts the 12-workshop exploratory scope and plans a separate decision on the exact hash after these points and model assignments are settled.

| Request | Response | Remaining decision/evidence |
| --- | --- | --- |
| Keep draft-only review, remove unverifiable fidelity demands | Candidate 3 limits both identical review prompts to clarity, consistency and draft-supported reasoning. Revision cannot infer omitted positions. Runtime checks demonstrate one shared draft per reviewer and draft + two reviews for revision. | Mateo reviews exact wording. |
| Human coders assess transcript-to-report fidelity | The codebook requires the public trace and final report, exact source spans and independent original ratings; reviewer comments are ineligible evidence. | Approve the frozen codebook and analysis. |
| Freeze before collection | Codebook bytes/hash, rules, missingness, inference limits and implementation/dependency hash are bound into the approved plan hash. Changed content or source invalidates approval. | Separate scientific decision referencing the final hash. |
| External calibration before any pilot exposure | Operator-only custody until two coders’ external-material calibration and a dated release record. No pilot outputs, excerpts or summaries may be used for calibration. | Identify/calibrate coders before release; not claimed completed. |
| Recover archives if Mac unavailable | New launch gate requires independently retrieved, decrypted and verified off-Mac evidence. Existing Mac-based restore does not satisfy it. | Simon chooses recovery-key location; perform the recovery test. |
| Settle models | A/B: three Gemma 3 27B IT instances. C/D: Gemma 3 27B IT, Qwen3 32B, Llama 3.1 8B Instruct. All Q4_K_M, pinned deployment digests. | Mateo approves Qwen substitution and Llama as Model X. |

## Frozen analysis rules

The approved plan contains the exact WP06 codebook. The implementation hash binds `wp06/annotations.ts`, `wp06/reliability.ts` and the other analysis source. Before collection, approve:

- The workshop as independent unit: 12 planned workshops, three per cell, descriptive exploratory results only. Retain all failed/partial/not-started rows; no automatic replacements and no treating turns/propositions as independent replicates.
- A complete public proposition inventory with exact origin spans; final-report retention `(FULL + PARTIAL) / all registered propositions`, with FULL/PARTIAL/DISTORTED counts separately.
- Dissent preservation among propositions still contested/minority at the end of round six. Zero denominator is undefined. Incomplete evidence and unresolved/unassessable labels make the affected metric unavailable, never zero or perfect preservation.
- At least two independent ratings; adjudication is separate, references all originals and uses a different adjudicator. Report reliability from original assessable ratings only: nominal Krippendorff alpha, observed agreement, pairwise confusion matrices, missing and NOT_ASSESSABLE counts. No pairable ratings or no label variation gives undefined alpha. Do not use adjudication to improve agreement.
- No validated numerical position-change score, causal identity claim, latent-belief inference, inferential tests or confidence intervals based on propositions as independent runs.

Calibration occurs on external material under these frozen definitions. Keep material identifiers/digests, original ratings, disagreements, resolution notes and completion attestations. No numerical calibration pass threshold is invented here: Mateo must accept the documented calibration/release basis. If calibration reveals a substantive codebook or analysis change, obtain a new scientific decision; preserve the original collected-plan version and identify any later analysis as an amendment, not a pre-collection freeze.

## Custody and release

Keep raw archives and outputs operator-private; do not give future coders pilot excerpts, summaries or dashboards before calibration. Record coder identities and external calibration in a separate record referencing the exact approved plan and codebook hashes. This avoids modifying the frozen plan after collection. Record release time and each coder’s first pilot access only after calibration has completed for both. The [blank record](calibration-release.template.json) is a template, not evidence of completed work.

File permissions and launch checks do not prove human blinding or independence. The operator must document actual custody and access. Any prior pilot exposure is a deviation to disclose to Mateo before release, not something to erase or attest around.

## Remaining launch blockers

The plan and prompt preview have been regenerated after the requested changes. They are a new review candidate, not the previously emailed plan. Complete off-Mac recovery, regenerate the final plan hash, then obtain Mateo’s separate scientific decision on that hash and model assignments. No receipt message, scope agreement or software test substitutes for this approval.
