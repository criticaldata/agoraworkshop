import { esc } from '../export/replayHtml.js';
import type { ExperimentConfig } from '../config/schema.js';
import type { RunRow } from '../db/queries.js';

/**
 * The masthead carried by every view of a run.
 *
 * A run is one object looked at six ways, and a researcher moving between those ways
 * should never have to work out which run they are in or how to get back. So the
 * identity of the run and the full set of views travel together, and they stay put when
 * the page scrolls.
 *
 * The order of the views is not arbitrary and is not alphabetical: it is the audit path.
 * The graph is a drawing of counts; the timeline is the ordered record of what produced
 * them; the transcript is the words themselves; the turns are every call to a model. Left
 * to right is summary to source, which is the one claim this interface makes about how
 * its own views relate.
 */

export type RunView =
  | 'graph'
  | 'timeline'
  | 'structure'
  | 'transcript'
  | 'turns'
  | 'checks'
  | 'agent';

interface ViewLink {
  view: RunView;
  label: string;
  href: (runId: string) => string;
  /** What this view shows, for the title attribute and the screen reader. */
  hint: string;
}

const VIEWS: ViewLink[] = [
  {
    view: 'graph',
    label: 'Graph',
    href: (id) => `/runs/${id}`,
    hint: 'Participants and ideas as a network',
  },
  {
    view: 'timeline',
    label: 'Timeline',
    href: (id) => `/runs/${id}/timeline`,
    hint: 'Every recorded event in order, by participant',
  },
  {
    view: 'structure',
    label: 'Structure',
    href: (id) => `/runs/${id}/structure`,
    hint: 'Who communicated with whom, as a matrix',
  },
  {
    view: 'transcript',
    label: 'Transcript',
    href: (id) => `/runs/${id}/transcript`,
    hint: 'The messages, in the order they were sent',
  },
  {
    view: 'turns',
    label: 'Turns',
    href: (id) => `/runs/${id}/turns`,
    hint: 'Every call to a model, including the ones that failed',
  },
  {
    view: 'checks',
    label: 'Checks',
    href: (id) => `/runs/${id}/validation`,
    hint: 'Whether this run supports what it is being asked to support',
  },
];

export interface MastheadInput {
  run: RunRow;
  config: ExperimentConfig;
  active: RunView;
  /** Shown after the run identity when a view is about one participant. */
  context?: { label: string; href?: string } | null;
  /** Live runs refresh; the masthead says so rather than leaving it to be noticed. */
  isRunning?: boolean;
}

export function runMasthead(input: MastheadInput): string {
  const { run, config, active } = input;

  const statusTone =
    run.status === 'COMPLETED'
      ? 'ok'
      : run.status === 'RUNNING'
        ? ''
        : run.status === 'INTERRUPTED'
          ? 'unproven'
          : 'bad';

  return `<header class="rn" aria-label="This run">
    <div class="rn-top">
      <nav class="rn-crumbs" aria-label="Breadcrumb">
        <a href="/runs">Runs</a>
        <span aria-hidden="true">›</span>
        <span class="rn-topic" title="${esc(config.workshop.topic)}">${esc(
          config.workshop.topic,
        )}</span>
        ${
          input.context
            ? `<span aria-hidden="true">›</span>${
                input.context.href
                  ? `<a href="${esc(input.context.href)}">${esc(input.context.label)}</a>`
                  : `<span class="rn-context">${esc(input.context.label)}</span>`
              }`
            : ''
        }
      </nav>
      <dl class="rn-facts">
        <div><dt>Run</dt><dd class="mono">${esc(run.run_id.replace(/^run_/, ''))}</dd></div>
        <div><dt>Status</dt><dd><span class="pill ${statusTone}">${esc(run.status)}</span></dd></div>
        <div><dt>Model</dt><dd class="mono">${esc(run.provider)} ${esc(run.model)}</dd></div>
        <div><dt>Settings</dt><dd class="mono" title="${esc(run.config_hash)}">${esc(
          run.config_hash.slice(7, 19),
        )}</dd></div>
        <div><dt>Moderator</dt><dd>${esc(config.moderator.mode ?? 'llm')}</dd></div>
      </dl>
    </div>

    <nav class="rn-views" aria-label="Ways of looking at this run">
      ${VIEWS.map(
        (v) =>
          `<a class="rn-view${v.view === active ? ' on' : ''}"
              href="${esc(v.href(run.run_id))}"
              title="${esc(v.hint)}"${v.view === active ? ' aria-current="page"' : ''}>${esc(
                v.label,
              )}</a>`,
      ).join('')}
      <span class="rn-scale" aria-hidden="true">summary to source</span>
    </nav>
  </header>`;
}

/**
 * Actions that change something, kept out of the masthead.
 *
 * Navigation and action are different promises. A tab shows you a different view of what
 * you already have; a button here starts a run or writes files. Mixing them into one
 * strip is how someone spends money meaning to navigate.
 */
export function runActions(run: RunRow, exportedFiles: number): string {
  return `<div class="rn-actions">
    <form method="post" action="/runs/${esc(run.run_id)}/rerun">
      <button type="submit">Run again with the same settings</button>
    </form>
    <form method="post" action="/runs/${esc(run.run_id)}/export">
      <button type="submit" class="secondary">${
        exportedFiles > 0 ? 'Export bundle again' : 'Export bundle'
      }</button>
    </form>
    <a href="/runs/${esc(run.run_id)}/replay"><button type="button" class="secondary">Standalone replay</button></a>
    <a href="/api/runs/${esc(run.run_id)}"><button type="button" class="secondary">Raw data</button></a>
  </div>`;
}

export const RUN_NAV_STYLES = `
/* Every view of a run shares one frame width, so the masthead does not change size as
   you move between tabs. The shared stylesheet holds operator pages to a reading measure,
   which suits a column of prose and starves a canvas or a wide table.
   
   Prose keeps its measure inside that frame: a paragraph set across 92rem is a paragraph
   nobody finishes. So the frame is wide, and the text is not. */
main { max-width: 92rem; }
main > section > p,
main > section > h2 + p,
.page-head p,
.ex-head p,
.rn ~ * .note { max-width: 58rem; }

.rn {
  position: sticky; top: 0; z-index: 20;
  margin: 0 0 1.5rem; padding: .8rem 0 0;
  /* Two stylesheets are in play: the overview names the page ground --paper, the
     operator pages name it --bg. An undefined token here is a transparent masthead that
     the graph canvas scrolls straight through, so both are named with a literal last. */
  background: var(--bg, var(--paper, #f7f9fb));
  border-bottom: 1px solid var(--line);
}
.rn-top { display: flex; flex-wrap: wrap; gap: .4rem 1.5rem; align-items: baseline;
          justify-content: space-between; }

.rn-crumbs { display: flex; align-items: baseline; gap: .4rem; min-width: 0;
             font-size: .88rem; }
.rn-crumbs a { text-decoration: none; font-weight: 600; }
.rn-crumbs a:hover { text-decoration: underline; }
.rn-crumbs span[aria-hidden] { color: var(--line); }
/* The topic is the one human-readable name a run has, so it gets the room. */
.rn-topic { font-weight: 700; color: var(--ink); overflow: hidden;
            text-overflow: ellipsis; white-space: nowrap; max-width: 34rem; }
.rn-context { color: var(--muted); }

.rn-facts { display: flex; flex-wrap: wrap; gap: .1rem 1.1rem; margin: 0; }
.rn-facts div { display: flex; align-items: baseline; gap: .35rem; }
.rn-facts dt { font-size: .62rem; letter-spacing: .09em; text-transform: uppercase;
               color: var(--muted); }
.rn-facts dd { margin: 0; font-size: .8rem; }

.rn-views { display: flex; align-items: flex-end; gap: .1rem; margin-top: .7rem;
            flex-wrap: wrap; }
.rn-view {
  flex: 0 0 auto; padding: .4rem .85rem; font-size: .9rem; font-weight: 600;
  color: var(--muted); text-decoration: none;
  border: 1px solid transparent; border-bottom: none;
  border-radius: 8px 8px 0 0;
  /* Sits on the masthead's own rule, so the active view reads as the open drawer. */
  margin-bottom: -1px;
}
.rn-view:hover { color: var(--ink); background: var(--panel); }
.rn-view.on {
  color: var(--ink); background: var(--panel);
  border-color: var(--line); border-bottom: 1px solid var(--panel);
}
.rn-view:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
/* Left to right is summary to source. Stated once, quietly, at the end of the strip. */
.rn-scale { margin-left: auto; padding: 0 .2rem .5rem 1rem; align-self: flex-end;
            font-size: .62rem; letter-spacing: .09em; text-transform: uppercase;
            color: var(--line); white-space: nowrap; }

.rn-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center;
              margin: 0 0 1.5rem; }
.rn-actions form { margin: 0; }

@media (max-width: 60rem) {
  .rn { position: static; }
  .rn-topic { max-width: 100%; }
  .rn-scale { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
`;
