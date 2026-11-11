# WP06 pathway and analysis interface

The read-only preview turns one evidence bundle into inspectable coverage tables,
report measures and coder agreement. It uses the existing WP06 analyzers; it adds
no alternative metric definitions and makes no model calls.

## Shared application and pipeline

Open **`/wp06/`** on the AGORA application, or select **WP06 analysis** in the
application navigation. This route ships in the normal production build and Docker
image. It requires the existing `AGORA_AUTH_PASSWORD` researcher credential for all
pages, assets and API requests, even when `AGORA_AUTH_SCOPE=write`. Without that
credential configured, the route fails closed. Use HTTPS for shared deployments,
as required by the application's HTTP Basic authentication model.

With Node 22 or newer, use `npm ci`, `npm run build`, then `npm start` with the
instance's normal environment configuration. For development use `npm run dev`.
There is no additional service, database migration or model credential for WP06.

The pipeline boundary is explicit:

1. WP02/WP03 execution produces WP04 evidence through
   `Phase1aRuntime.exportEvidence(runId)`, including complete or partial runs.
2. Upload that JSON bundle and optional matching human WP06 annotations to `/wp06/`.
   WP06 verifies integrity and computes the same summaries as `phase1a:analyze`.
3. Inspect planned versus observed execution, report dependencies, coverage,
   source-linked human judgments and unavailable-measure reasons.
4. Download analysis JSON for subsequent research review or aggregation. Scientific
   freeze, calibration and campaign-level inference remain separate decisions.

This integration accepts revised Phase 1A evidence bundles. It does not automatically
read the legacy `/phase1` campaign database or treat its exports as compatible.
Human annotations are prepared outside this interface using the WP06 annotation
contract. No uploaded analysis becomes a stored campaign record automatically.

### API integration

Authenticated clients can `POST /wp06/api/analyze` with `Content-Type: application/json`
and a body of `{ "bundle": <EvidenceBundle>, "annotations": <optional annotation object> }`.
Omit `annotations` when unavailable. Browser requests must use the instance's origin;
non-browser authenticated clients may omit `Origin`, following the main app policy.
The response contains `run`, optional `report`/`records`, `pathway`, eligible `evidence`
and `input_kind: "uploaded"`. This inspection response includes eligible source text;
use only `run` and `report` for downstream summaries that must exclude quotations.
The browser's **Export analysis JSON** does this selection and adds the existing
`wp06-preview-export-v1` schema and input-kind labels. The schema name remains stable
for consumers even though the interface now runs in the shared application.

Invalid evidence returns 400 without partial results, oversized requests return 413,
and non-JSON requests return 415. Authentication failures return 401 (or 503 if the
instance has no credential configured); cross-origin browser POSTs return 403.

### Optional standalone development preview

`npm run phase1a:preview` starts the same interface at **http://127.0.0.1:3006**,
without starting the workshop server. `WP06_PREVIEW_PORT` changes its port.
This development launcher is loopback-only with local-host and browser-origin checks;
use the main authenticated application for shared hosting.
The built equivalent is `node dist/phase1a/wp06/preview/server.js` after a build.
Keep `static/wp06-preview/` with the application, as the Docker image already does.

## What reviewers can do

1. **Explore examples.** Choose a complete annotated run, coder disagreement,
   a failed run with retries, or a no-report condition. Content and labels are
   scripted engineering fixtures, not observations or calibrated human judgments.
2. **Load evidence.** Select a Phase 1A evidence-bundle JSON file and optionally
   its matching WP06 annotation JSON. Click Analyze files. The same integrity,
   linkage, span and annotation checks used by the CLI apply.
3. **Check coverage.** See planned and committed opportunities, unattempted and
   pending observations, retries and technical failures. Filter the opportunity
   ledger by public/report stages or uncommitted opportunities.
4. **Inspect measures.** Read retention and dissent values alongside their
   numerators, denominators and availability reasons. Missing annotations or
   unresolved labels leave values unavailable. Inspect original-rating alpha,
   pair agreement, missing ratings, label counts and pairwise confusion counts.
5. **Follow evidence.** Open a successful public turn or final report in the
   inspector. Expand a human judgment to see original ratings, separate
   adjudication, rationales, reviewed sources and exact highlighted quote spans.
   Private checkpoints, intermediate reports, isolated reviews and provider
   request/raw bodies are never sent back as inspectable text.
6. **Export or clear.** Export analysis JSON contains the run and optional report
   summaries plus the preview format and input-kind labels. It excludes source
   bodies and annotation quotes. Clear loaded data removes the displayed results
   and selected files. Invalid new input also clears old results, preventing a
   previous run's success from appearing to validate a failed upload.

## Why this helps

The preview makes denominator mistakes and missing observations visible without
requiring reviewers to read raw JSON. Source inspection connects aggregate results
to the actual material and human judgments behind them. The disagreement example
shows how unresolved coding withholds an aggregate instead of silently dropping
an inconvenient item. This supports engineering review and codebook discussion;
it does not substitute for blinded calibration or approve scientific claims.

It deliberately covers one run. Campaign accounting, exclusions, stance trajectories
and registered replay comparisons remain separate WP06 work. Annotation editing,
coder assignments and adjudication entry are also outside the preview.

## Data handling and limits

Files are sent to the AGORA instance serving the interface for validation and
analysis. On a shared deployment this transfers the evidence to that server.
No model provider or third-party analysis API receives the uploaded evidence. Uploads and results stay in memory; no uploaded file,
annotation or analysis is written to the server's filesystem or retained between
requests. JSON downloads are saved only when the browser user requests them.
This is not a guarantee of secure memory erasure or browser-history deletion.

The combined JSON request limit is 10 MiB. The shared route authenticates requests
before parsing bodies and uses the application's same-origin check. The standalone
launcher additionally restricts hosts to loopback. Responses are marked `no-store`.
Deployment operators must also avoid request-body logging at proxies or infrastructure. The page has
no external assets, telemetry or remote scripts. Uploaded strings are rendered as
text; a restrictive content security policy prevents inline script execution.
Analysis metadata remains operator-scoped even when source bodies are excluded.

## Validation

`tests/phase1aWp06Preview.test.ts` checks analyzer parity, synthetic scenarios,
source visibility, input failures, upload isolation, origin/host restrictions and
request-size limits. Run it with `npm test -- --run tests/phase1aWp06Preview.test.ts`.
`tests/phase1aWp06Pipeline.test.ts` covers the shared mount, authentication before
body parsing, relative assets, upload limits and API/CLI parity under a deployment
hostname. The full suite and TypeScript build remain required checks.

## Interactive protocol pathway

The pathway uses the WP03 plan in the loaded manifest and the validated WP06
opportunity records. It retains every planned operation, including those never
attempted. Participant ordering and report roles follow the manifest rather than
hard-coded display assumptions.

- **Execution order** groups T0, public discussion, T6, report operations and TR.
  Expand the public discussion into six rounds. Arrows represent scheduled
  succession, not information sharing or proof that the next stage executed.
- **Report inputs** shows the draft branching to the two reviews, followed by
  revision using the draft and both reviews. It reuses WP03 context-isolation
  rules. The reviews still execute sequentially; the branching view describes
  inputs, not concurrent execution. A solid dependency has a matching source
  artifact in at least one recorded target call; a dashed dependency remains
  planned. A failed attempt can have received an input without committing output.
- **Selection** highlights a node and incident connectors. The operation inspector
  lists observed status, participant, last outcome, attempts and source references.
  Recorded transitions retain the committing event ID and previous/next state.
  Planned target states are identified as planned; runtime T1/T2 correspond to
  scientific T6/TR. Private and isolated source text remains withheld.
- **First uncommitted operation** locates the earliest scheduled operation without
  a commitment. It is not an inferred causal root or a measured critical path.
  No-report conditions contain no report/TR operations or report-input graph.

Node status is explicit text. A group is committed only when all its operations
are committed; otherwise pending, technical failure or uncommitted response takes
precedence over a partial or unattempted group. Committed does not mean successful:
individual outcomes remain available in the operation inspector.

Use Tab to enter the graph, arrow keys or Home/End to move node focus, and Enter
or Space to select. The diagram reflows at narrow widths without scaling down its text;
long execution paths scroll vertically.
Selection does not change evidence or analyzer values. No animation runs at rest;
reduced-motion settings disable hover transitions. Neutral surfaces and borders
carry the hierarchy; one accent is reserved for active selection and focus.
