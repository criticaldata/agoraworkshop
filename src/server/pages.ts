import {
  esc,
  STYLES,
  renderGates,
  renderRunFacts,
  renderStats,
  renderTimeline,
} from '../export/replayHtml.js';
import type { ReplayInput } from '../export/replayHtml.js';
import type { RunRow, InvocationRow, RunSummary } from '../db/queries.js';
import { EXPLORER_STYLES } from './explorer.js';
import { runActions, runMasthead, RUN_NAV_STYLES } from './runNav.js';

/**
 * Operator views.
 *
 * These share the token system used by the overview and the documentation, so the
 * colours mean the same thing everywhere: signal blue is the public channel, amber is a
 * private breakout, vermilion is a technical failure.
 */

const EXTRA_STYLES = `
nav.top { display: flex; gap: 1rem; align-items: baseline; margin-bottom: 1.75rem;
          font-size: .9rem; flex-wrap: wrap; }
nav.top a { text-decoration: none; font-weight: 600; }
nav.top .brand { font-weight: 800; letter-spacing: .12em; color: var(--ink); }
nav.top .brand-note { font-family: var(--mono); font-size: .7rem; color: var(--muted);
                      border: 1px solid var(--line); border-radius: 999px;
                      padding: .05rem .5rem; margin-right: auto; }
nav.top a:focus-visible, .btn:focus-visible, button:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 3px; }

.page-head { margin-bottom: 1.5rem; }
.lede { color: var(--muted); max-width: 46rem; margin: 0 0 1.5rem; }

/* ---------- toolbar ---------- */
.toolbar { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center;
           background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
           padding: .85rem 1rem; margin-bottom: 1.5rem; }
.toolbar label { font-size: .82rem; color: var(--muted); text-transform: uppercase;
                 letter-spacing: .06em; font-weight: 600; }
.toolbar form { display: contents; }
select, button { font: inherit; padding: .45rem .7rem; border-radius: 8px;
                 border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
button { background: var(--accent); color: #fff; border-color: transparent;
         font-weight: 600; cursor: pointer; }
button:hover { filter: brightness(1.08); }
button.secondary { background: var(--panel); color: var(--ink); border-color: var(--line); }
.toolbar-note { font-size: .87rem; color: var(--muted); margin-left: auto; }

/* ---------- run groups ---------- */
.group { border: 1px solid var(--line); border-radius: 12px; background: var(--panel);
         margin-bottom: 1rem; overflow: hidden; }
.group-head { display: flex; flex-wrap: wrap; gap: .4rem 1.2rem; align-items: baseline;
              padding: .8rem 1rem; border-bottom: 1px solid var(--line); }
.group-title { font-weight: 650; font-size: .95rem; }
.group-meta { font-family: var(--mono); font-size: .78rem; color: var(--muted); }
.group-count { margin-left: auto; font-size: .8rem; color: var(--muted); }
.group-note { padding: .6rem 1rem; font-size: .84rem; color: var(--muted);
              border-top: 1px solid var(--line); background: var(--bg); margin: 0; }

.run-row { display: grid; gap: .3rem 1rem; padding: .75rem 1rem;
           grid-template-columns: minmax(6rem, 1fr) 7rem 7rem repeat(3, minmax(4.5rem, auto)) 10rem;
           align-items: baseline; font-size: .88rem; }
.run-row + .run-row { border-top: 1px solid var(--line); }
.run-row a { font-family: var(--mono); text-decoration: none; font-weight: 600; }
.run-row a:hover { text-decoration: underline; }
.run-metric { font-variant-numeric: tabular-nums; color: var(--muted); }
.run-metric b { color: var(--ink); font-weight: 650; }
.run-metric.bad b { color: var(--bad); }
.run-when { color: var(--muted); font-size: .82rem; text-align: right; }
.run-head { font-size: .7rem; text-transform: uppercase; letter-spacing: .06em;
            color: var(--muted); font-weight: 600; padding-bottom: .25rem; }
.empty { padding: 2rem 1rem; text-align: center; color: var(--muted); margin: 0; }

/* ---------- run page ---------- */
.sub-nav { display: flex; flex-wrap: wrap; gap: .4rem; margin: 0 0 1.75rem; }
.sub-nav a { font-family: var(--mono); font-size: .78rem; text-decoration: none;
             border: 1px solid var(--line); border-radius: 999px; padding: .25rem .75rem;
             color: var(--muted); background: var(--panel); }
.sub-nav a:hover { color: var(--accent); border-color: var(--accent); }

.turns { border-collapse: collapse; width: 100%; font-size: .85rem; }
.turns th, .turns td { text-align: left; padding: .45rem .6rem;
                       border-bottom: 1px solid var(--line); white-space: nowrap; }
.turns th { color: var(--muted); font-weight: 600; font-size: .72rem;
            text-transform: uppercase; letter-spacing: .05em; }
.turns td.num { text-align: right; font-variant-numeric: tabular-nums; }
.turns tr.failed td { background: var(--bad-bg); }
.turns a { text-decoration: none; font-weight: 600; }
.turns a:hover { text-decoration: underline; }
.outcome-bad { color: var(--bad); font-weight: 600; }

pre { background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
      padding: .9rem 1rem; overflow-x: auto; font-family: var(--mono); font-size: .8rem;
      line-height: 1.55; white-space: pre-wrap; }
code { font-family: var(--mono); font-size: .88em; }

/* ---------- provenance ---------- */
.prov { display: grid; gap: 1.5rem; align-items: start; }
@media (min-width: 60rem) { .prov { grid-template-columns: 19rem minmax(0, 1fr); } }
.prov-side { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
             padding: 1rem 1.1rem; position: sticky; top: 1rem; }
.prov-side dl { margin: 0; }
.prov-side dt { color: var(--muted); font-size: .68rem; text-transform: uppercase;
                letter-spacing: .07em; margin-top: .8rem; }
.prov-side dt:first-of-type { margin-top: 0; }
.prov-side dd { margin: .15rem 0 0; font-size: .87rem; overflow-wrap: anywhere; }
.prov h2 { margin-top: 0; }
.prov section + section { margin-top: 1.75rem; }
.badge-row { display: flex; gap: .4rem; flex-wrap: wrap; margin-bottom: 1rem; }
.ctx-ids { font-family: var(--mono); font-size: .74rem; color: var(--muted);
           overflow-wrap: anywhere; line-height: 1.7; }

.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
                   overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.runs-search { display: flex; gap: .4rem; }
.runs-search input { font: inherit; font-size: .85rem; padding: .2rem .5rem;
                     border: 1px solid var(--line); border-radius: 6px; min-width: 13rem;
                     background: var(--paper); color: var(--ink); }
.runs-search button { font-size: .82rem; }
.group-compare { margin: .6rem 0 0; font-size: .82rem; }

@media (max-width: 52rem) {
  .run-row { grid-template-columns: 1fr auto; }
  .run-head { display: none; }
  .run-when { text-align: left; }
  .prov-side { position: static; }
}
`;

export function page(title: string, body: string, opts: { refresh?: boolean } = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${opts.refresh ? '<meta http-equiv="refresh" content="4">' : ''}
<style>${STYLES}${EXTRA_STYLES}${EXPLORER_STYLES}${RUN_NAV_STYLES}</style>
</head>
<body>
<main>
  <nav class="top">
    <a class="brand" href="/">AGORA</a>
    <span class="brand-note">Phase 0</span>
    <a href="/">Overview</a>
    <a href="/docs">Documentation</a>
    <a href="/runs">Runs</a>
    <a href="/compare">Compare</a>
    <a href="/api">Raw API</a>
  </nav>
${body}
</main>
</body>
</html>
`;
}

// ------------------------------------------------------------------ list

export interface RunGroup {
  configHash: string;
  experimentId: string;
  model: string;
  moderatorMode: string;
  topic: string;
  runs: RunRow[];
}

/** What the researcher narrowed the list to. Filtering never changes stored data. */
export interface RunsFilter {
  q: string;
  model: string | null;
  status: string | null;
  /** Only groups with two or more completed runs, which are the comparable ones. */
  comparableOnly: boolean;
}

export interface RunsPageInput {
  groups: RunGroup[];
  summaries: Map<string, RunSummary>;
  configs: string[];
  notice: string | null;
  totalRuns: number;
  shownRuns: number;
  filter: RunsFilter;
  models: string[];
  statuses: string[];
}

/**
 * Runs are grouped by settings fingerprint rather than listed flat.
 *
 * That grouping is the unit that matters: runs sharing a fingerprint were carried out
 * under the same conditions and are the ones worth comparing with one another. A flat
 * list ordered by date hides exactly that relationship.
 */
export function runsPage(input: RunsPageInput): string {
  const { groups, summaries, configs, notice, totalRuns, shownRuns, filter } = input;
  const options = configs.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  const running = groups.some((g) => g.runs.some((r) => r.status === 'RUNNING'));
  const filtered = filter.q || filter.model || filter.status || filter.comparableOnly;

  const body = groups.length
    ? groups.map((group) => renderGroup(group, summaries)).join('\n')
    : filtered
      ? `<div class="group"><p class="empty">No runs match these filters. Every run is
         still recorded; only this list is narrowed.</p></div>`
      : `<div class="group"><p class="empty">No runs recorded yet. Choose a configuration
         above and start one.</p></div>`;

  return page(
    'AGORA · runs',
    `
  <header class="page-head">
    <p class="eyebrow">Runs</p>
    <h1>Workshop runs</h1>
    <p class="lede">Runs are grouped by the fingerprint of the settings they used. Runs
    within a group were carried out under identical conditions and can be compared with
    one another. Runs in different groups cannot.</p>
  </header>

  ${notice ? `<p class="verdict bad">${esc(notice)}</p>` : ''}

  <div class="toolbar">
    <form method="post" action="/runs">
      <label for="config">Configuration</label>
      <select id="config" name="config">${options}</select>
      <button type="submit">Start run</button>
    </form>
    <a href="/compare"><button type="button" class="secondary">Compare runs</button></a>
    <span class="toolbar-note">${
      running
        ? 'A run is in progress. This page refreshes automatically.'
        : `${
            filtered ? `${shownRuns} of ${totalRuns}` : `${totalRuns}`
          } run${totalRuns === 1 ? '' : 's'} across ${groups.length} setting${
            groups.length === 1 ? '' : 's'
          }`
    }</span>
  </div>

  ${renderRunsFilter(input)}
  ${body}
`,
    { refresh: running },
  );
}

function renderRunsFilter(input: RunsPageInput): string {
  const { filter, models, statuses } = input;
  const url = (patch: Partial<RunsFilter>): string => {
    const merged = { ...filter, ...patch };
    const params = new URLSearchParams();
    if (merged.q) params.set('q', merged.q);
    if (merged.model) params.set('model', merged.model);
    if (merged.status) params.set('status', merged.status);
    if (merged.comparableOnly) params.set('comparable', '1');
    const search = params.toString();
    return search ? `/runs?${search}` : '/runs';
  };
  const chip = (href: string, label: string, on: boolean): string =>
    `<a class="chip${on ? ' on' : ''}" href="${href}"${on ? ' aria-current="true"' : ''}>${esc(
      label,
    )}</a>`;

  return `<div class="ex-filters">
    <fieldset>
      <legend>Search</legend>
      <form method="get" action="/runs" class="runs-search">
        <label class="visually-hidden" for="q">Run id, experiment or settings fingerprint</label>
        <input id="q" name="q" type="search" value="${esc(filter.q)}"
               placeholder="run id, experiment, fingerprint">
        ${filter.model ? `<input type="hidden" name="model" value="${esc(filter.model)}">` : ''}
        ${filter.status ? `<input type="hidden" name="status" value="${esc(filter.status)}">` : ''}
        ${filter.comparableOnly ? '<input type="hidden" name="comparable" value="1">' : ''}
        <button type="submit">Search</button>
      </form>
    </fieldset>
    <fieldset>
      <legend>Model</legend>
      <div class="chips">
        ${chip(url({ model: null }), 'All', filter.model === null)}
        ${models.map((m) => chip(url({ model: m }), m, filter.model === m)).join('')}
      </div>
    </fieldset>
    <fieldset>
      <legend>Status</legend>
      <div class="chips">
        ${chip(url({ status: null }), 'All', filter.status === null)}
        ${statuses.map((s) => chip(url({ status: s }), s, filter.status === s)).join('')}
      </div>
    </fieldset>
    <fieldset>
      <legend>Comparability</legend>
      <div class="chips">
        ${chip(
          url({ comparableOnly: !filter.comparableOnly }),
          'Repeated settings only',
          filter.comparableOnly,
        )}
      </div>
      <p class="ex-hint">Settings with two or more completed runs, which are the ones that
      can show run-to-run variation.</p>
    </fieldset>
  </div>`;
}

function renderGroup(group: RunGroup, summaries: Map<string, RunSummary>): string {
  const rows = group.runs
    .map((run) => {
      const s = summaries.get(run.run_id);
      const failures = s?.failures ?? 0;
      return `<div class="run-row">
      <a href="/runs/${esc(run.run_id)}">${esc(run.run_id.replace(/^run_/, '').slice(0, 8))}</a>
      <span><span class="pill ${
        run.status === 'COMPLETED'
          ? 'ok'
          : run.status === 'RUNNING'
            ? ''
            : run.status === 'INTERRUPTED'
              ? 'unproven'
              : 'bad'
      }">${esc(run.status)}</span></span>
      <span class="muted">${esc(run.termination_reason ?? '')}</span>
      <span class="run-metric"><b>${s?.public_messages ?? 0}</b> public</span>
      <span class="run-metric"><b>${s?.private_messages ?? 0}</b> private</span>
      <span class="run-metric ${failures > 0 ? 'bad' : ''}"><b>${failures}</b> failed</span>
      <span class="run-when">${esc(run.created_at.replace('T', ' ').slice(0, 16))}${
        run.duration_ms === null ? '' : ` · ${(run.duration_ms / 1000).toFixed(1)}s`
      }</span>
    </div>`;
    })
    .join('\n');

  return `<article class="group">
    <div class="group-head">
      <span class="group-title">${esc(group.experimentId)}</span>
      <span class="group-meta">${esc(group.model)}</span>
      <span class="group-meta">${esc(group.configHash.slice(7, 19))}…</span>
      <span class="group-meta">${esc(group.moderatorMode)} moderator</span>
      <span class="group-count">${group.runs.length} run${group.runs.length === 1 ? '' : 's'}</span>
    </div>
    <div class="run-row run-head">
      <span>Run</span><span>Status</span><span>Ended</span>
      <span>Public</span><span>Private</span><span>Failures</span><span>Started</span>
    </div>
    ${rows}
    <p class="group-note">${esc(group.topic)}</p>
    ${
      group.runs.filter((r) => r.status === 'COMPLETED').length >= 2
        ? `<p class="group-compare"><a class="btn-sm" href="/compare?hash=${esc(
            group.configHash,
          )}">Compare these runs</a></p>`
        : '<p class="group-compare muted">One completed run so far. A second under the same settings makes run-to-run variation visible.</p>'
    }
  </article>`;
}

/** Phase constants are for the log; a table is read by people. */
const PHASE_LABEL: Record<string, string> = {
  INTRODUCTION: 'Introductions',
  PUBLIC_DISCUSSION: 'Open discussion',
  PRIVATE_OR_BREAKOUT: 'Breakouts',
  FINAL_DISCUSSION: 'Final round',
  CLOSING: 'Closing',
};

const phaseLabel = (state: string): string => PHASE_LABEL[state] ?? state;

/** Token usage, or a plain statement that the call never reported any. */
const tokenPair = (input: number | null, output: number | null): string =>
  input === null && output === null ? 'not recorded' : `${input ?? 0} / ${output ?? 0}`;

// -------------------------------------------------------------- run page

export interface RunPageInput extends ReplayInput {
  isRunning: boolean;
  /** The interaction timeline, rendered by the explorer module. */
  explorer: string;
}

/**
 * The run page presents the verdict first, then the numbers, then the sequence of
 * events, then every individual turn. Someone reviewing a run needs to know whether it
 * can be relied upon before reading what was said during it.
 */
/**
 * The views of one run, each its own route.
 *
 * They were a single page with five stacked sections, which meant a researcher scrolled
 * past four things to reach the fifth and had no way back to the run from anywhere else.
 * Each is now addressable on its own and carries the masthead, so the run and the way
 * across to its other views travel with you.
 */

export interface TimelinePageInput extends RunPageInput {
  exportedFiles: number;
  /** Stamps the client asset so a deploy cannot serve a stale script. */
  assetVersion: string;
}

export function timelinePage(input: TimelinePageInput): string {
  const { run, config, analytics, isRunning } = input;
  return page(
    `Timeline of ${run.run_id}`,
    `
  ${runMasthead({ run, config, active: 'timeline', isRunning })}
  ${runActions(run, input.exportedFiles)}
  ${input.explorer}

  <section id="statistics">
    <h2>Statistics</h2>
    ${renderStats(analytics)}
  </section>

  <script src="/static/timeline.js?v=${esc(input.assetVersion)}"></script>
`,
    { refresh: isRunning },
  );
}

export function transcriptPage(input: RunPageInput): string {
  const { run, config } = input;
  return page(
    `Transcript of ${run.run_id}`,
    `
  ${runMasthead({ run, config, active: 'transcript', isRunning: input.isRunning })}

  <section>
    <h2>Chronological record</h2>
    <p class="note">Every event in the order it was recorded. The timeline is a view of
    this; this is the record itself.</p>
    ${renderTimeline(input)}
  </section>
`,
    { refresh: input.isRunning },
  );
}

export function turnsPage(input: RunPageInput): string {
  const { run, config, invocations, acceptance } = input;

  const turns = invocations
    .map(
      (i) => `<tr class="${i.outcome === 'infra_failure' ? 'failed' : ''}">
      <td><a class="mono" href="/runs/${esc(run.run_id)}/invocations/${esc(
        i.invocation_id,
      )}">${esc(i.agent_id)}</a></td>
      <td class="muted">${esc(phaseLabel(i.workshop_state))}</td>
      <td>${esc(i.channel)}</td>
      <td class="num">${i.attempt}</td>
      <td>${
        i.failure_category
          ? `<span class="outcome-bad">${esc(i.failure_category)}</span>`
          : esc(i.outcome)
      }</td>
      <td class="num">${i.latency_ms ?? 'n/a'}</td>
      <td class="num">${tokenPair(i.input_tokens, i.output_tokens)}</td>
    </tr>`,
    )
    .join('\n');

  return page(
    `Turns of ${run.run_id}`,
    `
  ${runMasthead({ run, config, active: 'turns', isRunning: input.isRunning })}

  <section>
    <h2>Turns</h2>
    <p class="note">Every call to a model, including the attempts that failed. Select an
    agent to see the exact material it was given before it responded.</p>
    <div class="scroll">
      <table class="turns">
        <thead><tr>
          <th>Agent</th><th>Phase</th><th>Channel</th><th>Attempt</th>
          <th>Outcome</th><th>Latency (ms)</th><th>Tokens in / out</th>
        </tr></thead>
        <tbody>${turns || '<tr><td colspan="7" class="muted">No turns recorded.</td></tr>'}</tbody>
      </table>
    </div>
  </section>

  <section id="checks">
    <h2>Acceptance checks</h2>
    <p class="note">These judge this run on its own. A red badge here often means a step
    has not been taken yet rather than that something went wrong, and where that is the
    case the card says which step. For the verdict that draws on several runs together,
    open <a href="/runs/${esc(run.run_id)}/validation">Checks</a>.</p>
    ${renderGates(acceptance, run.run_id)}
  </section>
`,
    { refresh: input.isRunning },
  );
}

// ------------------------------------------------------------ provenance

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
    `Turn · ${invocation.agent_id}`,
    `
  <header class="page-head">
    <p class="eyebrow">Context provenance</p>
    <h1>What ${esc(invocation.agent_id)} was given</h1>
    <p class="lede">Everything below was recorded at the time of the call. It is what the
    agent received, not a reconstruction of it.
    <a href="/runs/${esc(run.run_id)}#turns">Back to the run</a>.</p>
  </header>

  <div class="badge-row">
    <span class="pill ${
      invocation.outcome === 'success' ? 'ok' : invocation.outcome === 'infra_failure' ? 'bad' : ''
    }">${esc(invocation.outcome)}</span>
    ${invocation.failure_category ? `<span class="pill bad">${esc(invocation.failure_category)}</span>` : ''}
    <span class="pill">attempt ${invocation.attempt}</span>
    <span class="pill">${esc(phaseLabel(invocation.workshop_state))}</span>
    <span class="pill">${esc(invocation.channel)}</span>
  </div>

  <div class="prov">
    <aside class="prov-side">
      <dl>
        <dt>Provider / model requested</dt>
        <dd class="mono">${esc(invocation.provider)} · ${esc(invocation.requested_model)}</dd>
        <dt>Model that responded</dt><dd class="mono">${esc(invocation.responded_model ?? 'not recorded')}</dd>
        <dt>Latency</dt><dd>${invocation.latency_ms === null ? 'not recorded' : `${invocation.latency_ms} ms`}</dd>
        <dt>Tokens in / out</dt>
        <dd class="mono">${tokenPair(invocation.input_tokens, invocation.output_tokens)}</dd>
        <dt>Prompt version</dt><dd class="mono">${esc(invocation.prompt_version)}</dd>
        <dt>Context policy</dt><dd class="mono">${esc(invocation.context_policy_version)}</dd>
        <dt>Tools available</dt>
        <dd class="mono">${esc(
          invocation.capability_manifest === '[]' ? 'none' : invocation.capability_manifest,
        )}</dd>
        <dt>Budget already used</dt>
        <dd class="mono">${invocation.budget_calls_used_before} calls · ${invocation.budget_tokens_used_before} tokens</dd>
        <dt>Messages included</dt>
        <dd>${ids.length} in total: ${publicIds.length} public, ${privateIds.length} private</dd>
        ${invocation.error_message ? `<dt>Error</dt><dd>${esc(invocation.error_message)}</dd>` : ''}
        <dt>Invocation</dt><dd class="mono">${esc(invocation.invocation_id)}</dd>
      </dl>
    </aside>

    <div>
      <section>
        <h2>Generation parameters</h2>
        <pre>${esc(JSON.stringify(params, null, 2))}</pre>
      </section>

      <section>
        <h2>System prompt</h2>
        <pre>${esc(invocation.system_prompt)}</pre>
      </section>

      ${rendered
        .map(
          (m) => `<section>
        <h2>Context sent as the ${esc(m.role)} turn</h2>
        <pre>${esc(m.content)}</pre>
      </section>`,
        )
        .join('\n')}

      <section>
        <h2>Source messages</h2>
        <p class="note">The identifier of every stored message included in the context
        above, in the order it was presented.</p>
        <p class="ctx-ids">${
          ids.length
            ? esc(ids.join('  '))
            : 'No prior messages existed at this point in the run.'
        }</p>
      </section>
    </div>
  </div>
`,
  );
}
