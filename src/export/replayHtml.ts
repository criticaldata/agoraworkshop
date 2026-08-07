import type { ExperimentConfig } from '../config/schema.js';
import { displayName } from '../config/schema.js';
import type { RunRow, InvocationRow } from '../db/queries.js';
import type { AgoraEvent } from '../events/types.js';
import type { StoredMessage } from '../orchestrator/visibility.js';
import type { RunAnalytics } from '../analytics/summary.js';
import type { AcceptanceReport, GateResult } from '../acceptance/gates.js';

export interface ReplayInput {
  run: RunRow;
  config: ExperimentConfig;
  events: AgoraEvent[];
  messages: StoredMessage[];
  invocations: InvocationRow[];
  analytics: RunAnalytics;
  acceptance: AcceptanceReport;
}

const FAILURE_EVENTS = new Set([
  'timeout',
  'rate_limit',
  'provider_error',
  'provider_refusal',
  'network_error',
  'malformed_response',
  'routing_error',
  'permission_denied',
  'budget_exhausted',
  'retry_exhausted',
  'agent_invocation_failed',
  'run_failed',
  'state_transition_rejected',
]);

const BEHAVIOUR_EVENTS = new Set(['explicit_abstention', 'no_op']);
const MESSAGE_EVENTS = new Set(['message_generated', 'private_message_generated']);
const NOISE_EVENTS = new Set(['message_delivered', 'private_message_delivered']);

/** Renders a completely self-contained replay page — no external assets, no scripts. */
export function renderReplayHtml(input: ReplayInput): string {
  const { run, config, analytics, acceptance } = input;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AGORA replay · ${esc(run.run_id)}</title>
<style>${STYLES}</style>
</head>
<body>
<main>
  <header class="page-head">
    <p class="eyebrow">AGORA Phase 0 · run replay</p>
    <h1>${esc(config.workshop.topic)}</h1>
    ${renderRunFacts(run)}
  </header>

  <section>
    <h2>Acceptance checks</h2>
    ${renderGates(acceptance)}
  </section>

  <section>
    <h2>Run statistics</h2>
    ${renderStats(analytics)}
  </section>

  <section>
    <h2>Timeline</h2>
    ${renderTimeline(input)}
  </section>
</main>
</body>
</html>
`;
}

export function renderRunFacts(run: RunRow): string {
  return `<dl class="facts">
      <div><dt>Run</dt><dd class="mono wrap">${esc(run.run_id)}</dd></div>
      <div><dt>Experiment</dt><dd class="mono">${esc(run.experiment_id)}</dd></div>
      <div><dt>Settings fingerprint</dt><dd class="mono wrap">${esc(run.config_hash)}</dd></div>
      <div><dt>Provider / model</dt><dd class="mono">${esc(run.provider)} · ${esc(run.model)}</dd></div>
      <div><dt>Status</dt><dd><span class="pill ${run.status === 'COMPLETED' ? 'ok' : run.status === 'RUNNING' ? '' : run.status === 'INTERRUPTED' ? 'unproven' : 'bad'}">${esc(run.status)}</span> <span class="muted">${esc(run.termination_reason ?? '')}</span></dd></div>
      <div><dt>Duration</dt><dd>${run.duration_ms === null ? 'not recorded' : `${(run.duration_ms / 1000).toFixed(1)}s`}</dd></div>
      <div><dt>Commit</dt><dd class="mono">${esc(run.code_commit_sha ?? 'not recorded')}</dd></div>
      <div><dt>Started</dt><dd>${esc((run.started_at ?? run.created_at).replace('T', ' ').slice(0, 19))}</dd></div>
    </dl>`;
}

export function renderGates(acceptance: AcceptanceReport): string {
  return `${gateCard('Was the run carried out correctly?', acceptance.gates.infrastructure_validated)}
    ${gateCard('Is the reason for each missing response recorded?', acceptance.gates.failure_attribution_validated)}
    ${gateCard('Can the run be repeated under the same conditions?', acceptance.gates.baseline_reproducible)}
    <p class="verdict ${acceptance.ready_for_controlled_behavioral_experiment ? 'ok' : 'bad'}">
      ${
        acceptance.ready_for_controlled_behavioral_experiment
          ? 'All three checks pass. This run can support a controlled behavioural experiment.'
          : 'Not all checks pass. This run cannot yet support a controlled behavioural experiment.'
      }
    </p>`;
}

export function renderStats(analytics: RunAnalytics): string {
  return `<div class="stat-grid">
      ${stat('Provider calls', analytics.total_provider_calls)}
      ${stat('Response opportunities', analytics.total_response_opportunities)}
      ${stat('Public messages', analytics.total_public_messages)}
      ${stat('Private messages', analytics.total_private_messages)}
      ${stat('Technical failures', analytics.total_infrastructure_failures)}
      ${stat('Retries', analytics.total_retries)}
      ${stat('Median latency', analytics.median_latency_ms === null ? 'n/a' : `${analytics.median_latency_ms} ms`)}
      ${stat('Output tokens', analytics.total_output_tokens)}
    </div>

    <div class="scroll">
      <table>
        <thead>
          <tr>
            <th>Agent</th><th>Turns offered</th><th>Calls</th><th>Responded</th>
            <th>Declined</th><th>Passed</th><th>Failed</th><th>Able to act</th>
            <th>Participation</th><th>Unadjusted</th>
          </tr>
        </thead>
        <tbody>
          ${analytics.per_agent
            .map(
              (a) => `<tr>
            <td class="mono">${esc(a.agent_id)}</td>
            <td>${a.response_opportunities}</td>
            <td>${a.provider_calls}</td>
            <td>${a.successful_responses}</td>
            <td>${a.explicit_abstentions}</td>
            <td>${a.no_ops}</td>
            <td>${a.infrastructure_failures}</td>
            <td>${a.behaviourally_available_opportunities}</td>
            <td><strong>${fmtRatio(a.infrastructure_adjusted_participation)}</strong></td>
            <td class="muted">${fmtRatio(a.naive_participation)}</td>
          </tr>`,
            )
            .join('\n')}
        </tbody>
      </table>
    </div>
    <p class="note">Participation counts responses against the turns the agent was actually
    able to act on. The unadjusted column counts them against every turn offered, including
    those that never reached the agent, and is shown only for comparison.</p>`;
}

export function renderTimeline(input: ReplayInput): string {
  const { config, events, messages } = input;
  const messageById = new Map(messages.map((m) => [m.message_id, m]));
  const rows = events
    .filter((event) => !NOISE_EVENTS.has(event.event_type))
    .map((event) => renderEventRow(event, config, messageById))
    .join('\n');
  const deliveries = events.filter((e) => NOISE_EVENTS.has(e.event_type));

  return `<p class="note">${events.length} events recorded, ${deliveries.length} of them
    per-recipient delivery records, collapsed here and present in <code>events.jsonl</code>.</p>
    <ol class="timeline">
${rows}
    </ol>`;
}

function renderEventRow(
  event: AgoraEvent,
  config: ExperimentConfig,
  messageById: Map<string, StoredMessage>,
): string {
  const cls = FAILURE_EVENTS.has(event.event_type)
    ? 'fail'
    : BEHAVIOUR_EVENTS.has(event.event_type)
      ? 'behaviour'
      : MESSAGE_EVENTS.has(event.event_type)
        ? 'message'
        : 'info';

  const who = event.agent_id ? displayName(config, event.agent_id) : '';
  let body = '';

  if (MESSAGE_EVENTS.has(event.event_type)) {
    const message = messageById.get(String(event.payload['message_id'] ?? ''));
    if (message) {
      const to =
        message.channel === 'private'
          ? ` → ${message.actual_recipients.map((id) => displayName(config, id)).join(', ')}`
          : '';
      body = `<div class="bubble ${message.channel}">
        <div class="bubble-head"><span class="chan">${message.channel === 'private' ? `private:${esc(message.breakout_group_id ?? '')}` : 'public'}</span>${esc(to)}</div>
        <p>${esc(message.content)}</p>
      </div>`;
    }
  } else if (event.event_type === 'state_transition_completed') {
    body = `<p class="detail mono">${esc(String(event.payload['from_state']))} → ${esc(String(event.payload['to_state']))}</p>`;
  } else if (FAILURE_EVENTS.has(event.event_type)) {
    const detail = event.payload['error'] ?? event.payload['failure_category'] ?? event.payload['reason'];
    body = detail ? `<p class="detail">${esc(String(detail))}</p>` : '';
  } else if (event.event_type === 'context_assembled') {
    body = `<p class="detail muted">context: ${Number(event.payload['included_count'] ?? 0)} messages (${
      (event.payload['public_message_ids'] as string[] | undefined)?.length ?? 0
    } public / ${(event.payload['private_message_ids'] as string[] | undefined)?.length ?? 0} private)</p>`;
  }

  return `      <li class="${cls}">
        <span class="clock mono">${clock(event.elapsed_ms)}</span>
        <span class="seq mono">#${event.sequence}</span>
        <span class="type mono">${esc(event.event_type)}</span>
        <span class="agent">${esc(who)}</span>
        ${body}
      </li>`;
}

/** PASS, FAIL and NOT_EXERCISED are three different colours because they are three
 * different claims. An unexercised gate must not look like a passing one. */
const gateTone = (status: GateResult['status']): string =>
  status === 'PASS' ? 'ok' : status === 'FAIL' ? 'bad' : 'unproven';

function gateCard(title: string, gate: GateResult): string {
  const tone = gateTone(gate.status);
  const notExercised = gate.not_exercised ?? [];
  return `<article class="gate ${tone}">
    <h3>${esc(title)} <span class="pill ${tone}">${gate.status.replace('_', ' ')}</span></h3>
    <ul>${gate.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
    ${gate.failures.length ? `<ul class="failures">${gate.failures.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
    ${notExercised.length ? `<ul class="unproven">${notExercised.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
  </article>`;
}

const stat = (label: string, value: string | number): string =>
  `<div class="stat"><span class="stat-value">${esc(String(value))}</span><span class="stat-label">${esc(label)}</span></div>`;

const fmtRatio = (value: number | null): string =>
  value === null ? 'n/a' : `${(value * 100).toFixed(0)}%`;

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const STYLES = `
:root {
  color-scheme: light; /* light only: dark backgrounds hurt readability here */
  --bg: #f7f9fb;
  --panel: #ffffff;
  --ink: #14181f;
  --muted: #5d6673;
  --line: #dde3ea;
  /* Colour is data here, not decoration: signal blue = public channel,
     amber = private/breakout, vermilion = infrastructure failure. The same
     three read identically on the overview page and in every run timeline. */
  --accent: #2f5fe0;
  --ok: #1f7a4d;
  --ok-bg: #e6f4ec;
  --bad: #b3261e;
  --bad-bg: #fbeae9;
  /* A third state, because "unproven" is neither a pass nor a failure. */
  --warn: #92400e;
  --warn-bg: #fdf1d6;
  --priv: #8a5a00;
  --priv-bg: #fdf3e0;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
main { max-width: 62rem; margin: 0 auto; padding: 2.5rem 1.25rem 5rem; }
a { color: var(--accent); }
h1 { font-size: 1.7rem; line-height: 1.25; margin: .3rem 0 1.25rem; font-weight: 650; }
h2 { font-size: 1.05rem; text-transform: uppercase; letter-spacing: .08em;
     color: var(--muted); margin: 2.75rem 0 1rem; font-weight: 600; }
h3 { font-size: 1rem; margin: 0 0 .6rem; }
.eyebrow { color: var(--accent); font-size: .78rem; letter-spacing: .12em;
           text-transform: uppercase; margin: 0; font-weight: 600; }
.mono { font-family: var(--mono); font-size: .85em; }
.muted { color: var(--muted); }
.wrap { overflow-wrap: anywhere; }
.note { color: var(--muted); font-size: .87rem; }
.scroll { overflow-x: auto; }

.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
         gap: .75rem 1.5rem; margin: 0; padding: 1rem 1.1rem; background: var(--panel);
         border: 1px solid var(--line); border-radius: 12px; }
.facts div { display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
.facts dt { color: var(--muted); font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; }
.facts dd { margin: 0; min-width: 0; }

.pill { display: inline-block; padding: .08rem .5rem; border-radius: 999px;
        font-size: .74rem; font-weight: 650; letter-spacing: .04em; }
.pill.ok { background: var(--ok-bg); color: var(--ok); }
.pill.bad { background: var(--bad-bg); color: var(--bad); }

.gate { background: var(--panel); border: 1px solid var(--line);
        border-left: 3px solid var(--ok); border-radius: 10px;
        padding: 1rem 1.1rem; margin-bottom: .85rem; }
.gate.bad { border-left-color: var(--bad); }
.gate.unproven { border-left-color: var(--warn); }
.gate .unproven { margin-top: .5rem; color: var(--warn); }
.pill.unproven { background: var(--warn-bg); color: var(--warn); }
.gate ul { margin: 0; padding-left: 1.1rem; font-size: .9rem; }
.gate li { margin: .2rem 0; }
.gate .failures { margin-top: .5rem; color: var(--bad); }
.verdict { font-size: .95rem; padding: .7rem 1rem; border-radius: 10px;
           background: var(--ok-bg); color: var(--ok); }
.verdict.bad { background: var(--bad-bg); color: var(--bad); }

.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
             gap: .7rem; margin-bottom: 1.25rem; }
.stat { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
        padding: .8rem .9rem; display: flex; flex-direction: column; gap: .15rem; }
.stat-value { font-size: 1.35rem; font-weight: 620; font-variant-numeric: tabular-nums; }
.stat-label { font-size: .74rem; color: var(--muted); text-transform: uppercase;
              letter-spacing: .06em; }

table { border-collapse: collapse; width: 100%; font-size: .87rem; }
th, td { text-align: right; padding: .45rem .6rem; border-bottom: 1px solid var(--line);
         white-space: nowrap; }
th:first-child, td:first-child { text-align: left; }
th { color: var(--muted); font-weight: 600; font-size: .76rem;
     text-transform: uppercase; letter-spacing: .05em; }

.timeline { list-style: none; margin: 0; padding: 0; }
.timeline li { display: grid; grid-template-columns: 3.4rem 3rem minmax(0, 14rem) minmax(0, 1fr);
               gap: .5rem; align-items: baseline; padding: .4rem .6rem;
               border-left: 3px solid var(--line); }
.timeline li > .bubble, .timeline li > .detail { grid-column: 3 / -1; }
.timeline li.message { border-left-color: var(--accent); }
.timeline li.fail { border-left-color: var(--bad); background: var(--bad-bg); }
.timeline li.behaviour { border-left-color: var(--ok); background: var(--ok-bg); }
.timeline .clock { color: var(--muted); font-variant-numeric: tabular-nums; }
.timeline .seq { color: var(--muted); }
.timeline .type { overflow-wrap: anywhere; }
.timeline .agent { font-weight: 550; }
.detail { margin: .2rem 0 .1rem; font-size: .88rem; }

.bubble { margin: .35rem 0 .55rem; padding: .6rem .8rem; border-radius: 10px;
          background: var(--panel); border: 1px solid var(--line); }
.bubble.private { background: var(--priv-bg); border-color: var(--priv); }
.bubble-head { font-size: .72rem; text-transform: uppercase; letter-spacing: .06em;
               color: var(--muted); margin-bottom: .3rem; }
.bubble.private .bubble-head { color: var(--priv); }
.bubble p { margin: 0; white-space: pre-wrap; }
.chan { font-weight: 650; }

@media (max-width: 46rem) {
  .timeline li { grid-template-columns: 3.2rem 1fr; }
  .timeline li > .type, .timeline li > .agent { grid-column: 2 / -1; }
  .timeline li > .bubble, .timeline li > .detail { grid-column: 1 / -1; }
  .timeline .seq { display: none; }
}
`;
