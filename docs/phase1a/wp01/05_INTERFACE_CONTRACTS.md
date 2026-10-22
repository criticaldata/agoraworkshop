# WP01.05 — Interfaces for WP02–WP06

The stable import surface is `src/phase1a/wp01/index.ts`. The following are
public contracts; they are not implementations of the consuming work packages.

## WP02 — core orchestration and model-provider integration

Input: validated `StudyContract`, `CampaignManifest`, `RunManifest`, and
`RunStage[]`. The host owns procedural stage transitions. A scheduled public
opportunity is not a guarantee of substantive text. WP02 also owns the
provider-neutral runtime boundary: adapter selection, model invocation,
provider/deployment provenance, retry classification and invocation evidence.

Output requirement: each opportunity must preserve a stable opportunity ID,
trace ID, invocation classification, provider/deployment provenance, and
message/delivery linkage.

## WP03 — workshop and report workflow

WP03 consumes the workflow portions of the WP01 contract:

- six public rounds and the fixed `t0`, `t6` and `tR` checkpoints;
- report draft, two independent reviews and revision stages;
- the confirmed `AFTER_T0_BEFORE_PUBLIC` notice timing: P1/P2/P3 `t0`, then
  the report notice in B/D, then public round 1; A/C receive no condition notice;
- candidate prompt references and the deterministic host agenda.

WP03 owns workshop and report workflow semantics, but does not own provider
routing, adapter invocation or deployment selection. WP02 executes WP03's
workflow through the runtime boundary above.

WP02 integrates the deployment boundary defined by WP01:

- `ModelFamilyReference`: `GEMMA`, `GEMINI`, or unresolved `MODEL_X`;
- `DeploymentBinding`: provider, endpoint reference, model ID, deployment ID,
  revision, hosting mode, effective parameters and unsupported parameters;
- provider adapter descriptor: integrated by WP02, not implemented here.

`ProviderAdapterDescriptorSchema` records the adapter identity, transport
protocol and logical families it claims to support without importing a provider
SDK or choosing a deployment.

Changing a provider or deployment requires a new provenance/config identity. No
provider, endpoint, SDK, credential, or GPU assumption is embedded in the study
matrix or WP03 workflow.

For the selected baseline sequence, WP02 must preserve the distinction between a
scheduled opportunity and a successful response. It must not fabricate, silently
repair or silently repeat a missing `t0` response. The first public opportunity
must not be dispatched until all three `t0` opportunities have been scheduled in
the declared order and the report notice, where required in B/D, has been delivered at its
declared stage. Failure handling remains the approved WP02 policy; WP01 does not
invent retries.

## WP04 — context and visibility

The minimum linkage is:

```text
source_message_id -> recipient_opportunity_id -> context_snapshot_id
```

It is represented by `SourceMessageLinkSchema`, with an explicit
`visibility_scope`. Private probe output cannot be rendered into public prompt
context by the WP01 renderer; WP04 must enforce the same boundary at runtime.
The `t0` source IDs and outputs are private and cannot be used to construct the
report notice or any other participant's public context. Backend fields such as
`report_required` and `timing_disposition` are experiment metadata, not model-
visible prompt content.

## WP05 — replay

WP05 consumes `campaign_hash`, `manifest_hash`, `config_hash`, prompt registry
hash, decision-register reference and recorded stage identifiers. WP01 does not
implement a replay engine or select replay trials.

## WP06 — analysis and claims

WP06 consumes the independent unit (`run`), nested-unit declarations, private
checkpoint stages, report/review stages, decision status and claim limits. The
behavioral codebook remains an open decision and is not fabricated by WP01.
