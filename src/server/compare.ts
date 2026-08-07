import { esc } from '../export/replayHtml.js';
import { page } from './pages.js';
import type { ExperimentConfig } from '../config/schema.js';
import { displayName } from '../config/schema.js';
import {
  MARKER_SYMBOL,
  phaseLabel,
  type RunComparison,
  type Timeline,
} from '../analytics/interaction.js';
import { EXPLORER_STYLES } from './explorer.js';

/**
 * Comparison across runs.
 *
 * Model generation is stochastic, so two runs of one configuration are two samples of a
 * distribution, not a result and a deviation from it. Every measure is therefore shown
 * as a spread with each run's own value visible, never as a single average that would
 * present a range of outcomes as a fact.
 *
 * When the runs do not share a configuration, or used different moderator policies, the
 * page says so before showing any numbers. Comparing them may still be what the
 * researcher intends, but it must never happen silently.
 */

export interface ComparedRun {
  runId: string;
  config: ExperimentConfig;
  timeline: Timeline;
}

export interface ComparePageInput {
  comparison: RunComparison;
  timelines: ComparedRun[];
  /** Groups of comparable runs to offer when nothing is selected. */
  groups: Array<{
    configHash: string;
    experimentId: string;
    model: string;
    moderatorMode: string;
    runIds: string[];
  }>;
}

export function comparePage(input: ComparePageInput): string {
  const { comparison, groups } = input;

  if (comparison.runs.length === 0) {
    return page('Compare runs', `
  <style>${EXPLORER_STYLES}${COMPARE_STYLES}</style>
  <header class="page-head">
    <p class="eyebrow">Compare</p>
    <h1>Compare runs</h1>
    <p class="note">Runs recorded under the same settings fingerprint were carried out
    under the same conditions and are the ones worth comparing. Groups with two or more
    completed runs are listed first.</p>
  </header>
  ${renderGroups(groups)}
`);
  }

  return page(
    `Comparing ${comparison.runs.length} runs`,
    `
  <style>${EXPLORER_STYLES}${COMPARE_STYLES}</style>

  <header class="page-head">
    <p class="eyebrow">Compare</p>
    <h1>${comparison.runs.length} runs side by side</h1>
  </header>

  ${renderWarnings(comparison)}
  ${renderRunTable(comparison)}
  ${renderSpreads(comparison)}
  ${renderTimelines(input)}

  <section>
    <h2>Other comparable groups</h2>
    ${renderGroups(groups)}
  </section>
`,
  );
}

function renderWarnings(comparison: RunComparison): string {
  const warnings: string[] = [];
  if (!comparison.sameConfiguration) {
    warnings.push(
      `These runs do not share a settings fingerprint (${comparison.configHashes.length} distinct). ` +
        'Differences between them may come from the change in configuration rather than from ' +
        'anything that happened during the runs.',
    );
  }
  if (!comparison.sameModerator) {
    warnings.push(
      `These runs used different moderator policies (${comparison.moderatorModes.join(', ')}). ` +
        'A scripted moderator and a model moderator are materially different conditions.',
    );
  }
  const incomplete = comparison.runs.filter((r) => !r.completed);
  if (incomplete.length > 0) {
    warnings.push(
      `${incomplete.length} of these runs did not complete. Their measures cover only the part ` +
        'of the workshop that ran.',
    );
  }

  if (warnings.length === 0) {
    return `<div class="cmp-note ok">
      <p><b>Same configuration.</b> These runs share one settings fingerprint and one
      moderator policy, so differences between them are differences between samples.</p>
    </div>`;
  }
  return `<div class="cmp-note warn">
    <p class="cmp-note-head">Read these comparisons with care</p>
    <ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
  </div>`;
}

function renderRunTable(comparison: RunComparison): string {
  return `<section>
    <h2>Runs compared</h2>
    <div class="scroll">
      <table class="cmp-runs">
        <thead><tr>
          <th scope="col">Run</th><th scope="col">Experiment</th><th scope="col">Status</th>
          <th scope="col">Model</th><th scope="col">Moderator</th>
          <th scope="col">Settings fingerprint</th><th scope="col">Started</th>
        </tr></thead>
        <tbody>${comparison.runs
          .map(
            (run) => `<tr>
          <td><a class="mono" href="/runs/${esc(run.runId)}">${esc(run.runId)}</a></td>
          <td>${esc(run.experimentId)}</td>
          <td><span class="pill ${
            run.status === 'COMPLETED' ? 'ok' : run.status === 'INTERRUPTED' ? 'unproven' : 'bad'
          }">${esc(run.status)}</span></td>
          <td class="mono">${esc(run.model)}</td>
          <td>${esc(run.moderatorMode)}</td>
          <td class="mono">${esc(run.configHash.slice(0, 19))}</td>
          <td>${esc(run.createdAt.replace('T', ' ').slice(0, 19))}</td>
        </tr>`,
          )
          .join('')}</tbody>
      </table>
    </div>
  </section>`;
}

function renderSpreads(comparison: RunComparison): string {
  const rows = comparison.spreads
    .map((spread) => {
      const cells = comparison.runs
        .map((run) => {
          const value = run[spread.key];
          return `<td class="num">${value === null ? 'n/a' : esc(String(value))}</td>`;
        })
        .join('');
      const range = spread.identical
        ? '<span class="cmp-same">identical</span>'
        : `${spread.min} to ${spread.max}`;
      return `<tr>
        <th scope="row">${esc(spread.label)}</th>
        ${cells}
        <td class="num cmp-range">${range}</td>
        <td class="num">${spread.median}</td>
      </tr>`;
    })
    .join('');

  return `<section>
    <h2>Measures</h2>
    <p class="note">Each run's own value is shown. The range and median describe the
    sample; they are not a prediction of what another run would produce.</p>
    <div class="scroll">
      <table class="cmp-measures">
        <thead><tr>
          <th scope="col">Measure</th>
          ${comparison.runs
            .map(
              (r) =>
                `<th scope="col"><a class="mono" href="/runs/${esc(r.runId)}">${esc(
                  r.runId.slice(4, 12),
                )}</a></th>`,
            )
            .join('')}
          <th scope="col">Range</th><th scope="col">Median</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="ex-hint">Identical text between runs is not expected and is not a measure of
    reproducibility. Only the experimental conditions are reproducible.</p>
  </section>`;
}

/**
 * Two timelines stacked, aligned by phase rather than by clock.
 *
 * Aligning by timestamp would imply that the same moment in two runs is comparable,
 * which it is not: the runs are independent and their turns take different amounts of
 * time. Phase is the structure both runs genuinely share.
 */
function renderTimelines(input: ComparePageInput): string {
  if (input.timelines.length === 0) return '';

  return `<section>
    <h2>Side by side</h2>
    <p class="note">Aligned by workshop phase, because that is the structure the runs
    share. Horizontal position is order within the run, not elapsed time, so the two are
    not aligned by clock and are not meant to be.</p>
    ${input.timelines
      .map(
        (entry) => `<div class="cmp-tl">
      <h3><a class="mono" href="/runs/${esc(entry.runId)}">${esc(entry.runId)}</a></h3>
      ${miniTimeline(entry)}
    </div>`,
      )
      .join('')}
  </section>`;
}

function miniTimeline(entry: ComparedRun): string {
  const phases = entry.timeline.phases.filter(
    (p) => p.phase !== 'CREATED' && p.phase !== 'COMPLETED',
  );
  if (phases.length === 0) return '<p class="ex-empty">No markers recorded.</p>';

  const lanes = entry.timeline.lanes
    .map((lane) => {
      const cells = phases
        .map((band) => {
          const inside = lane.markers.filter(
            (m) => m.sequence >= band.fromSequence && m.sequence <= band.toSequence,
          );
          return `<td>${
            inside.length === 0
              ? '<span class="cmp-none" aria-label="nothing recorded">·</span>'
              : inside
                  .map(
                    (m) =>
                      `<a class="ex-marker k-${m.kind}" href="/runs/${esc(
                        entry.runId,
                      )}?event=${m.sequence}#inspector" title="${esc(
                        `${phaseLabel(String(m.phase))}: ${m.summary}`,
                      )}"><span aria-hidden="true">${MARKER_SYMBOL[m.kind]}</span></a>`,
                  )
                  .join('')
          }</td>`;
        })
        .join('');
      return `<tr><th scope="row">${esc(
        displayName(entry.config, lane.agentId),
      )}</th>${cells}</tr>`;
    })
    .join('');

  return `<div class="scroll">
    <table class="cmp-mini">
      <thead><tr><th scope="col"><span class="visually-hidden">Participant</span></th>${phases
        .map((p) => `<th scope="col">${esc(p.label)}</th>`)
        .join('')}</tr></thead>
      <tbody>${lanes}</tbody>
    </table>
  </div>`;
}

function renderGroups(groups: ComparePageInput['groups']): string {
  if (groups.length === 0) {
    return '<p class="ex-empty">No settings fingerprint yet has two or more completed runs.</p>';
  }
  return `<div class="cmp-groups">${groups
    .map(
      (group) => `<div class="cmp-group">
    <p class="mono cmp-hash">${esc(group.configHash.slice(0, 27))}</p>
    <p class="cmp-group-facts">${esc(group.experimentId)} · ${esc(group.model)} ·
      ${esc(group.moderatorMode)} moderator · ${group.runIds.length} completed runs</p>
    <p class="cmp-group-runs">${group.runIds
      .map((id) => `<a class="mono" href="/runs/${esc(id)}">${esc(id.slice(4, 12))}</a>`)
      .join(' ')}</p>
    <a class="btn-sm" href="/compare?runs=${esc(group.runIds.join(','))}">Compare these ${
      group.runIds.length
    }</a>
  </div>`,
    )
    .join('')}</div>`;
}

const COMPARE_STYLES = `
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
                   overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

.cmp-note { border-radius: 10px; padding: .9rem 1.1rem; margin-bottom: 1.5rem;
            border: 1px solid var(--line); }
.cmp-note p { margin: 0; font-size: .9rem; }
.cmp-note.ok { background: var(--ok-bg); border-color: var(--ok); }
.cmp-note.warn { background: var(--warn-bg); border-color: var(--warn); }
.cmp-note-head { font-weight: 700; color: var(--warn); margin-bottom: .35rem !important; }
.cmp-note ul { margin: .4rem 0 0; padding-left: 1.1rem; font-size: .88rem; }
.cmp-note li + li { margin-top: .3rem; }

.cmp-runs, .cmp-measures, .cmp-mini { border-collapse: collapse; width: 100%; font-size: .87rem; }
.cmp-runs th, .cmp-runs td, .cmp-measures th, .cmp-measures td {
  border-bottom: 1px solid var(--line); padding: .45rem .6rem .45rem 0; text-align: left;
  white-space: normal; }
.cmp-runs thead th, .cmp-measures thead th { font-size: .7rem; letter-spacing: .07em;
  text-transform: uppercase; color: var(--muted); font-weight: 600; }
.cmp-measures tbody th { font-weight: 600; }
.cmp-measures .num { text-align: right; font-variant-numeric: tabular-nums;
                     padding-right: 1rem; }
.cmp-range { color: var(--muted); }
.cmp-same { color: var(--ok); font-weight: 600; }

.cmp-tl { margin-bottom: 1.5rem; }
.cmp-tl h3 { font-size: .85rem; margin: 0 0 .4rem; }
.cmp-mini th, .cmp-mini td { border: 1px solid var(--line); padding: .3rem .4rem;
                             vertical-align: middle; }
.cmp-mini thead th { font-size: .66rem; letter-spacing: .06em; text-transform: uppercase;
                     color: var(--muted); font-weight: 600; text-align: center; }
.cmp-mini tbody th { font-size: .8rem; white-space: nowrap; text-align: left; }
.cmp-mini td { text-align: center; }
.cmp-mini td .ex-marker { display: inline-flex; width: 1.25rem; height: 1.25rem;
                          font-size: .72rem; }
.cmp-none { color: var(--line); }

.cmp-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
              gap: .9rem; }
.cmp-group { border: 1px solid var(--line); border-radius: 10px; padding: .9rem 1rem;
             background: var(--panel); }
.cmp-hash { margin: 0; font-size: .74rem; color: var(--muted); overflow-wrap: anywhere; }
.cmp-group-facts { margin: .3rem 0; font-size: .85rem; }
.cmp-group-runs { margin: .3rem 0 .7rem; font-size: .78rem; display: flex; gap: .5rem;
                  flex-wrap: wrap; }
`;
