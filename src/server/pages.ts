import { esc, STYLES } from '../export/replayHtml.js';
import type { RunRow, InvocationRow } from '../db/queries.js';
import type { AcceptanceReport } from '../acceptance/gates.js';

const EXTRA_STYLES = `
nav.top { display: flex; gap: 1rem; align-items: baseline; margin-bottom: 1.5rem;
          font-size: .9rem; }
nav.top a { text-decoration: none; font-weight: 600; }
nav.top .brand { font-weight: 700; letter-spacing: -.01em; color: var(--ink); }
.runs { width: 100%; }
.runs td, .runs th { text-align: left; white-space: nowrap; }
.runs td.num { text-align: right; }
.launch { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center;
          background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
          padding: 1rem 1.1rem; margin-bottom: 1.5rem; }
select, button { font: inherit; padding: .45rem .7rem; border-radius: 8px;
                 border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
button { background: var(--accent); color: #fff; border-color: transparent;
         font-weight: 600; cursor: pointer; }
button:hover { filter: brightness(1.08); }
button.secondary { background: var(--panel); color: var(--ink); border-color: var(--line); }
.status-line { font-size: .9rem; color: var(--muted); margin-left: auto; }
pre { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
      padding: .9rem 1rem; overflow-x: auto; font-family: var(--mono); font-size: .82rem;
      line-height: 1.5; }
.provenance dt { color: var(--muted); font-size: .74rem; text-transform: uppercase;
                 letter-spacing: .06em; margin-top: .9rem; }
.provenance dd { margin: .2rem 0 0; }
.badge-row { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: 1rem; }
`;

export function page(title: string, body: string, opts: { refresh?: boolean } = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${opts.refresh ? '<meta http-equiv="refresh" content="4">' : ''}
<style>${STYLES}${EXTRA_STYLES}</style>
</head>
<body>
<main>
  <nav class="top">
    <a class="brand" href="/">AGORA · Phase 0</a>
    <a href="/">Overview</a>
    <a href="/runs">Runs</a>
    <a href="/api/runs">API</a>
  </nav>
${body}
</main>
</body>
</html>
`;
}

export function runsPage(runs: RunRow[], configs: string[], notice: string | null): string {
  const options = configs.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  const running = runs.some((r) => r.status === 'RUNNING');

  const rows = runs.length
    ? runs
        .map(
          (run) => `<tr>
      <td><a href="/runs/${esc(run.run_id)}" class="mono">${esc(run.run_id.slice(0, 16))}…</a></td>
      <td>${esc(run.experiment_id)}</td>
      <td><span class="pill ${run.status === 'COMPLETED' ? 'ok' : run.status === 'RUNNING' ? '' : 'bad'}">${esc(run.status)}</span></td>
      <td class="muted">${esc(run.termination_reason ?? '')}</td>
      <td class="mono muted">${esc(run.config_hash.slice(7, 19))}…</td>
      <td class="mono">${esc(run.model)}</td>
      <td class="num">${run.duration_ms === null ? '—' : `${(run.duration_ms / 1000).toFixed(1)}s`}</td>
      <td class="muted">${esc(run.created_at.replace('T', ' ').slice(0, 19))}</td>
    </tr>`,
        )
        .join('\n')
    : `<tr><td colspan="8" class="muted">No runs yet. Launch one above.</td></tr>`;

  return page(
    'AGORA Phase 0 — runs',
    `
  <p class="eyebrow">Runs</p>
  <h1>Workshop runs</h1>

  ${notice ? `<p class="verdict">${esc(notice)}</p>` : ''}

  <form class="launch" method="post" action="/runs">
    <label for="config">Frozen config</label>
    <select id="config" name="config">${options}</select>
    <button type="submit">Launch run</button>
    <span class="status-line">${running ? 'A run is currently executing — this page refreshes automatically.' : `${runs.length} recorded runs`}</span>
  </form>

  <div class="scroll">
    <table class="runs">
      <thead><tr>
        <th>Run</th><th>Experiment</th><th>Status</th><th>Termination</th>
        <th>Config hash</th><th>Model</th><th>Duration</th><th>Created</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <h2>How to read this table</h2>
  <p class="note">Two runs with the same config hash were carried out under the same
  settings. The text the agents produced will differ between them; that is expected. Open
  a run to see its sequence of events, the result of the three checks, and the exact
  material each agent was given before it responded.</p>
`,
    { refresh: running },
  );
}

export function provenancePage(run: RunRow, invocation: InvocationRow): string {
  const rendered = JSON.parse(invocation.rendered_messages) as Array<{
    role: string;
    content: string;
  }>;
  const ids = JSON.parse(invocation.context_message_ids) as string[];
  const publicIds = JSON.parse(invocation.context_public_ids) as string[];
  const privateIds = JSON.parse(invocation.context_private_ids) as string[];
  const params = JSON.parse(invocation.generation_params) as Record<string, unknown>;

  return page(
    `Invocation ${invocation.invocation_id}`,
    `
  <p class="eyebrow">Context provenance</p>
  <h1>What ${esc(invocation.agent_id)} was given</h1>
  <p class="note"><a href="/runs/${esc(run.run_id)}">← back to run</a></p>

  <div class="badge-row">
    <span class="pill ${invocation.outcome === 'success' ? 'ok' : invocation.outcome === 'infra_failure' ? 'bad' : ''}">${esc(invocation.outcome)}</span>
    ${invocation.failure_category ? `<span class="pill bad">${esc(invocation.failure_category)}</span>` : ''}
    <span class="pill">attempt ${invocation.attempt}</span>
    <span class="pill">${esc(invocation.workshop_state)}</span>
    <span class="pill">${esc(invocation.channel)}</span>
  </div>

  <dl class="provenance">
    <dt>Invocation</dt><dd class="mono wrap">${esc(invocation.invocation_id)}</dd>
    <dt>Opportunity</dt><dd class="mono wrap">${esc(invocation.opportunity_id)}</dd>
    <dt>Provider / requested model</dt><dd class="mono">${esc(invocation.provider)} · ${esc(invocation.requested_model)}</dd>
    <dt>Model that responded</dt><dd class="mono">${esc(invocation.responded_model ?? '—')}</dd>
    <dt>Generation parameters</dt><dd><pre>${esc(JSON.stringify(params, null, 2))}</pre></dd>
    <dt>Prompt version / context policy</dt><dd class="mono">${esc(invocation.prompt_version)} · ${esc(invocation.context_policy_version)}</dd>
    <dt>Capability manifest</dt><dd class="mono">${esc(invocation.capability_manifest)}</dd>
    <dt>Budget at invocation time</dt><dd class="mono">${invocation.budget_calls_used_before} calls · ${invocation.budget_tokens_used_before} tokens already used</dd>
    <dt>Latency</dt><dd>${invocation.latency_ms ?? '—'} ms</dd>
    <dt>Usage</dt><dd class="mono">in ${invocation.input_tokens ?? '—'} · out ${invocation.output_tokens ?? '—'}</dd>
    <dt>Output message</dt><dd class="mono wrap">${esc(invocation.output_message_id ?? '—')}</dd>
    <dt>Source messages included (${ids.length})</dt>
    <dd class="mono wrap muted">${ids.length ? esc(ids.join(', ')) : 'none'}</dd>
    <dt>… of which public (${publicIds.length}) / private (${privateIds.length})</dt>
    <dd class="mono wrap muted">${esc(privateIds.join(', ') || 'no private messages in this context')}</dd>
  </dl>

  <h2>Resolved system prompt</h2>
  <pre>${esc(invocation.system_prompt)}</pre>

  <h2>Rendered context sent to the provider</h2>
  ${rendered.map((m) => `<h3 class="mono">${esc(m.role)}</h3><pre>${esc(m.content)}</pre>`).join('\n')}
`,
  );
}

export function acceptanceBadges(report: AcceptanceReport): string {
  return `<div class="badge-row">
    <span class="pill ${report.gates.infrastructure_validated.status === 'PASS' ? 'ok' : 'bad'}">Gate 1 ${report.gates.infrastructure_validated.status}</span>
    <span class="pill ${report.gates.failure_attribution_validated.status === 'PASS' ? 'ok' : 'bad'}">Gate 2 ${report.gates.failure_attribution_validated.status}</span>
    <span class="pill ${report.gates.baseline_reproducible.status === 'PASS' ? 'ok' : 'bad'}">Gate 3 ${report.gates.baseline_reproducible.status}</span>
  </div>`;
}
