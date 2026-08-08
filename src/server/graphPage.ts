import { esc } from '../export/replayHtml.js';
import { page } from './pages.js';
import type { RunRow } from '../db/queries.js';
import type { ExperimentConfig } from '../config/schema.js';
import type { RunGraph } from '../analytics/graph.js';
import type { ExtractionRow } from '../semantic/types.js';
import { runMasthead, RUN_NAV_STYLES } from './runNav.js';

/**
 * The graph view.
 *
 * This is the one page in the application that runs client script. The rest of AGORA is
 * static HTML, and the exported replay bundle stays that way: it is a file a reviewer
 * opens years later with no server behind it. But panning, zooming, dragging a node and
 * scrubbing through time cannot be done by re-rendering on the server without making the
 * view unusable, so this page loads a graph library.
 *
 * Cytoscape is vendored into the application and served from it, not fetched from a CDN,
 * so the deployment still depends on nothing external.
 */

export interface GraphPageInput {
  run: RunRow;
  config: ExperimentConfig;
  graph: RunGraph;
  extractions: ExtractionRow[];
  /**
   * Stamped onto the client asset URLs. The assets are served with a long cache life,
   * so without this a deploy would leave browsers running the previous script against
   * the current page for an hour.
   */
  assetVersion: string;
}

export function graphPage(input: GraphPageInput): string {
  const { run, graph, extractions } = input;
  const runId = run.run_id;

  return page(
    `Graph of ${runId}`,
    `
  <style>${GRAPH_STYLES}${RUN_NAV_STYLES}</style>

  ${runMasthead({ run, config: input.config, active: 'graph' })}

  <div class="gr-modes" role="tablist" aria-label="Graph layers">
    <button type="button" class="gr-mode on" data-mode="interaction" role="tab"
            aria-selected="true">Interaction</button>
    <button type="button" class="gr-mode" data-mode="ideas" role="tab"
            aria-selected="false"${graph.extraction ? '' : ' disabled'}>Ideas</button>
    <p class="gr-mode-note" id="gr-mode-note">${
      graph.extraction
        ? 'Interaction shows only what was recorded. Ideas adds topics, concepts and claims read out of the text afterwards.'
        : 'Interaction shows only what was recorded. No idea extraction has been run for this run yet.'
    }</p>
  </div>

  ${renderProvenance(graph, extractions, runId)}

  <div class="gr-layout">
    <div class="gr-main">
      ${renderControls(input)}
      <div id="gr-canvas" class="gr-canvas" role="application"
           aria-label="Graph of participants and ideas. The same information is available as text in the tables linked below."></div>
      ${renderScrubber(graph)}
      ${renderLegend()}
    </div>
    <aside id="gr-inspector" class="gr-inspector" aria-live="polite">
      <p class="gr-placeholder">Select a node or an edge to see what it was derived from.</p>
    </aside>
  </div>

  <section>
    <h2>Reading this without the canvas</h2>
    <p class="note">The graph is a drawing of counts that are also available as text.
    Nothing here is reachable only by pointing at a picture.</p>
    <p class="ins-actions">
      <a class="btn-sm" href="/runs/${esc(runId)}/structure">Interaction matrix</a>
      <a class="btn-sm" href="/runs/${esc(runId)}/timeline">Interaction timeline</a>
      <a class="btn-sm" href="/api/runs/${esc(runId)}/graph">This graph as JSON</a>
      <a class="btn-sm" href="/api/runs/${esc(runId)}/messages">Raw messages</a>
    </p>
  </section>

  <script id="gr-data" type="application/json">${JSON.stringify(graph).replace(
    /</g,
    '\\u003c',
  )}</script>
  <script src="/static/cytoscape.min.js?v=${esc(input.assetVersion)}"></script>
  <script src="/static/graph.js?v=${esc(input.assetVersion)}"></script>
`,
  );
}

function renderProvenance(
  graph: RunGraph,
  extractions: ExtractionRow[],
  runId: string,
): string {
  const failed = extractions.filter((e) => e.status === 'failed');

  if (!graph.extraction) {
    return `<div class="gr-prov none">
      <p><b>No idea extraction for this run.</b> The graph below shows recorded
      communication only. Topics, concepts and claims are produced by a separate pass over
      the finished transcript, which calls a model and therefore costs money, so it is
      never started by opening a page.</p>
      <p class="gr-prov-how">Run it with
      <span class="mono">npm run agora -- extract ${esc(runId)}</span>, or
      <span class="mono">--extractor stub</span> for a free, meaningless-but-complete
      stand-in that exercises the pipeline.</p>
      ${
        failed.length > 0
          ? `<p class="gr-prov-failed">${failed.length} previous extraction${
              failed.length === 1 ? '' : 's'
            } failed and ${failed.length === 1 ? 'is' : 'are'} kept on record.</p>`
          : ''
      }
    </div>`;
  }

  const e = graph.extraction;
  const stub = e.method === 'keyword_stub';
  return `<div class="gr-prov ${stub ? 'stub' : ''}">
    <p><b>Ideas are derived, not recorded.</b> ${
      stub
        ? 'This reading came from the stub: its labels are derived mechanically from word frequency and mean nothing.'
        : 'Topics, concepts and claims were read out of the transcript after the run finished, and each carries the messages it came from.'
    }</p>
    <details class="gr-prov-more">
    <summary>How this reading was produced</summary>
    <p>${
      stub
        ? 'The stub exists to exercise the pipeline without spending tokens. It must not be read as a reading of the discussion.'
        : 'This is an analysis of the record, not part of it. Every derived node carries the messages it was read out of.'
    }</p>
    <dl class="gr-prov-facts">
      <div><dt>Extraction</dt><dd class="mono">${esc(e.extractionId)}</dd></div>
      <div><dt>Method</dt><dd class="mono">${esc(e.method)}</dd></div>
      <div><dt>Model</dt><dd class="mono">${esc(e.model)}</dd></div>
      <div><dt>Pipeline</dt><dd class="mono">${esc(e.pipelineVersion)}</dd></div>
      <div><dt>Prompt</dt><dd class="mono">${esc(e.promptVersion)}</dd></div>
      <div><dt>Extracted</dt><dd>${esc(e.createdAt.replace('T', ' ').slice(0, 19))}</dd></div>
    </dl>
    </details>
  </div>`;
}

function renderControls(input: GraphPageInput): string {
  const agents = [
    input.config.moderator.id,
    ...input.config.participants.map((p) => p.id),
  ];

  return `<div class="ex-filters gr-controls">
    <fieldset>
      <legend>Show</legend>
      <div class="chips" id="gr-kinds">
        ${kindToggle('agent', 'Agents', true)}
        ${kindToggle('moderator', 'Moderator', true)}
        ${kindToggle('topic', 'Topics', true, true)}
        ${kindToggle('concept', 'Concepts', false, true)}
        ${kindToggle('claim', 'Claims', false, true)}
      </div>
      <p class="ex-hint">Concepts and claims start hidden: a long run produces many, and
      they bury the structure on first sight.</p>
    </fieldset>
    <fieldset>
      <legend>Communication</legend>
      <div class="chips" id="gr-relations">
        ${relToggle('public_message', 'Public', true)}
        ${relToggle('private_message', 'Private', true)}
      </div>
    </fieldset>
    <fieldset>
      <legend>Phase</legend>
      <div class="chips" id="gr-phases">
        <button type="button" class="chip on" data-phase="">Whole run</button>
        ${input.graph.phases
          .filter((p) => p.phase !== 'CREATED' && p.phase !== 'COMPLETED')
          .map(
            (p) =>
              `<button type="button" class="chip" data-phase="${esc(p.phase)}">${esc(
                p.label,
              )}</button>`,
          )
          .join('')}
      </div>
    </fieldset>
    <fieldset>
      <legend>Participants</legend>
      <div class="chips" id="gr-agents">
        <button type="button" class="chip on" data-agent="">All</button>
        ${agents
          .map(
            (id) =>
              `<button type="button" class="chip" data-agent="${esc(id)}">${esc(
                input.config.participants.find((p) => p.id === id)?.display_name ??
                  input.config.moderator.display_name,
              )}</button>`,
          )
          .join('')}
      </div>
    </fieldset>
    <fieldset>
      <legend>Search</legend>
      <div class="gr-search">
        <label class="visually-hidden" for="gr-q">Search the graph</label>
        <input id="gr-q" type="search" placeholder="agent, topic, concept, claim">
      </div>
    </fieldset>
    <fieldset>
      <legend>Layout</legend>
      <div class="chips">
        <button type="button" class="chip" id="gr-fit">Fit</button>
        <button type="button" class="chip" id="gr-relayout">Re-lay out</button>
        <button type="button" class="chip" id="gr-freeze">Freeze</button>
        <button type="button" class="chip" id="gr-clear">Clear focus</button>
      </div>
    </fieldset>
  </div>`;
}

const kindToggle = (kind: string, label: string, on: boolean, derived = false): string =>
  `<button type="button" class="chip${on ? ' on' : ''}${derived ? ' derived' : ''}"
     data-kind="${kind}" aria-pressed="${on}">${esc(label)}</button>`;

const relToggle = (relation: string, label: string, on: boolean): string =>
  `<button type="button" class="chip${on ? ' on' : ''}" data-relation="${relation}"
     aria-pressed="${on}">${esc(label)}</button>`;

function renderScrubber(graph: RunGraph): string {
  return `<div class="gr-time">
    <div class="gr-time-bands">${graph.phases
      .filter((p) => p.phase !== 'CREATED' && p.phase !== 'COMPLETED')
      .map((p) => {
        const span = Math.max(1, graph.maxSequence - graph.minSequence);
        const left = ((p.fromSequence - graph.minSequence) / span) * 100;
        const width = ((p.toSequence - p.fromSequence) / span) * 100;
        return `<span class="gr-time-band" style="left:${Math.max(0, left).toFixed(
          2,
        )}%;width:${Math.max(2, width).toFixed(2)}%">${esc(p.label)}</span>`;
      })
      .join('')}</div>
    <div class="gr-time-row">
      <button type="button" class="gr-btn" id="gr-play" aria-label="Play">Play</button>
      <button type="button" class="gr-btn" id="gr-prev" aria-label="Previous event">Back</button>
      <button type="button" class="gr-btn" id="gr-next" aria-label="Next event">Forward</button>
      <label class="visually-hidden" for="gr-scrub">Position in the run</label>
      <input id="gr-scrub" type="range" min="${graph.minSequence}" max="${graph.maxSequence}"
             value="${graph.maxSequence}" step="1">
      <span class="gr-time-read" id="gr-time-read">whole run</span>
    </div>
    <p class="ex-hint">The control moves through the recorded order of events. What it
    shows is what had been recorded by that point, not what any agent knew.</p>
  </div>`;
}

function renderLegend(): string {
  return `<ul class="gr-legend">
    <li><span class="gr-key k-agent"></span> Agent <span class="muted">recorded</span></li>
    <li><span class="gr-key k-moderator"></span> Moderator <span class="muted">recorded</span></li>
    <li><span class="gr-key k-topic"></span> Topic <span class="muted">derived</span></li>
    <li><span class="gr-key k-concept"></span> Concept <span class="muted">derived</span></li>
    <li><span class="gr-key k-claim"></span> Claim <span class="muted">derived</span></li>
    <li><span class="gr-line solid"></span> Public message</li>
    <li><span class="gr-line dashed"></span> Private message</li>
    <li><span class="gr-line dotted"></span> Derived relation</li>
  </ul>
  <p class="ex-hint">Recorded entities are filled and solid. Derived ones are outlined and
  dotted, so an analysis is never mistaken for a record.</p>`;
}

export const GRAPH_STYLES = `
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
                   overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

.gr-modes { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap;
            margin-bottom: 1rem; }
.gr-mode { font: inherit; font-size: .88rem; font-weight: 650; padding: .35rem .9rem;
           border: 1px solid var(--line); background: var(--paper); color: var(--muted);
           border-radius: 8px; cursor: pointer; }
.gr-mode.on { background: var(--ink); border-color: var(--ink); color: #fff; }
.gr-mode:disabled { opacity: .45; cursor: not-allowed; }
.gr-mode-note { flex: 1 1 20rem; margin: 0; font-size: .8rem; color: var(--muted); }

.gr-prov { border: 1px solid var(--line); border-left-width: 3px; border-radius: 10px;
           padding: .9rem 1.1rem; margin-bottom: 1rem; background: var(--panel); }
.gr-prov p { margin: 0 0 .4rem; font-size: .88rem; }
.gr-prov p:last-child { margin-bottom: 0; }
.gr-prov.none { border-left-color: var(--muted); }
.gr-prov.stub { border-left-color: var(--warn); background: var(--warn-bg); }
.gr-prov-how { color: var(--muted); }
.gr-prov-failed { color: var(--warn); }
.gr-prov-more summary { cursor: pointer; font-size: .8rem; color: var(--muted);
                        font-weight: 600; }
.gr-prov-more p { margin: .5rem 0 0; }
.gr-prov-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
                 gap: .4rem 1.2rem; margin: .6rem 0 0; }
.gr-prov-facts div { display: flex; flex-direction: column; min-width: 0; }
.gr-prov-facts dt { font-size: .64rem; letter-spacing: .07em; text-transform: uppercase;
                    color: var(--muted); }
.gr-prov-facts dd { margin: 0; font-size: .8rem; overflow-wrap: anywhere; }

.gr-layout { display: grid; grid-template-columns: minmax(0, 1fr) 21rem; gap: 1rem;
             align-items: start; }
/* Cytoscape stacks its own layers with z-index inside this element. Giving the element
   a stacking context of its own keeps those layers contained, so the canvas cannot paint
   over the masthead when the page scrolls under it. */
.gr-canvas { height: 30rem; border: 1px solid var(--line); border-radius: 12px;
             background: var(--panel); position: relative; z-index: 0; overflow: hidden; }
.gr-canvas:focus-visible { outline: 2px solid var(--accent); }

.gr-controls { margin-bottom: .8rem; }
.gr-controls .chip { font: inherit; font-size: .78rem; cursor: pointer; }
.gr-controls .chip.derived { border-style: dashed; }
.gr-search input { font: inherit; font-size: .82rem; padding: .2rem .5rem;
                   border: 1px solid var(--line); border-radius: 6px; min-width: 12rem;
                   background: var(--paper); color: var(--ink); }

.gr-time { margin-top: .8rem; }
.gr-time-bands { position: relative; height: 1.1rem; margin-bottom: .2rem; }
.gr-time-band { position: absolute; top: 0; font-size: .62rem; letter-spacing: .06em;
                text-transform: uppercase; color: var(--muted); font-weight: 700;
                border-left: 2px solid var(--line); padding-left: .3rem;
                white-space: nowrap; overflow: hidden; }
.gr-time-row { display: flex; align-items: center; gap: .5rem; }
.gr-btn { font: inherit; font-size: .78rem; padding: .18rem .6rem; border-radius: 6px;
          border: 1px solid var(--line); background: var(--paper); color: var(--ink);
          cursor: pointer; }
.gr-btn:hover { border-color: var(--accent); color: var(--accent); }
#gr-scrub { flex: 1; accent-color: var(--accent); }
.gr-time-read { font-family: var(--mono); font-size: .74rem; color: var(--muted);
                min-width: 7rem; text-align: right; }

.gr-legend { list-style: none; display: flex; flex-wrap: wrap; gap: .5rem 1rem;
             margin: .8rem 0 0; padding: 0; font-size: .78rem; color: var(--ink); }
.gr-legend li { display: flex; align-items: center; gap: .35rem; }
.gr-key { width: .8rem; height: .8rem; border-radius: 50%; display: inline-block; }
.gr-key.k-agent { background: var(--accent); }
.gr-key.k-moderator { background: var(--ink); }
.gr-key.k-topic { background: transparent; border: 2px dashed var(--priv); border-radius: 3px; }
.gr-key.k-concept { background: transparent; border: 2px dashed var(--ok); }
.gr-key.k-claim { background: transparent; border: 2px dashed var(--muted); border-radius: 0; }
.gr-line { width: 1.4rem; height: 0; border-top: 2px solid var(--muted); display: inline-block; }
.gr-line.dashed { border-top-style: dashed; }
.gr-line.dotted { border-top-style: dotted; }

.gr-inspector { border: 1px solid var(--line); border-radius: 12px; background: var(--panel);
                padding: 1rem 1.1rem; position: sticky; top: 1rem; max-height: 42rem;
                overflow-y: auto; }
.gr-placeholder { color: var(--muted); font-size: .86rem; margin: 0; }
.gr-inspector h3 { margin: 0 0 .1rem; font-size: 1rem; overflow-wrap: anywhere; }
.gr-badge { display: inline-block; font-size: .64rem; letter-spacing: .08em;
            text-transform: uppercase; font-weight: 700; padding: .1rem .45rem;
            border-radius: 4px; margin-bottom: .5rem; }
.gr-badge.recorded { background: var(--ok-bg); color: var(--ok); }
.gr-badge.derived { background: var(--warn-bg); color: var(--warn); }
.gr-facts { margin: .6rem 0; display: grid; gap: .35rem; }
.gr-facts div { display: flex; justify-content: space-between; gap: .6rem;
                font-size: .82rem; border-bottom: 1px solid var(--line); padding-bottom: .25rem; }
.gr-facts dt { color: var(--muted); }
.gr-facts dd { margin: 0; text-align: right; overflow-wrap: anywhere; }
.gr-evidence { margin: .6rem 0 0; padding: 0; list-style: none; display: grid; gap: .5rem; }
.gr-evidence li { border-left: 2px solid var(--line); padding-left: .6rem; font-size: .82rem; }
.gr-evidence .mono { font-size: .7rem; color: var(--muted); }
.gr-inspector .ins-actions { margin-top: .8rem; }

@media (max-width: 62rem) {
  .gr-layout { grid-template-columns: minmax(0, 1fr); }
  .gr-inspector { position: static; max-height: none; }
}
`;
