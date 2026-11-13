# Calibration, coder packets and annotation checks

This extension turns the preparatory calibration/release form into an executable operator workflow. It makes no model calls and sends no messages. The collection candidate already emailed to Mateo remains unchanged in the separate `agora-experiment-readiness` checkout at commit `79b3ea4cc9fd4453a8834fe66d88be6453a8b2b7`, plan hash `sha256:199b1bff0fccc103fe534b15a54add18c5a1f5fb2cb3fdf1c544c556f13bc9a9`.

This branch adds operator tooling; it is not a replacement collection checkout. Its source hash differs from the emailed candidate. Do not launch the existing collection plan from this branch or reseal it merely to clear the mismatch. Integrating source changes into collection requires a new reviewed plan hash. The tool reads the archived plan and evidence without modifying either and uses the existing WP06 codebook, definitions and reliability calculations unchanged.

## 1. Prepare the record, without granting access

Run from this checkout:

```sh
npm ci
npm run build
node dist/phase1a/annotationWorkflow/cli.js init \
  /private/collection/plan.json /private/calibration/release.json
```

The file starts as `TEMPLATE_NOT_COMPLETED`; it contains no invented approval, coder identity, calibration completion or release date. Files are created with mode 0600, new directories with mode 0700, and existing outputs are never overwritten.

Complete the record with actual evidence:

- Exact archived plan and codebook hashes, designated operator, and at least two distinct coder identities.
- External calibration material IDs/source references and checksum-pinned files. Pilot material is not external calibration material.
- Each coder’s calibration completion time and documentary references for calibration and no prior pilot exposure.
- Original calibration ratings, disagreement/resolution notes and the scientific acceptance reference for calibration.
- Operator authorization and release time, after scientific approval and after every coder has calibrated. Record actual first pilot access separately; leave it null until access occurs.
- An explicit allowlist of run IDs and evidence hashes for the artifacts being released. Obtain these from operator-only WP06 integrity analysis; do not distribute the raw evidence bundles.

Every documentary reference has this shape:

```json
{"path": "relative-to-release-file/calibration-record.json", "sha256": "64 hexadecimal SHA-256 characters"}
```

Absolute paths are also supported. The tool reads referenced files locally and checks their bytes; it does not upload them. Keep these materials in private operator storage. Set `status` to `RELEASE_AUTHORIZED` only after the operator has actually authorized release, not as a way to make a test pass.

```sh
node dist/phase1a/annotationWorkflow/cli.js check \
  /private/collection/plan.json /private/calibration/release.json
```

A nonzero exit blocks packet preparation. Missing/changed evidence, stale plan/codebook hashes, absent scientific approval, duplicate coders/runs, unauthorized operators, future dates, calibration after release or pilot access before release are rejected. Disclosed deviations require scientific resolution; there is no automatic waiver. The check never writes approval records or advances a status automatically.

This validates documentary consistency. It cannot authenticate a human approval, prove coder independence or prove that a person never saw pilot material. Those remain documented human responsibilities. It also does not replace the collection runner’s source/deployment/protocol validation or independently certify that an external source is unrelated to the pilot.

## 2. Prepare the same proposition inventory for independent ratings

Use the existing operator annotation template, then enter human-identified propositions and exact origin spans:

```sh
umask 077
node dist/phase1a/wp06/cli.js --annotation-template \
  /private/collection/2-evidence.json CODER_A CODER_B \
  > /private/calibration/inventory.json
```

The inventory must contain no ratings or adjudications when exported to coders. Both packets use the same inventory; issues in proposition segmentation/coverage must be resolved by the operator before final independent rating. This tool neither identifies propositions nor generates semantic labels. A `DRAFT` inventory stays draft and makes final metrics unavailable; completeness is a human attestation.

## 3. Generate each coder’s packet

```sh
node dist/phase1a/annotationWorkflow/cli.js packet \
  /private/collection/plan.json /private/calibration/release.json \
  /private/collection/2-evidence.json /private/calibration/inventory.json \
  CODER_A /private/packets/coder-a/run-2.json
```

Repeat for the second authorized coder into their separate directory. Each packet contains the common codebook/inventory, committed public turns, public opportunity status/missingness, the successful final report if present, and a blank response template. Artifact IDs and exact text are preserved for span references. Private checkpoints, raw provider requests/responses, draft reports, isolated reviews and the other coder’s ratings are excluded. There is no promise of blinded model identity: participants’ public wording is not rewritten.

The tool reconstructs the expected frozen runtime manifest from the archived plan and decision before export, and rejects evidence from another protocol even if its run ID matches. The packet is checksum-bound to its coder, release record, plan and evidence. It is an ordinary local JSON file; creating it does not send it or create an account/ACL for a coder. The operator must share only the intended coder’s file after authorization and record actual access. Existing directory permissions are not rewritten. Keep raw archives and calibration records out of coder directories.

Missing/failed public opportunities stay in the packet; a missing final report is null. Do not replace these with fabricated text or infer absent behavior from missing data. Engineering fixtures are rejected by the scientific release command; demonstration records belong in tests only.

## 4. Preserve original responses and check annotations

Coders return separate completed response files. Retain each original without editing it. The operator transcribes/combines their ratings into the existing WP06 annotation schema, preserving original annotation IDs and the common proposition inventory. This version deliberately does not auto-merge conflicting inventories or decide semantic equivalence. Adjudications remain separate and must reference every original rating and an independent adjudicator.

```sh
node dist/phase1a/annotationWorkflow/cli.js analyze \
  /private/collection/plan.json /private/calibration/release.json \
  /private/collection/2-evidence.json /private/annotations/run-2.json \
  /private/analysis/run-2.json
```

The calibrated coder set and released evidence must match. WP06 then checks labels, evidence spans, complete-target review and adjudication provenance. The output retains unresolved judgments, missingness and unavailable metrics. It does not overwrite source ratings or improve reliability using adjudication. Its existing `PENDING_SCIENTIFIC_APPROVAL` label is retained; the separately referenced plan/release records carry the actual human decisions.

## Verification

The tests use clearly marked synthetic approvals and calibration documents only in temporary directories; they never become operational evidence. Tests cover missing/stale approvals, proof-file changes, chronology, duplicate identities, private-content exclusion, peer-rating exclusion, missing opportunities, coder mismatches, unavailable metrics and private no-overwrite CLI output. No scientific collection, coder calibration or outward communication is performed by testing.
