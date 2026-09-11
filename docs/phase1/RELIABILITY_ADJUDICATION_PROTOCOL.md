# Reliability and Adjudication Protocol

Two authenticated reviewers independently code the same frozen package. The
assignment service removes condition, target role, prompt and aggregate outcome
fields. A reviewer cannot read the other reviewer's label before submitting.

All RF and ICR eligible units are double-coded. Krippendorff alpha is computed
per criterion/category before adjudication using ordinal 0/1/2 for RF and nominal
relation coding for ICR. RF/ICR pass requires alpha >= 0.80, at least 30 pairable
units per stratum and complete eligible coverage. `[0.667, 0.80)` triggers
codebook inspection and recalibration; `<0.667` fails. Relation alpha is
diagnostic/exploratory.

Disagreements are inspected and then adjudicated in a separate append-only record.
Original labels, rationales and pre-adjudication alpha remain unchanged. A new
rubric version is required if ambiguity changes the coding rule.
