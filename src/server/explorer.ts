import { esc } from '../export/replayHtml.js';
import type { ExperimentConfig } from '../config/schema.js';
import { displayName } from '../config/schema.js';
import type { AgoraEvent } from '../events/types.js';
import type { InvocationRow, RunRow } from '../db/queries.js';
import type { StoredMessage } from '../orchestrator/visibility.js';
import {
  MARKER_LABEL,
  MARKER_SYMBOL,
  phaseLabel,
  type Timeline,
  type TimelineFilters,
  type TimelineMarker,
} from '../analytics/interaction.js';

/**
 * The timeline and its inspector.
 *
 * Rendered entirely on the server. Filters and selection live in the query string, so
 * every state of this view is a URL a researcher can cite, and every marker is a real
 * link rather than a canvas hit region. That keeps the view keyboard-navigable and
 * screen-reader-legible without a line of client script.
 *
 * Horizontal position is ordered event progression, not elapsed time: one column per
 * recorded sequence that carries a marker. Two markers can therefore never overlap, and
 * the spacing never implies a duration that was not measured.
 */

export interface ExplorerQuery {
  agents: string[];
  channel: 'public' | 'private' | null;
  phase: string | null;
  infrastructure: boolean;
  selected: number | null;
  /**
   * Select by message rather than by position. Callers that hold a message id, such as
   * the evidence behind a derived graph node, cannot know the event sequence, and
   * guessing one would open the wrong marker.
   */
  message: string | null;
}

export function parseExplorerQuery(query: Record<string, unknown>): ExplorerQuery {
  const list = (value: unknown): string[] =>
    typeof value === 'string' && value.length > 0 ? value.split(',').filter(Boolean) : [];
  const channel = query['channel'];
  const phase = query['phase'];
  const selected = Number(query['event']);
  const message = query['message'];

  return {
    agents: list(query['agents']),
    channel: channel === 'public' || channel === 'private' ? channel : null,
    phase: typeof phase === 'string' && phase.length > 0 ? phase : null,
    infrastructure: query['infra'] === '1',
    selected: Number.isFinite(selected) && selected > 0 ? selected : null,
    message: typeof message === 'string' && message.length > 0 ? message : null,
  };
}

/** Resolves a message id to the marker that carries it, so selection can be by either. */
export function resolveSelection(query: ExplorerQuery, timeline: Timeline): ExplorerQuery {
  if (query.selected !== null || !query.message) return query;
  const marker = timeline.markers.find((m) => m.messageId === query.message);
  return marker ? { ...query, selected: marker.sequence } : query;
}

export function toFilters(query: ExplorerQuery): TimelineFilters {
  return {
    agents: query.agents.length > 0 ? query.agents : null,
    channel: query.channel,
    phase: query.phase,
    infrastructure: query.infrastructure,
  };
}

/** Rebuilds the current URL with one parameter changed. */
function href(base: string, query: ExplorerQuery, patch: Partial<ExplorerQuery>): string {
  const merged = { ...query, ...patch };
  const params = new URLSearchParams();
  if (merged.agents.length > 0) params.set('agents', merged.agents.join(','));
  if (merged.channel) params.set('channel', merged.channel);
  if (merged.phase) params.set('phase', merged.phase);
  if (merged.infrastructure) params.set('infra', '1');
  if (merged.selected !== null) params.set('event', String(merged.selected));
  if (merged.message) params.set('message', merged.message);
  const search = params.toString();
  return search ? `${base}?${search}` : base;
}

export interface ExplorerInput {
  run: RunRow;
  config: ExperimentConfig;
  timeline: Timeline;
  events: AgoraEvent[];
  messages: StoredMessage[];
  invocations: InvocationRow[];
  query: ExplorerQuery;
}

export function renderExplorer(input: ExplorerInput): string {
  const { run, config, timeline, query } = input;
  const base = `/runs/${run.run_id}`;

  return `<section id="explorer">
    <div class="ex-head">
      <h2>Interaction timeline</h2>
      <p class="note">One lane per participant, ordered by recorded event sequence. Spacing
      shows order, not elapsed time. Select any marker to inspect what produced it.</p>
    </div>
    ${renderFilters(base, config, timeline, query)}
    ${
      timeline.markers.length === 0
        ? '<p class="ex-empty">No markers match these filters. The records are unchanged; only this view is narrowed.</p>'
        : `<div class="ex-scroll">${renderGrid(base, timeline, query)}</div>
           ${renderLegend(timeline)}`
    }
    ${renderInspector(input, base)}
  </section>`;
}

// ------------------------------------------------------------------ filters

function renderFilters(
  base: string,
  config: ExperimentConfig,
  timeline: Timeline,
  query: ExplorerQuery,
): string {
  const agents = [config.moderator.id, ...config.participants.map((p) => p.id)];

  const agentChips = agents
    .map((id) => {
      const on = query.agents.includes(id);
      const next = on ? query.agents.filter((a) => a !== id) : [...query.agents, id];
      return chip(
        href(base, query, { agents: next, selected: null }),
        displayName(config, id),
        on,
      );
    })
    .join('');

  const phaseChips = timeline.phases
    .filter((p) => p.phase !== 'CREATED' && p.phase !== 'COMPLETED')
    .map((p) =>
      chip(
        href(base, query, { phase: query.phase === p.phase ? null : String(p.phase), selected: null }),
        p.label,
        query.phase === p.phase,
      ),
    )
    .join('');

  return `<div class="ex-filters">
    <fieldset>
      <legend>Agents</legend>
      <div class="chips">
        ${chip(href(base, query, { agents: [], selected: null }), 'All', query.agents.length === 0)}
        ${agentChips}
      </div>
    </fieldset>
    <fieldset>
      <legend>Channel</legend>
      <div class="chips">
        ${chip(href(base, query, { channel: null, selected: null }), 'All', query.channel === null)}
        ${chip(href(base, query, { channel: 'public', selected: null }), 'Public', query.channel === 'public')}
        ${chip(href(base, query, { channel: 'private', selected: null }), 'Private', query.channel === 'private')}
      </div>
    </fieldset>
    <fieldset>
      <legend>Phase</legend>
      <div class="chips">
        ${chip(href(base, query, { phase: null, selected: null }), 'All', query.phase === null)}
        ${phaseChips}
      </div>
    </fieldset>
    <fieldset>
      <legend>Detail</legend>
      <div class="chips">
        ${chip(
          href(base, query, { infrastructure: !query.infrastructure, selected: null }),
          `Infrastructure events (${timeline.infrastructureMarkers})`,
          query.infrastructure,
        )}
      </div>
      <p class="ex-hint">${
        query.infrastructure
          ? 'Model calls, retries and failures are shown.'
          : `Hidden by default so behaviour is legible. ${timeline.infrastructureMarkers} recorded.`
      }</p>
    </fieldset>
  </div>`;
}

const chip = (url: string, label: string, active: boolean): string =>
  `<a class="chip${active ? ' on' : ''}" href="${url}"${active ? ' aria-current="true"' : ''}>${esc(
    label,
  )}</a>`;

// --------------------------------------------------------------------- grid

function renderGrid(base: string, timeline: Timeline, query: ExplorerQuery): string {
  // One column per sequence that carries a marker: no overlap is possible, and the
  // columns stay meaningful when a filter removes most of the run.
  const columns = [...new Set(timeline.markers.map((m) => m.sequence))].sort((a, b) => a - b);
  const columnIndex = new Map(columns.map((seq, i) => [seq, i + 2]));

  // Row 1 carries the phase bands; each lane gets the next row. Rows are explicit
  // because auto-placement would scatter a lane's name, rule and markers.
  const bands = timeline.phases
    .filter((band) => band.phase !== 'CREATED' && band.phase !== 'COMPLETED')
    .map((band) => {
      const inside = columns.filter(
        (seq) => seq >= band.fromSequence && seq <= band.toSequence,
      );
      if (inside.length === 0) return '';
      const start = columnIndex.get(inside[0]!)!;
      const end = columnIndex.get(inside.at(-1)!)! + 1;
      return `<div class="ex-band" style="grid-row:1;grid-column:${start}/${end}" title="${esc(
        `${band.label}: ${band.markerCount} markers`,
      )}">${esc(band.label)}</div>`;
    })
    .join('');

  const lanes = timeline.lanes
    .map((lane, index) => {
      const row = index + 2;
      const cells = lane.markers
        .map((marker) => {
          const column = columnIndex.get(marker.sequence)!;
          const selected = query.selected === marker.sequence;
          return `<a class="ex-marker k-${marker.kind}${selected ? ' sel' : ''}"
            style="grid-row:${row};grid-column:${column}"
            href="${href(base, query, { selected: marker.sequence })}#inspector"
            aria-label="${esc(markerAria(marker))}"
            title="${esc(markerAria(marker))}"><span aria-hidden="true">${
              MARKER_SYMBOL[marker.kind]
            }</span></a>`;
        })
        .join('');
      return `<div class="ex-lane-name${
        lane.role === 'moderator' ? ' mod' : ''
      }" style="grid-row:${row};grid-column:1">
          <a href="${base}/agents/${esc(lane.agentId)}">${esc(lane.displayName)}</a>
        </div>
        <div class="ex-rule" style="grid-row:${row};grid-column:2/-1"></div>
        ${cells}`;
    })
    .join('');

  // A phase band spans its columns, and a band whose name does not fit is a band you
  // cannot read: a filter that leaves one marker in a phase must widen that column
  // rather than clip "Public discussion" to "Pub…".
  //
  // The minimum has to be `min-content` rather than a fixed width, because a spanning
  // item only grows tracks whose minimum is intrinsic. The marker itself sets that
  // minimum, so a column is never narrower than the mark it holds.
  return `<div class="ex-grid" role="group" aria-label="Interaction timeline"
       style="grid-template-columns: 9rem repeat(${columns.length}, minmax(min-content, auto))">
    ${bands}
    ${lanes}
  </div>`;
}

function markerAria(marker: TimelineMarker): string {
  const where = marker.channel ? `${marker.channel} channel` : 'no channel';
  const summary = marker.summary ? `: ${marker.summary}` : '';
  return `${MARKER_LABEL[marker.kind]}, ${phaseLabel(String(marker.phase))}, ${where}, position ${marker.sequence}${summary}`;
}

function renderLegend(timeline: Timeline): string {
  const kinds = [...new Set(timeline.markers.map((m) => m.kind))];
  return `<ul class="ex-legend">${kinds
    .map(
      (kind) =>
        `<li><span class="ex-marker k-${kind}" aria-hidden="true">${MARKER_SYMBOL[kind]}</span> ${esc(
          MARKER_LABEL[kind],
        )}</li>`,
    )
    .join('')}</ul>
    <p class="ex-hint">Every marker carries a shape and a label as well as a colour.</p>`;
}

// ---------------------------------------------------------------- inspector

function renderInspector(input: ExplorerInput, base: string): string {
  const { timeline, query, messages, invocations, events, config, run } = input;
  if (query.selected === null) {
    return `<div class="ex-inspector empty" id="inspector">
      <p>Select a marker to see the message it produced, the exact context behind it, and
      the model call that generated it.</p>
    </div>`;
  }

  const marker = timeline.markers.find((m) => m.sequence === query.selected);
  if (!marker) {
    return `<div class="ex-inspector empty" id="inspector">
      <p>That marker is not in the current view. Clear the filters to reach it.</p>
      <p><a href="${href(base, query, { agents: [], channel: null, phase: null })}">Clear filters</a></p>
    </div>`;
  }

  const message = marker.messageId
    ? messages.find((m) => m.message_id === marker.messageId)
    : undefined;
  const invocation = marker.invocationId
    ? invocations.find((i) => i.invocation_id === marker.invocationId)
    : messageInvocation(message, invocations);
  const context = contextEvent(events, marker, invocation?.invocation_id ?? null);

  return `<div class="ex-inspector" id="inspector">
    <div class="ins-head">
      <div>
        <p class="eyebrow">${esc(MARKER_LABEL[marker.kind])}</p>
        <h3>${esc(displayName(config, marker.agentId))}</h3>
      </div>
      <a class="ins-close" href="${href(base, query, { selected: null })}#explorer"
         aria-label="Close inspector">Close</a>
    </div>

    <dl class="ins-facts">
      <div><dt>Position</dt><dd>${marker.sequence} of ${timeline.lastSequence}</dd></div>
      <div><dt>Phase</dt><dd>${esc(phaseLabel(String(marker.phase)))}</dd></div>
      <div><dt>Channel</dt><dd>${esc(marker.channel ?? 'none')}${
        marker.breakoutGroupId ? ` <span class="muted">(${esc(marker.breakoutGroupId)})</span>` : ''
      }</dd></div>
      <div><dt>Elapsed</dt><dd>${(marker.elapsedMs / 1000).toFixed(1)}s into the run</dd></div>
    </dl>

    ${
      message
        ? `<section class="ins-block">
      <h4>Message</h4>
      <p class="ins-message">${esc(message.content)}</p>
      <p class="ins-note">Delivered to ${
        message.actual_recipients.length === 0
          ? 'nobody'
          : message.actual_recipients.map((id) => esc(displayName(config, id))).join(', ')
      }.</p>
    </section>`
        : `<section class="ins-block">
      <h4>Outcome</h4>
      <p class="ins-message mono">${esc(marker.summary)}</p>
      <p class="ins-note">${
        marker.markerClass === 'infrastructure'
          ? 'This is an infrastructure outcome. It records what happened to the apparatus, not what the agent chose to do.'
          : 'This is a behavioural outcome: the agent was reachable and produced no message on purpose.'
      }</p>
    </section>`
    }

    ${
      context
        ? `<section class="ins-block">
      <h4>What this agent had been given</h4>
      <ul class="ins-list">
        <li>${count(context, 'public_message_ids')} public messages in context</li>
        <li>${count(context, 'private_message_ids')} private messages in context</li>
        <li>${count(context, 'included_message_ids')} source messages in total</li>
        <li>Prompt version <span class="mono">${esc(
          String(context.payload['prompt_version'] ?? 'not recorded'),
        )}</span>, context policy <span class="mono">${esc(
          String(context.payload['context_policy_version'] ?? 'not recorded'),
        )}</span></li>
      </ul>
      <p class="ins-note">Counted from the context recorded at the time of the call, not
      reconstructed afterwards.</p>
    </section>`
        : ''
    }

    ${
      invocation
        ? `<section class="ins-block">
      <h4>Model call</h4>
      <dl class="ins-facts">
        <div><dt>Provider</dt><dd class="mono">${esc(invocation.provider)}</dd></div>
        <div><dt>Requested</dt><dd class="mono">${esc(invocation.requested_model)}</dd></div>
        <div><dt>Responded</dt><dd class="mono">${esc(invocation.responded_model ?? 'not reported')}</dd></div>
        <div><dt>Attempt</dt><dd>${invocation.attempt}</dd></div>
        <div><dt>Outcome</dt><dd>${esc(invocation.outcome)}${
          invocation.failure_category ? ` <span class="mono">(${esc(invocation.failure_category)})</span>` : ''
        }</dd></div>
        <div><dt>Latency</dt><dd>${invocation.latency_ms ?? 'not recorded'} ms</dd></div>
        <div><dt>Tokens in / out</dt><dd>${invocation.input_tokens ?? 0} / ${
          invocation.output_tokens ?? 0
        }</dd></div>
      </dl>
    </section>`
        : ''
    }

    <div class="ins-actions">
      ${
        invocation
          ? `<a class="btn-sm" href="/runs/${esc(run.run_id)}/invocations/${esc(
              invocation.invocation_id,
            )}">Exact context and system prompt</a>`
          : ''
      }
      <a class="btn-sm" href="/api/runs/${esc(run.run_id)}/events">Raw events</a>
      <a class="btn-sm" href="${base}/agents/${esc(marker.agentId)}">This agent through the run</a>
    </div>
  </div>`;
}

const count = (event: AgoraEvent, key: string): number => {
  const value = event.payload[key];
  return Array.isArray(value) ? value.length : 0;
};

/** The context assembled immediately before this marker, for the same agent. */
function contextEvent(
  events: AgoraEvent[],
  marker: TimelineMarker,
  invocationId: string | null,
): AgoraEvent | undefined {
  const candidates = events.filter(
    (e) =>
      e.event_type === 'context_assembled' &&
      e.agent_id === marker.agentId &&
      e.sequence <= marker.sequence,
  );
  if (invocationId) {
    const exact = candidates.find((e) => {
      const started = events.find(
        (s) => s.event_type === 'agent_invocation_started' && s.payload['invocation_id'] === invocationId,
      );
      return started?.parent_event_id === e.event_id;
    });
    if (exact) return exact;
  }
  return candidates.at(-1);
}

function messageInvocation(
  message: StoredMessage | undefined,
  invocations: InvocationRow[],
): InvocationRow | undefined {
  if (!message?.source_invocation_id) return undefined;
  return invocations.find((i) => i.invocation_id === message.source_invocation_id);
}

// -------------------------------------------------------------------- styles

export const EXPLORER_STYLES = `
.ex-head h2 { margin-bottom: .2rem; }
.ex-filters { display: flex; gap: 1.25rem; flex-wrap: wrap; margin: 0 0 1rem;
              padding: .9rem 1rem; background: var(--panel); border: 1px solid var(--line);
              border-radius: 12px; }
.ex-filters fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.ex-filters legend { font-size: .68rem; letter-spacing: .09em; text-transform: uppercase;
                     color: var(--muted); font-weight: 700; padding: 0 0 .35rem; }
.chips { display: flex; gap: .3rem; flex-wrap: wrap; }
.chip { display: inline-block; padding: .12rem .55rem; border-radius: 999px;
        border: 1px solid var(--line); font-size: .78rem; text-decoration: none;
        color: var(--muted); background: var(--paper); }
.chip:hover { border-color: var(--accent); color: var(--accent); }
.chip.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.ex-hint { font-size: .74rem; color: var(--muted); margin: .35rem 0 0; }

.ex-scroll { overflow-x: auto; padding-bottom: .4rem; }
.ex-grid { display: grid; align-items: center; row-gap: .1rem; min-width: min-content;
           /* Leftover width stays as space on the right rather than being shared out
              among the marker tracks, which would space the run out arbitrarily. */
           justify-content: start; }
.ex-band { border-left: 2px solid var(--line); padding: .1rem .6rem .35rem .4rem;
           font-size: .68rem; letter-spacing: .07em; text-transform: uppercase;
           color: var(--muted); font-weight: 700; white-space: nowrap; }
/* Markers stay centred in their track even when a band has widened it. */
.ex-marker { margin: 0 auto; }
.ex-lane-name { font-size: .82rem; padding-right: .8rem; white-space: nowrap; }
.ex-lane-name a { text-decoration: none; color: var(--ink); }
.ex-lane-name a:hover { color: var(--accent); text-decoration: underline; }
.ex-lane-name.mod a { font-weight: 700; }
.ex-rule { height: 1px; background: var(--line); align-self: center; }
.ex-marker { display: flex; align-items: center; justify-content: center;
             width: 1.5rem; min-width: 1.5rem; height: 1.5rem; border-radius: 50%;
             font-size: .8rem; text-decoration: none; line-height: 1; }
.ex-marker:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.ex-marker.sel { box-shadow: 0 0 0 2px var(--accent); }
.k-public_message { color: var(--accent); background: #e4ebfc; }
.k-moderator_message { color: var(--ink); background: var(--line); }
.k-private_message { color: var(--priv); background: var(--priv-bg); }
.k-abstention { color: var(--muted); background: var(--paper); border: 1px dashed var(--line); }
.k-no_op { color: var(--muted); background: var(--paper); }
.k-failure { color: var(--bad); background: var(--bad-bg); }
.k-retry { color: var(--warn); background: var(--warn-bg); }
.k-invocation { color: var(--muted); background: transparent; }

.ex-legend { list-style: none; display: flex; gap: .9rem; flex-wrap: wrap;
             margin: .6rem 0 0; padding: 0; font-size: .8rem; color: var(--muted); }
.ex-legend li { display: flex; align-items: center; gap: .35rem; }
.ex-empty { color: var(--muted); font-size: .9rem; padding: 1rem 0; }

.ex-inspector { margin-top: 1.25rem; padding: 1.1rem 1.25rem; background: var(--panel);
                border: 1px solid var(--line); border-radius: 12px; }
.ex-inspector.empty { color: var(--muted); font-size: .88rem; }
.ex-inspector.empty p { margin: 0; }
.ins-head { display: flex; justify-content: space-between; align-items: flex-start;
            gap: 1rem; margin-bottom: .8rem; }
.ins-head h3 { margin: 0; font-size: 1.1rem; }
.ins-close { font-size: .8rem; color: var(--muted); text-decoration: none;
             border: 1px solid var(--line); border-radius: 6px; padding: .15rem .5rem; }
.ins-close:hover { color: var(--accent); border-color: var(--accent); }
.ins-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
             gap: .5rem 1.25rem; margin: 0 0 .9rem; }
.ins-facts div { display: flex; flex-direction: column; min-width: 0; }
.ins-facts dt { font-size: .68rem; letter-spacing: .07em; text-transform: uppercase;
                color: var(--muted); }
.ins-facts dd { margin: 0; font-size: .88rem; overflow-wrap: anywhere; }
.ins-block { border-top: 1px solid var(--line); padding-top: .8rem; margin-top: .8rem; }
.ins-block h4 { margin: 0 0 .5rem; font-size: .8rem; letter-spacing: .07em;
                text-transform: uppercase; color: var(--muted); }
.ins-message { margin: 0; white-space: pre-wrap; font-size: .92rem; line-height: 1.6; }
.ins-note { margin: .5rem 0 0; font-size: .8rem; color: var(--muted); }
.ins-list { margin: 0; padding-left: 1.1rem; font-size: .88rem; }
.ins-actions { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: 1rem; }
.btn-sm { font-size: .82rem; text-decoration: none; padding: .3rem .7rem;
          border: 1px solid var(--line); border-radius: 7px; color: var(--ink);
          background: var(--paper); }
.btn-sm:hover { border-color: var(--accent); color: var(--accent); }

@media (max-width: 46rem) {
  .ex-filters { gap: .9rem; }
}
`;
