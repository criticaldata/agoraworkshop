import { esc } from '../export/replayHtml.js';
import { page } from './pages.js';
import type { ExperimentConfig } from '../config/schema.js';
import { displayName } from '../config/schema.js';
import type { RunRow } from '../db/queries.js';
import type { StoredMessage } from '../orchestrator/visibility.js';
import {
  matrixValue,
  METRIC_LABEL,
  phaseLabel,
  PHASE_SEQUENCE,
  type InteractionMatrix,
  type InteractionMetric,
} from '../analytics/interaction.js';
import { EXPLORER_STYLES } from './explorer.js';

/**
 * Interaction structure: who communicated with whom.
 *
 * Two views of one count. The matrix stays legible at any number of participants; the
 * network is easier to read at small numbers and becomes unreadable past a handful, so
 * it says so rather than drawing something misleading.
 *
 * Both describe observed communication. An edge means messages were sent and delivered,
 * nothing more: not influence, not agreement, not alliance. Temporal order is not
 * causation and is not presented as such anywhere on this page.
 */

export interface StructureQuery {
  metric: InteractionMetric;
  channel: 'public' | 'private' | null;
  phase: string | null;
  /** A selected cell, as `from>to`, whose underlying messages are listed. */
  pair: [string, string] | null;
}

export function parseStructureQuery(query: Record<string, unknown>): StructureQuery {
  const metric = query['metric'];
  const channel = query['channel'];
  const phase = query['phase'];
  const pair = typeof query['pair'] === 'string' ? query['pair'].split('>') : [];

  return {
    metric:
      metric === 'deliveries' || metric === 'output_tokens' ? metric : 'messages',
    channel: channel === 'public' || channel === 'private' ? channel : null,
    phase: typeof phase === 'string' && phase.length > 0 ? phase : null,
    pair: pair.length === 2 && pair[0] && pair[1] ? [pair[0], pair[1]] : null,
  };
}

function href(runId: string, query: StructureQuery, patch: Partial<StructureQuery>): string {
  const merged = { ...query, ...patch };
  const params = new URLSearchParams();
  if (merged.metric !== 'messages') params.set('metric', merged.metric);
  if (merged.channel) params.set('channel', merged.channel);
  if (merged.phase) params.set('phase', merged.phase);
  if (merged.pair) params.set('pair', `${merged.pair[0]}>${merged.pair[1]}`);
  const search = params.toString();
  return search ? `/runs/${runId}/structure?${search}` : `/runs/${runId}/structure`;
}

/** Past this many participants a node-and-edge drawing stops being readable. */
const NETWORK_LIMIT = 12;

export interface StructureInput {
  run: RunRow;
  config: ExperimentConfig;
  matrix: InteractionMatrix;
  messages: StoredMessage[];
  query: StructureQuery;
  /** Phases the run actually entered, so the filter never offers an empty one. */
  phases: string[];
}

export function structurePage(input: StructureInput): string {
  const { run, config, matrix, query } = input;
  const runId = run.run_id;

  return page(
    `Interaction structure of ${runId}`,
    `
  <style>${EXPLORER_STYLES}${STRUCTURE_STYLES}</style>

  <header class="page-head">
    <p class="eyebrow">Interaction structure ·
      <a href="/runs/${esc(runId)}">${esc(runId)}</a></p>
    <h1>Who communicated with whom</h1>
    <p class="note">Counts of observed communication. An entry means messages were sent
    and delivered. It is not a measure of influence, agreement, or alignment, and the
    order in which messages occurred does not establish that one caused another.</p>
  </header>

  ${renderControls(runId, query, input.phases)}

  <section>
    <h2>Interaction matrix</h2>
    <p class="note">Rows send, columns receive. ${esc(METRIC_LABEL[query.metric])}${
      query.channel ? `, ${esc(query.channel)} channel only` : ''
    }${query.phase ? `, ${esc(phaseLabel(query.phase))} only` : ''}.</p>
    ${renderMatrix(runId, config, matrix, query)}
  </section>

  <section>
    <h2>Interaction network</h2>
    ${
      matrix.agentIds.length > NETWORK_LIMIT
        ? `<p class="note">This run has ${matrix.agentIds.length} participants. A network
           drawing is unreadable at that size, so the matrix above is the view to use.</p>`
        : matrix.total === 0
          ? '<p class="note">No communication matches these filters.</p>'
          : `${renderNetwork(config, matrix)}
             <p class="note">Line thickness is the count. Both directions of a pair are
             drawn as one line, with the counts given in the matrix above.</p>`
    }
  </section>

  ${renderPair(input, runId)}

  <section>
    <h2>Elsewhere</h2>
    <p class="ins-actions">
      <a class="btn-sm" href="/runs/${esc(runId)}">Interaction timeline</a>
      <a class="btn-sm" href="/runs/${esc(runId)}/validation">Validation package</a>
      <a class="btn-sm" href="/api/runs/${esc(runId)}/messages">Raw messages</a>
    </p>
  </section>
`,
  );
}

function renderControls(runId: string, query: StructureQuery, phases: string[]): string {
  const metrics: InteractionMetric[] = ['messages', 'deliveries', 'output_tokens'];
  return `<div class="ex-filters">
    <fieldset>
      <legend>Measure</legend>
      <div class="chips">${metrics
        .map((metric) =>
          chip(
            href(runId, query, { metric, pair: null }),
            METRIC_LABEL[metric],
            query.metric === metric,
          ),
        )
        .join('')}</div>
    </fieldset>
    <fieldset>
      <legend>Channel</legend>
      <div class="chips">
        ${chip(href(runId, query, { channel: null, pair: null }), 'All', query.channel === null)}
        ${chip(href(runId, query, { channel: 'public', pair: null }), 'Public', query.channel === 'public')}
        ${chip(href(runId, query, { channel: 'private', pair: null }), 'Private', query.channel === 'private')}
      </div>
    </fieldset>
    <fieldset>
      <legend>Phase</legend>
      <div class="chips">
        ${chip(href(runId, query, { phase: null, pair: null }), 'Whole run', query.phase === null)}
        ${PHASE_SEQUENCE.filter((p) => phases.includes(p))
          .map((p) => chip(href(runId, query, { phase: p, pair: null }), phaseLabel(p), query.phase === p))
          .join('')}
      </div>
    </fieldset>
  </div>`;
}

const chip = (url: string, label: string, active: boolean): string =>
  `<a class="chip${active ? ' on' : ''}" href="${url}"${active ? ' aria-current="true"' : ''}>${esc(
    label,
  )}</a>`;

function renderMatrix(
  runId: string,
  config: ExperimentConfig,
  matrix: InteractionMatrix,
  query: StructureQuery,
): string {
  const ids = matrix.agentIds;
  const rows = ids
    .map((from) => {
      const cells = ids
        .map((to) => {
          if (from === to) return '<td class="mx-self" aria-label="not applicable">·</td>';
          const value = matrixValue(matrix, from, to);
          if (value === 0) {
            return `<td class="mx-zero"><span class="visually-hidden">no messages from ${esc(
              displayName(config, from),
            )} to ${esc(displayName(config, to))}</span>0</td>`;
          }
          // Shading is a second encoding of the number, never the only one.
          const weight = matrix.max === 0 ? 0 : value / matrix.max;
          const selected = query.pair?.[0] === from && query.pair?.[1] === to;
          return `<td class="mx-cell${selected ? ' sel' : ''}"
            style="--w:${weight.toFixed(3)}">
            <a href="${href(runId, query, { pair: [from, to] })}#pair"
               aria-label="${esc(
                 `${displayName(config, from)} to ${displayName(config, to)}: ${value} ${METRIC_LABEL[
                   matrix.metric
                 ].toLowerCase()}`,
               )}">${value}</a></td>`;
        })
        .join('');
      return `<tr><th scope="row">${esc(displayName(config, from))}</th>${cells}</tr>`;
    })
    .join('');

  return `<div class="scroll">
    <table class="mx">
      <caption class="visually-hidden">${esc(
        METRIC_LABEL[matrix.metric],
      )} from each participant, in rows, to each participant, in columns.</caption>
      <thead><tr><th scope="col"><span class="visually-hidden">Sender</span></th>${ids
        .map((id) => `<th scope="col">${esc(displayName(config, id))}</th>`)
        .join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  <p class="ex-hint">${matrix.total} ${esc(
    METRIC_LABEL[matrix.metric].toLowerCase(),
  )} in total. Select any number to read the messages behind it.</p>`;
}

/**
 * A circular layout, computed here rather than by a layout library: with a handful of
 * nodes the arrangement carries no information, so a fixed one is honest and stable
 * across runs, which makes two runs comparable by eye.
 */
function renderNetwork(config: ExperimentConfig, matrix: InteractionMatrix): string {
  const ids = matrix.agentIds;
  const size = 420;
  const radius = 150;
  const centre = size / 2;

  const points = new Map(
    ids.map((id, index) => {
      const angle = (2 * Math.PI * index) / ids.length - Math.PI / 2;
      return [
        id,
        { x: centre + radius * Math.cos(angle), y: centre + radius * Math.sin(angle) },
      ];
    }),
  );

  // One line per unordered pair, weighted by the traffic in both directions.
  const drawn = new Set<string>();
  const edges: string[] = [];
  for (const from of ids) {
    for (const to of ids) {
      if (from === to) continue;
      const key = [from, to].sort().join('|');
      if (drawn.has(key)) continue;
      drawn.add(key);
      const total = matrixValue(matrix, from, to) + matrixValue(matrix, to, from);
      if (total === 0) continue;
      const a = points.get(from)!;
      const b = points.get(to)!;
      const width = 1 + 5 * (matrix.max === 0 ? 0 : total / (matrix.max * 2));
      edges.push(
        `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(
          1,
        )}" stroke-width="${width.toFixed(2)}"><title>${esc(
          `${displayName(config, from)} and ${displayName(config, to)}: ${total}`,
        )}</title></line>`,
      );
    }
  }

  const nodes = ids
    .map((id) => {
      const p = points.get(id)!;
      const label = displayName(config, id);
      const anchor = p.x < centre - 5 ? 'end' : p.x > centre + 5 ? 'start' : 'middle';
      const dx = anchor === 'end' ? -14 : anchor === 'start' ? 14 : 0;
      const dy = anchor === 'middle' ? (p.y < centre ? -14 : 22) : 4;
      return `<g class="nw-node">
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="8"></circle>
        <text x="${(p.x + dx).toFixed(1)}" y="${(p.y + dy).toFixed(1)}" text-anchor="${anchor}">${esc(
          label,
        )}</text>
      </g>`;
    })
    .join('');

  return `<div class="nw-wrap">
    <svg class="nw" viewBox="0 0 ${size} ${size}" role="img"
         aria-label="Interaction network. The same counts are given as text in the matrix above.">
      <g class="nw-edges">${edges.join('')}</g>
      ${nodes}
    </svg>
  </div>`;
}

function renderPair(input: StructureInput, runId: string): string {
  const { query, messages, config } = input;
  if (!query.pair) return '';
  const [from, to] = query.pair;

  const matching = messages.filter(
    (m) =>
      m.sender_agent_id === from &&
      m.actual_recipients.includes(to) &&
      (!query.channel || m.channel === query.channel) &&
      (!query.phase || m.workshop_state === query.phase),
  );

  return `<section id="pair">
    <h2>${esc(displayName(config, from))} to ${esc(displayName(config, to))}</h2>
    <p class="note">${matching.length} message${matching.length === 1 ? '' : 's'} under the
    current filters. <a href="${href(runId, query, { pair: null })}">Clear selection</a></p>
    ${
      matching.length === 0
        ? '<p class="ex-empty">Nothing recorded for this pair under these filters.</p>'
        : `<ol class="pair-list">${matching
            .map(
              (m) => `<li>
        <div class="pair-meta">
          <span class="mono">#${m.sequence}</span>
          <span>${esc(phaseLabel(m.workshop_state))}</span>
          <span class="mono">${esc(m.channel)}${
            m.breakout_group_id ? ` · ${esc(m.breakout_group_id)}` : ''
          }</span>
          <a href="/runs/${esc(runId)}?event=${m.sequence}#inspector">Inspect</a>
        </div>
        <p class="pair-text">${esc(m.content)}</p>
      </li>`,
            )
            .join('')}</ol>`
    }
  </section>`;
}

const STRUCTURE_STYLES = `
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
                   overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

.mx { border-collapse: collapse; font-size: .88rem; }
.mx th, .mx td { border: 1px solid var(--line); padding: .35rem .55rem; text-align: center;
                 white-space: nowrap; }
.mx thead th { font-size: .72rem; letter-spacing: .06em; text-transform: uppercase;
               color: var(--muted); font-weight: 600; }
.mx tbody th { text-align: left; font-weight: 650; font-size: .84rem; }
.mx-self { color: var(--line); }
.mx-zero { color: var(--muted); }
.mx-cell { padding: 0; background: color-mix(in srgb, var(--accent) calc(var(--w) * 22%), transparent); }
.mx-cell a { display: block; padding: .35rem .55rem; text-decoration: none; color: var(--ink);
             font-variant-numeric: tabular-nums; font-weight: 600; }
.mx-cell a:hover, .mx-cell a:focus-visible { background: var(--accent); color: #fff; }
.mx-cell.sel { outline: 2px solid var(--accent); outline-offset: -2px; }

.nw-wrap { display: flex; justify-content: center; }
.nw { width: min(26rem, 100%); height: auto; }
.nw-edges line { stroke: var(--accent); stroke-opacity: .35; stroke-linecap: round; }
.nw-node circle { fill: var(--panel); stroke: var(--accent); stroke-width: 2; }
.nw-node text { font-family: var(--sans); font-size: 12px; fill: var(--ink); }

.pair-list { list-style: none; margin: 0; padding: 0; display: grid; gap: .9rem; }
.pair-list li { border-left: 2px solid var(--line); padding-left: .9rem; }
.pair-meta { display: flex; gap: .7rem; align-items: baseline; flex-wrap: wrap;
             font-size: .76rem; color: var(--muted); }
.pair-text { margin: .3rem 0 0; white-space: pre-wrap; font-size: .9rem; }
`;
