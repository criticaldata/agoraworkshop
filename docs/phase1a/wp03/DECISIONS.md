# WP03 engineering decisions

These decisions bind the WP03 engineering baseline. They do not replace the WP01
scientific decision register.

| ID | Decision | Engineering status | Scientific status | Revisit trigger |
|---|---|---|---|---|
| `WP03-D01` | Rotate writer and reviewer roles across replications 1–3: P1/P2/P3 each writes once; the next two slots review in order. | ACCEPTED | D08 approval pending | Research team selects a different allocation policy |
| `WP03-D02` | Build report contexts only from committed artifacts: public history for draft, one draft for each review, draft plus both reviews for revision. | ACCEPTED | Consistent with current contract | WP01 changes report-stage semantics |
| `WP03-D03` | Treat delivered refusal as a terminal review artifact; transport/provider failure does not create a review artifact. | ACCEPTED | Measurement interpretation belongs to WP06 | Outcome taxonomy changes |
| `WP03-D04` | Keep WP03 provider-neutral; WP02 performs invocations and retries, WP04 persists evidence. | ACCEPTED | Not a scientific choice | Package ownership changes |

## Rationale for WP03-D01

A fixed writer would confound participant/model slot with report authorship. The
three-replication design permits a deterministic Latin-style rotation without
adding calls or changing prompts. The runtime records the policy and exact roles
so the decision can be audited or superseded without ambiguity.
