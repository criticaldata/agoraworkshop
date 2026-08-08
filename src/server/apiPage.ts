import { esc } from '../export/replayHtml.js';
import { page } from './pages.js';
import type { RunRow } from '../db/queries.js';

/**
 * A short reference to the raw data endpoints.
 *
 * The navigation used to link straight to a JSON document, which told a reader nothing
 * about what else was available. This lists what there is, in one screen, and links each
 * entry to a real response for a real run so the shape can be seen rather than guessed.
 *
 * The raw records stay authoritative. Every visualisation in this application is derived
 * from these endpoints, and none of them is a substitute for reading the records.
 */

interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  purpose: string;
  /** Whether the endpoint spends money or writes files, and so requires the credential. */
  guarded: boolean;
}

const ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/api/runs', purpose: 'Every recorded run with its status, model and settings fingerprint.', guarded: false },
  { method: 'GET', path: '/api/runs/{run_id}', purpose: 'One run, including the immutable config snapshot the run was executed under.', guarded: false },
  { method: 'GET', path: '/api/runs/{run_id}/events', purpose: 'The complete structured event log in sequence order. The authoritative record.', guarded: false },
  { method: 'GET', path: '/api/runs/{run_id}/messages', purpose: 'Every message with its channel, breakout group, and the recipients it actually reached.', guarded: false },
  { method: 'GET', path: '/api/runs/{run_id}/opportunities', purpose: 'Every response opportunity and how it resolved, including why a turn produced nothing.', guarded: false },
  { method: 'GET', path: '/api/runs/{run_id}/invocations', purpose: 'Per-invocation provenance: system prompt as sent, rendered context, source message ids.', guarded: false },
  { method: 'GET', path: '/api/runs/{run_id}/analytics', purpose: 'Operational metrics, including infrastructure-adjusted participation.', guarded: false },
  { method: 'GET', path: '/api/runs/{run_id}/acceptance', purpose: 'The three Phase 0 gates for this run, with evidence.', guarded: false },
  { method: 'GET', path: '/api/runs/{run_id}/validation', purpose: 'The Phase 0 validation package: which run stands behind which gate.', guarded: false },
  { method: 'GET', path: '/api/configs', purpose: 'Configuration files available to start a run from.', guarded: false },
  { method: 'GET', path: '/healthz', purpose: 'Health check. Always reachable without a credential.', guarded: false },
  { method: 'POST', path: '/api/runs', purpose: 'Start a run from a named configuration. Spends money on a model-backed config.', guarded: true },
  { method: 'POST', path: '/api/runs/{run_id}/rerun', purpose: 'Run the same frozen configuration again as a new run. Spends money.', guarded: true },
  { method: 'POST', path: '/api/runs/{run_id}/export', purpose: 'Write the artifact bundle again. Completed runs export themselves already.', guarded: true },
];

export function apiPage(sample: RunRow | null): string {
  const example = sample?.run_id ?? null;

  return page(
    'AGORA WORKSHOP · raw API',
    `
  <style>${API_STYLES}</style>

  <header class="page-head">
    <p class="eyebrow">Raw API</p>
    <h1>Raw data endpoints</h1>
    <p class="lede">Every visualisation in this application is derived from these
    responses. None of them replaces the records: where a view summarises for legibility,
    the underlying data stays reachable here in full.</p>
    <p class="note">Responses are JSON. Reading is open; anything that spends money or
    writes files requires the shared credential and must originate from this instance.</p>
  </header>

  <section>
    <h2>Endpoints</h2>
    <div class="scroll">
      <table class="api">
        <thead><tr>
          <th scope="col">Method</th><th scope="col">Path</th>
          <th scope="col">Returns</th><th scope="col">Access</th>
        </tr></thead>
        <tbody>${ENDPOINTS.map((endpoint) => renderRow(endpoint, example)).join('')}</tbody>
      </table>
    </div>
    ${
      example
        ? `<p class="ex-hint">Paths are linked against run
           <span class="mono">${esc(example)}</span>.</p>`
        : '<p class="ex-hint">Record a run to get live links against a real identifier.</p>'
    }
  </section>

  <section>
    <h2>Artifact bundles</h2>
    <p class="body">A completed run writes a self-contained bundle to disk: the frozen
    config and the exact bytes its hash was computed over, the event log, both
    transcripts, per-invocation provenance, the failure and retry log, analytics, the
    acceptance report, and a manifest listing every file with its SHA-256. That bundle is
    the form to cite in a paper; these endpoints are the form to query.</p>
  </section>

  <section>
    <h2>Stability</h2>
    <p class="body">These paths are used by the application itself, so they change only
    when the application does. There is no versioning scheme and no deprecation policy:
    this is a research instrument with one deployment, not a public API.</p>
  </section>
`,
  );
}

function renderRow(endpoint: Endpoint, example: string | null): string {
  const concrete = example ? endpoint.path.replace('{run_id}', example) : null;
  const linked =
    endpoint.method === 'GET' && concrete
      ? `<a class="mono" href="${esc(concrete)}">${esc(endpoint.path)}</a>`
      : `<span class="mono">${esc(endpoint.path)}</span>`;

  return `<tr>
    <td><span class="api-method ${endpoint.method.toLowerCase()}">${endpoint.method}</span></td>
    <td>${linked}</td>
    <td>${esc(endpoint.purpose)}</td>
    <td>${
      endpoint.guarded
        ? '<span class="pill unproven">credential</span>'
        : '<span class="muted">open</span>'
    }</td>
  </tr>`;
}

const API_STYLES = `
.api { border-collapse: collapse; width: 100%; font-size: .87rem; }
.api th, .api td { border-bottom: 1px solid var(--line); padding: .5rem .7rem .5rem 0;
                   text-align: left; vertical-align: top; }
.api thead th { font-size: .7rem; letter-spacing: .07em; text-transform: uppercase;
                color: var(--muted); font-weight: 600; }
.api td:first-child { white-space: nowrap; }
.api-method { font-family: var(--mono); font-size: .72rem; font-weight: 700;
              padding: .1rem .4rem; border-radius: 5px; }
.api-method.get { background: var(--ok-bg); color: var(--ok); }
.api-method.post { background: var(--warn-bg); color: var(--warn); }
.ex-hint { font-size: .78rem; color: var(--muted); }
`;
