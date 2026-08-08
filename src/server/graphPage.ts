import { esc } from '../export/replayHtml.js';
import { page } from './pages.js';
import type { RunRow } from '../db/queries.js';
import type { ExperimentConfig } from '../config/schema.js';
import type { RunGraph } from '../analytics/graph.js';
import type { ExtractionRow } from '../semantic/types.js';
import { runMasthead, RUN_NAV_STYLES } from './runNav.js';
import type { ViewMode } from './viewMode.js';

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
  mode: ViewMode;
  returnTo: string;
}

export function graphPage(input: GraphPageInput): string {
  const { run, graph, extractions, mode } = input;
  const runId = run.run_id;
  const participants = input.config.participants.length;

  return page(
    `Graph of ${runId}`,
    `
  <style>${GRAPH_STYLES}${RUN_NAV_STYLES}</style>

  ${runMasthead({
    run,
    config: input.config,
    active: 'graph',
    mode,
    returnTo: input.returnTo,
  })}

  ${
    mode === 'full'
      ? `<div class="gr-modes" role="tablist" aria-label="Graph layers">
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

  ${renderProvenance(graph, extractions, runId)}`
      : `<p class="gr-lede">${participants} agents and a moderator, in a controlled
  workshop. Every line is a message that was sent and delivered. Select one to see the
  message, the exact context the agent was given, and the model call behind it.</p>`
  }

  ${renderControls(input)}

  <div class="gr-stage">
    <div id="gr-canvas" class="gr-canvas" role="application"
         aria-label="Graph of participants and ideas. The same information is available as text in the tables linked below."></div>
    <aside id="gr-inspector" class="gr-inspector empty-state" aria-live="polite">
      <p class="gr-placeholder">Select a node or an edge to see what it was derived from.</p>
    </aside>
    ${renderTransport()}
  </div>

  ${renderScrubber(graph)}
  ${renderLegend(mode)}

  <section>
    <h2>Reading this without the canvas</h2>
    <p class="note">The graph is a drawing of counts that are also available as text.
    Nothing here is reachable only by pointing at a picture.</p>
    <p class="ins-actions">
      ${
        mode === 'full'
          ? `<a class="btn-sm" href="/runs/${esc(runId)}/structure">Interaction matrix</a>
      <a class="btn-sm" href="/runs/${esc(runId)}/timeline">Interaction timeline</a>
      <a class="btn-sm" href="/api/runs/${esc(runId)}/graph">This graph as JSON</a>
      <a class="btn-sm" href="/api/runs/${esc(runId)}/messages">Raw messages</a>`
          : `<a class="btn-sm" href="/runs/${esc(runId)}/timeline">Every message, in order</a>`
      }
    </p>
  </section>

  <script id="gr-data" type="application/json">${JSON.stringify(graph).replace(
    /</g,
    '\\u003c',
  )}</script>
  <script src="/static/cytoscape.min.js?v=${esc(input.assetVersion)}"></script>
  <script src="/static/graph.js?v=${esc(input.assetVersion)}"></script>
`,
    { mode },
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
  const full = input.mode === 'full';

  return `<div class="ex-filters gr-controls">
    ${
      full
        ? `<fieldset>
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
    </fieldset>`
        : ''
    }
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
    ${
      full
        ? `<fieldset>
      <legend>Search</legend>
      <div class="gr-search">
        <label class="visually-hidden" for="gr-q">Search the graph</label>
        <input id="gr-q" type="search" placeholder="agent, topic, concept, claim">
      </div>
    </fieldset>`
        : ''
    }
    <fieldset>
      <legend>Layout</legend>
      <div class="chips">
        <button type="button" class="chip" id="gr-fit">Fit</button>
        ${
          full
            ? `<button type="button" class="chip" id="gr-relayout">Re-lay out</button>
        <button type="button" class="chip" id="gr-freeze">Freeze</button>`
            : ''
        }
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
  const span = Math.max(1, graph.maxSequence - graph.minSequence);

  return `<div class="gr-time">
    <div class="gr-track">
      <div class="gr-time-bands" aria-hidden="true">${graph.phases
        .filter((p) => p.phase !== 'CREATED' && p.phase !== 'COMPLETED')
        .map((p) => {
          const width = Math.max(1, p.toSequence - p.fromSequence + 1);
          return `<span class="gr-time-band" style="flex-grow:${width}" title="${esc(
            `${p.label}: positions ${p.fromSequence} to ${p.toSequence}`,
          )}">${esc(p.label)}</span>`;
        })
        .join('')}</div>
      <label class="visually-hidden" for="gr-scrub">Position in the run</label>
      <input id="gr-scrub" type="range" min="${graph.minSequence}" max="${graph.maxSequence}"
             value="${graph.maxSequence}" step="1">
    </div>

    <p class="ex-hint">The run plays through in recorded order when the page opens. What
    it shows is what had been recorded by that point, not what any agent knew. Phase bands
    are proportional to the number of positions in each phase; the readout on the canvas
    gives the exact phase at the current position.</p>
  </div>`;
}

/**
 * Transport controls, on the canvas rather than under it.
 *
 * They drive the drawing, so they sit on the drawing. Icons rather than words: these are
 * the three shapes every transport uses, and at this size a glyph is read faster than a
 * label. Each still carries its name for anyone not reading the shape.
 */
function renderTransport(): string {
  const icon = (paths: string): string =>
    `<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">${paths}</svg>`;

  return `<div class="gr-transport">
    <button type="button" class="gr-tbtn" id="gr-prev" aria-label="Step back one event"
            title="Step back one event">${icon(
              '<path d="M4 2.5v11H2.5v-11zM13.5 2.9v10.2L5.6 8z" fill="currentColor"/>',
            )}</button>
    <button type="button" class="gr-tbtn is-play" id="gr-play" aria-label="Pause"
            title="Pause">
      <span class="gr-ico-play">${icon('<path d="M3.5 2.2 13.5 8l-10 5.8z" fill="currentColor"/>')}</span>
      <span class="gr-ico-pause">${icon(
        '<path d="M3.5 2.5h3.2v11H3.5zM9.3 2.5h3.2v11H9.3z" fill="currentColor"/>',
      )}</span>
    </button>
    <button type="button" class="gr-tbtn" id="gr-next" aria-label="Step forward one event"
            title="Step forward one event">${icon(
              '<path d="M12 2.5v11h1.5v-11zM2.5 2.9v10.2L10.4 8z" fill="currentColor"/>',
            )}</button>
    <span class="gr-time-read" id="gr-time-read">playing</span>
  </div>`;
}

function renderLegend(mode: ViewMode): string {
  const derived =
    mode === 'full'
      ? `<li><span class="gr-key k-topic"></span> Topic <span class="muted">derived</span></li>
    <li><span class="gr-key k-concept"></span> Concept <span class="muted">derived</span></li>
    <li><span class="gr-key k-claim"></span> Claim <span class="muted">derived</span></li>`
      : '';

  return `<ul class="gr-legend">
    <li><span class="gr-key k-agent"></span> Agent <span class="muted">recorded</span></li>
    <li><span class="gr-key k-moderator"></span> Moderator <span class="muted">recorded</span></li>
    <li><span class="gr-key k-failed"></span> Turn the apparatus failed to deliver</li>
    ${derived}
    <li><span class="gr-line solid"></span> Public message</li>
    <li><span class="gr-line dashed"></span> Private message</li>
    ${mode === 'full' ? '<li><span class="gr-line dotted"></span> Derived relation</li>' : ''}
  </ul>
  <p class="ex-hint">${
    mode === 'full'
      ? `Recorded entities are filled and solid. Derived ones are outlined and dotted, so an
  analysis is never mistaken for a record. A double ring counts turns the apparatus never
  delivered, which is not the same as an agent choosing not to speak.`
      : `A double ring counts turns the apparatus never delivered. That is a failure of the
  instrument, and it is drawn apart from an agent choosing not to speak.`
  }</p>`;
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

/* The one sentence the simple view exists to deliver. It sits where the layer switch and
   the extraction provenance sit in the full view, so the page opens on what it is rather
   than on what else it could show. */
.gr-lede { max-width: 46rem; margin: 0 0 1rem; font-size: 1rem; line-height: 1.5;
           color: var(--ink); }

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

.gr-stage { position: relative; }
/* Cytoscape stacks its own layers with z-index inside this element. Giving the element
   a stacking context of its own keeps those layers contained, so the canvas cannot paint
   over the masthead when the page scrolls under it. */
.gr-canvas { height: min(70vh, 42rem); border: 1px solid var(--line); border-radius: 12px;
             background: var(--panel); position: relative; z-index: 0; overflow: hidden; }
.gr-canvas:focus-visible { outline: 2px solid var(--accent); }

.gr-controls { margin-bottom: .8rem; }
.gr-controls .chip { font: inherit; font-size: .78rem; cursor: pointer; }
.gr-controls .chip.derived { border-style: dashed; }
.gr-search input { font: inherit; font-size: .82rem; padding: .2rem .5rem;
                   border: 1px solid var(--line); border-radius: 6px; min-width: 12rem;
                   background: var(--paper); color: var(--ink); }

.gr-time { margin-top: .8rem; }

/* On the canvas, bottom left: the controls drive the drawing, so they sit on it. */
.gr-transport {
  position: absolute; left: .75rem; bottom: .75rem;
  display: flex; align-items: center; gap: .3rem;
  padding: .3rem .45rem; border-radius: 9px;
  background: rgba(255, 255, 255, .92);
  border: 1px solid var(--line);
  box-shadow: 0 4px 14px rgba(20, 24, 31, .10);
}
.gr-tbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.9rem; height: 1.9rem; padding: 0;
  border: 1px solid transparent; border-radius: 7px;
  background: transparent; color: var(--muted); cursor: pointer;
}
.gr-tbtn:hover { color: var(--ink); background: var(--paper, #f7f9fb); }
.gr-tbtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.gr-tbtn.is-play { color: var(--ink); }
/* One button, two states: the icon shown is the action the button performs. */
.gr-tbtn .gr-ico-pause { display: inline-flex; }
.gr-tbtn .gr-ico-play { display: none; }
.gr-tbtn.paused .gr-ico-pause { display: none; }
.gr-tbtn.paused .gr-ico-play { display: inline-flex; }
/* The bands and the slider share one column so a band sits over the stretch of track it
   describes. They were laid out across the whole row while the track began after the
   buttons, which put every band to the left of the positions it named. */
.gr-track { display: flex; flex-direction: column; }
.gr-time-bands { display: flex; align-items: flex-end; }
/* Proportional to the positions in the phase, but never narrower than its own name: a
   one-position phase would otherwise clip to a single letter. The width of a short band
   is therefore approximate, which is why the exact phase is read out above. */
.gr-time-band { flex-basis: 0; min-width: max-content;
                font-size: .62rem; letter-spacing: .06em; text-transform: uppercase;
                color: var(--muted); font-weight: 700;
                border-left: 2px solid var(--line); padding: 0 .5rem .25rem .3rem;
                white-space: nowrap; }
.gr-btn { font: inherit; font-size: .78rem; padding: .18rem .6rem; border-radius: 6px;
          border: 1px solid var(--line); background: var(--paper); color: var(--ink);
          cursor: pointer; }
.gr-btn:hover { border-color: var(--accent); color: var(--accent); }
#gr-scrub { width: 100%; margin: 0; accent-color: var(--accent); }
.gr-time-read { font-family: var(--mono); font-size: .7rem; color: var(--muted);
                padding: 0 .35rem 0 .2rem; white-space: nowrap; }

.gr-legend { list-style: none; display: flex; flex-wrap: wrap; gap: .5rem 1rem;
             margin: .8rem 0 0; padding: 0; font-size: .78rem; color: var(--ink); }
.gr-legend li { display: flex; align-items: center; gap: .35rem; }
.gr-key { width: .8rem; height: .8rem; border-radius: 50%; display: inline-block; }
.gr-key.k-agent { background: var(--accent); }
.gr-key.k-moderator { background: var(--ink); }
.gr-key.k-topic { background: transparent; border: 2px dashed var(--priv); border-radius: 3px; }
.gr-key.k-concept { background: transparent; border: 2px dashed var(--ok); }
.gr-key.k-claim { background: transparent; border: 2px dashed var(--muted); border-radius: 0; }
/* The double ring the canvas draws on a participant the apparatus failed. */
.gr-key.k-failed { background: transparent; border: 3px double #b45309; }
.gr-line { width: 1.4rem; height: 0; border-top: 2px solid var(--muted); display: inline-block; }
.gr-line.dashed { border-top-style: dashed; }
.gr-line.dotted { border-top-style: dotted; }

/* The inspector sits on the canvas rather than beside it. What it describes is a node or
   an edge a few centimetres away, and a column at the edge of the page put the
   explanation as far from the thing as the layout allowed. */
.gr-inspector {
  position: absolute; top: .75rem; right: .75rem;
  width: min(23rem, calc(100% - 1.5rem)); max-height: calc(100% - 1.5rem);
  overflow-y: auto; padding: .9rem 1.05rem;
  background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  box-shadow: 0 8px 26px rgba(20, 24, 31, .12);
}
/* With nothing selected it is only an instruction, so it stops looking like a panel. */
.gr-inspector.empty-state {
  width: auto; max-width: 17rem; padding: .45rem .7rem;
  box-shadow: none; background: rgba(255, 255, 255, .88);
  font-size: .78rem;
}
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

/* Narrow enough that an overlay would cover the graph it explains: put it back below. */
@media (max-width: 52rem) {
  .gr-canvas { height: 26rem; }
  .gr-inspector, .gr-inspector.empty-state {
    position: static; width: auto; max-width: none; max-height: none;
    margin-top: .75rem; box-shadow: none;
  }
}
`;
