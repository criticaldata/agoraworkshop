# Human Validation Package Manifest

The package contains the locked snapshot hash, blinded reviewer assignments,
codebook/rubric versions, reviewer authentication IDs outside the public bundle,
independent submission hashes, disagreement queue, adjudication records and
reliability report. It must not contain credentials or unblinded role mappings in
the reviewer projection.

Required acceptance: two reviewers, identical calibration subset, complete RF/ICR
coverage, alpha and pairable-unit thresholds, disagreement inspection, append-only
adjudication and an explicit final package hash.
