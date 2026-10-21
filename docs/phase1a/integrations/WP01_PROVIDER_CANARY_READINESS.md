# Integration WP01-PROVIDER — canary readiness

**Status:** `BLOCKED_EXTERNAL_ACCESS` / `PENDING_SCIENTIFIC_APPROVAL`

WP01 is provider-agnostic. It defines the binding shape and rejects unresolved
bindings for a scientific freeze; it does not choose Gemma/Gemini versions,
Model X, a provider, endpoint, credentials, or GPU deployment.

## Offline checks available now

- synthetic bindings for all three logical families;
- explicit distinction between logical family and deployment details;
- provider/model leakage checks in candidate prompts;
- scientific-profile rejection of synthetic or unresolved bindings;
- deterministic 12-run manifests and hashes.

## Required before a real canary

1. Scientific approval of D02 and D07, including exact deployment provenance.
2. Approval of prompt candidates (D06), probes (D14), order (D05), budgets
   (D09), and notice/t0 order (D13; D17 is its retired duplicate label).
3. A WP02 provider integration that implements the WP01 binding contract, plus
   a WP03 workshop/report workflow that consumes the approved agenda.
4. Authorized access, credentials and an execution budget.
5. A separate canary manifest and evidence bundle; no synthetic fixture may be
   relabeled as live.

The existence of a GPU node or managed API does not prove that a named model is
available, authorized or scientifically equivalent. No external model calls
were made by this WP01 implementation.
