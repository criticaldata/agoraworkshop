# Human Validation Package Manifest

The application creates one immutable `agora-human-validation-package-v1` per
locked snapshot through the scientific-admin assignment UI/API. The package
contains the locked snapshot hash, blinded reviewer assignments,
codebook/rubric versions, reviewer authentication IDs outside the public bundle,
independent submission hashes, disagreement queue, adjudication records and
reliability report. It must not contain credentials or unblinded role mappings in
the reviewer projection.

Required acceptance: two reviewers, identical calibration subset, complete RF/ICR
coverage, alpha and pairable-unit thresholds, disagreement inspection, append-only
adjudication and an explicit final package hash. The public reviewer projection
omits reviewer membership and the protected condition/role mapping; the full
manifest is retained for authorized administrators and exported by the review
bundle.
