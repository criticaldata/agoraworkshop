# Phase 1B Transition Contract

Phase 1B is not implemented or eligible for execution in this closure. The
eligibility predicate is explicit in `phase1BEligibility`; tests and mock output
cannot satisfy it. If human review fails the frozen criterion, the state is
`HUMAN_VALIDATION_FAILED_RECALIBRATION_REQUIRED`; the old instrument remains
immutable and any revised instrument must receive a new version and hash.

Transition requires: P1-A PASS, P1-B PASS, P1-C PASS, P1-D
`CONFIRMATORY_READY`, a locked and externally archived dataset, complete human
validation, approved calibration-derived N/precision, a reviewed SAP, and an
explicit scientific sign-off. No code path may infer eligibility from tests,
mock outputs, uploaded reports or a null effect.
