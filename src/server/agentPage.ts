import { esc } from '../export/replayHtml.js';
import { page } from './pages.js';
import type { ExperimentConfig } from '../config/schema.js';
import { displayName } from '../config/schema.js';
import type { RunRow } from '../db/queries.js';
import {
  MARKER_LABEL,
  MARKER_SYMBOL,
  phaseLabel,
  type AgentTrajectory,
} from '../analytics/interaction.js';
import { EXPLORER_STYLES } from './explorer.js';
import { runMasthead, RUN_NAV_STYLES } from './runNav.js';
import type { ViewMode } from './viewMode.js';

/**
 * One participant's course through a run.
 *
 * The metrics are operational: how many turns the agent was offered, how many it took,
 * how many it was never given because the apparatus failed. Nothing here describes a
 * disposition, a strategy or a stance, because nothing in the record supports that.
 */
export function agentPage(
  run: RunRow,
  config: ExperimentConfig,
  trajectory: AgentTrajectory,
  mode: ViewMode,
  returnTo: string,
): string {
  const m = trajectory.metrics;

  return page(
    `${trajectory.displayName} in ${run.run_id}`,
    `
  <style>${EXPLORER_STYLES}${AGENT_STYLES}${RUN_NAV_STYLES}</style>

  ${runMasthead({
    run,
    config,
    active: 'agent',
    mode,
    returnTo,
    context: { label: trajectory.displayName },
  })}

  <header class="page-head">
    <p class="eyebrow">${esc(trajectory.role === 'moderator' ? 'Moderator' : 'Participant')}</p>
    <h1>${esc(trajectory.displayName)}</h1>
    <p class="note">${
      trajectory.breakoutGroups.length === 0
        ? 'Not a member of any breakout group.'
        : `Breakout membership: ${trajectory.breakoutGroups.map((g) => esc(g)).join(', ')}.`
    }</p>
  </header>

  <section>
    <h2>Operational metrics</h2>
    <dl class="ag-metrics">
      ${metric('Response opportunities', m.responseOpportunities)}
      ${metric('Successful responses', m.successfulResponses)}
      ${metric('Declined to speak', m.abstentions)}
      ${metric('Passed', m.noOps)}
      ${metric('Unavailable turns', m.unavailableTurns)}
      ${metric('Public messages', m.publicMessages)}
      ${metric('Private messages', m.privateMessages)}
      ${metric('Infrastructure failures', m.infrastructureFailures)}
      ${metric('Retries', m.retries)}
      ${metric('Tokens in / out', `${m.inputTokens} / ${m.outputTokens}`)}
      ${metric('Mean latency', m.meanLatencyMs === null ? 'not recorded' : `${m.meanLatencyMs} ms`)}
    </dl>
    <p class="note">An unavailable turn is one the apparatus failed to deliver. It is
    counted apart from declining to speak, because the agent was never given the chance
    to decline.</p>
  </section>

  <section>
    <h2>Through the run</h2>
    ${trajectory.phases
      .map(
        (phase) => `<div class="ag-phase">
      <h3>${esc(phase.label)}</h3>
      ${
        phase.markers.length === 0
          ? '<p class="ag-none">No recorded activity in this phase.</p>'
          : `<ol class="ag-events">${phase.markers
              .map(
                (marker) => `<li>
          <span class="ex-marker k-${marker.kind}" aria-hidden="true">${
            MARKER_SYMBOL[marker.kind]
          }</span>
          <span class="ag-kind">${esc(MARKER_LABEL[marker.kind])}</span>
          <span class="ag-where">${esc(marker.channel ?? 'no channel')}${
            marker.breakoutGroupId ? ` · ${esc(marker.breakoutGroupId)}` : ''
          }</span>
          <a class="ag-open" href="/runs/${esc(run.run_id)}/timeline?event=${marker.sequence}&amp;infra=1#inspector">Inspect</a>
          <p class="ag-summary">${esc(marker.summary)}</p>
          ${
            marker.recipients.length > 0
              ? `<p class="ag-recipients">To ${marker.recipients
                  .map((id) => esc(displayName(config, id)))
                  .join(', ')}</p>`
              : ''
          }
        </li>`,
              )
              .join('')}</ol>`
      }
    </div>`,
      )
      .join('')}
  </section>

  <section>
    <h2>Elsewhere</h2>
    <p class="ins-actions">
      <a class="btn-sm" href="/runs/${esc(run.run_id)}/timeline?agents=${esc(trajectory.agentId)}">This agent on the timeline</a>
      <a class="btn-sm" href="/runs/${esc(run.run_id)}/structure">Interaction structure</a>
      <a class="btn-sm" href="/runs/${esc(run.run_id)}/validation">Validation package</a>
    </p>
  </section>
`,
    { mode },
  );
}

const metric = (label: string, value: string | number): string =>
  `<div><dt>${esc(label)}</dt><dd>${esc(String(value))}</dd></div>`;

const AGENT_STYLES = `
.ag-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
              gap: .75rem 1.5rem; margin: 0 0 1rem; padding: 1rem 1.1rem;
              background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
.ag-metrics div { display: flex; flex-direction: column; min-width: 0; }
.ag-metrics dt { font-size: .68rem; letter-spacing: .07em; text-transform: uppercase;
                 color: var(--muted); }
.ag-metrics dd { margin: 0; font-size: 1.05rem; font-weight: 650; }

.ag-phase { border-left: 2px solid var(--line); padding-left: 1rem; margin-bottom: 1.5rem; }
.ag-phase h3 { margin: 0 0 .5rem; font-size: .78rem; letter-spacing: .09em;
               text-transform: uppercase; color: var(--muted); }
.ag-none { color: var(--muted); font-size: .87rem; margin: 0; }
.ag-events { list-style: none; margin: 0; padding: 0; display: grid; gap: .7rem; }
.ag-events li { display: grid; grid-template-columns: 1.6rem auto auto 1fr;
                align-items: baseline; gap: .1rem .5rem; }
.ag-kind { font-weight: 650; font-size: .88rem; }
.ag-where { font-family: var(--mono); font-size: .74rem; color: var(--muted); }
.ag-open { font-size: .78rem; justify-self: start; }
.ag-summary { grid-column: 2 / -1; margin: .1rem 0 0; font-size: .88rem;
              white-space: pre-wrap; }
.ag-recipients { grid-column: 2 / -1; margin: .15rem 0 0; font-size: .78rem;
                 color: var(--muted); }

@media (max-width: 40rem) {
  .ag-events li { grid-template-columns: 1.6rem 1fr; }
  .ag-summary, .ag-recipients { grid-column: 1 / -1; }
}
`;
