import { esc } from '../export/replayHtml.js';
import { page } from './pages.js';
import type { ValidationSet, ValidationSetGate } from '../acceptance/validationSet.js';
import type { RunAnalytics } from '../analytics/summary.js';
import type { ExperimentConfig } from '../config/schema.js';
import { displayName } from '../config/schema.js';
import { shown, UNAVAILABLE } from '../core/provenance.js';
import type { RunRow } from '../db/queries.js';

export interface ValidationPageInput {
  set: ValidationSet;
  run: RunRow;
  config: ExperimentConfig;
  analytics: RunAnalytics;
  /** Other runs recorded under the same config hash, this one excluded. */
  comparableRunIds: string[];
  /** An invocation to link to, so the provenance claim can be checked immediately. */
  sampleInvocationId: string | null;
  exportedFiles: number;
}

const VALIDATION_STYLES = `
.vp-verdict { border: 1px solid var(--line); border-radius: 12px; background: var(--panel);
              padding: 1.1rem 1.25rem; display: flex; gap: 1rem; align-items: baseline;
              flex-wrap: wrap; }
.vp-verdict h2 { margin: 0; font-size: 1.05rem; text-transform: none; letter-spacing: 0;
                 color: var(--ink); }
.vp-verdict p { margin: 0; color: var(--muted); font-size: .9rem; }

.vp-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
           gap: .75rem 1.75rem; margin: 0; padding: 1rem 1.1rem; background: var(--panel);
           border: 1px solid var(--line); border-radius: 12px; }
.vp-grid div { display: flex; flex-direction: column; gap: .1rem; min-width: 0; }
.vp-grid dt { color: var(--muted); font-size: .7rem; text-transform: uppercase;
              letter-spacing: .07em; }
.vp-grid dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }

.vp-gate { border: 1px solid var(--line); border-left-width: 4px; border-radius: 10px;
           background: var(--panel); padding: 1rem 1.1rem; margin-bottom: .75rem; }
.vp-gate.ok { border-left-color: var(--ok); }
.vp-gate.bad { border-left-color: var(--bad); }
.vp-gate.unproven { border-left-color: var(--warn); }
.vp-gate h3 { margin: 0 0 .15rem; font-size: 1rem; }
.vp-gate .q { color: var(--muted); font-size: .87rem; margin: 0 0 .5rem; }
.vp-gate .meaning { font-size: .85rem; margin: .1rem 0 .5rem; }
.vp-gate summary { cursor: pointer; font-size: .85rem; font-weight: 600; }
.vp-gate ul { margin: .5rem 0 0; padding-left: 1.1rem; font-size: .87rem; }
.vp-gate ul.failures li { color: var(--bad); }
.vp-gate ul.unproven li { color: var(--warn); }
.vp-src { font-family: var(--mono); font-size: .74rem; color: var(--muted); }

.vp-runs { width: 100%; border-collapse: collapse; font-size: .88rem; }
.vp-runs th { text-align: left; color: var(--muted); font-weight: 600; font-size: .72rem;
              text-transform: uppercase; letter-spacing: .07em;
              border-bottom: 1px solid var(--line); padding: .4rem .6rem .4rem 0; }
.vp-runs td { padding: .55rem .6rem .55rem 0; border-bottom: 1px solid var(--line);
              vertical-align: top; }
.vp-links { display: flex; gap: .5rem; flex-wrap: wrap; }
.vp-links a, .vp-links button { font-size: .85rem; }
`;

const tone = (status: ValidationSetGate['status']): string =>
  status === 'PASS' ? 'ok' : status === 'FAIL' ? 'bad' : 'unproven';

const label = (status: ValidationSetGate['status']): string => status.replace('_', ' ');

/**
 * The page a researcher reads before trusting anything else in this system.
 *
 * It is deliberately plain. Every verdict on it is followed by the evidence it was
 * derived from and the run that evidence came from, because a verdict a reader cannot
 * check is not worth showing.
 */
export function validationPage(input: ValidationPageInput): string {
  const { set, run, config, analytics } = input;
  const p = set.code_provenance;

  const rounds = config.workshop.rounds;
  const totalRounds =
    rounds.introduction +
    rounds.public_discussion +
    rounds.private_or_breakout +
    rounds.final_discussion;

  const tools =
    config.capabilities.tools_enabled === false || config.capabilities.manifest.length === 0
      ? 'none enabled'
      : config.capabilities.manifest.join(', ');

  return page(
    `Phase 0 validation package ${run.run_id}`,
    `
  <style>${VALIDATION_STYLES}</style>

  <header class="page-head">
    <p class="eyebrow">Phase 0 validation package</p>
    <h1>${esc(config.workshop.topic)}</h1>
  </header>

  <div class="vp-verdict">
    <span class="pill ${set.phase0_validated ? 'ok' : 'unproven'}">${
      set.phase0_validated ? 'VALIDATED' : 'NOT YET VALIDATED'
    }</span>
    <div>
      <h2>${
        set.phase0_validated
          ? 'All three Phase 0 gates passed on the evidence below.'
          : 'At least one gate is unproven or failing.'
      }</h2>
      <p>${
        set.outstanding.length === 0
          ? 'This package validates the apparatus. It says nothing about agent behaviour.'
          : esc(set.outstanding.join(' | '))
      }</p>
    </div>
  </div>

  <nav class="sub-nav" aria-label="Sections">
    <a href="#configuration">Configuration</a>
    <a href="#execution">Execution</a>
    <a href="#gates">Gates</a>
    <a href="#evidence-runs">Evidence runs</a>
    <a href="#provenance">Provenance</a>
    <a href="#evidence">Files</a>
  </nav>

  <section id="configuration">
    <h2>Experimental configuration</h2>
    <dl class="vp-grid">
      <div><dt>Run</dt><dd class="mono">${esc(run.run_id)}</dd></div>
      <div><dt>Experiment</dt><dd class="mono">${esc(run.experiment_id)}</dd></div>
      <div><dt>Config hash</dt><dd class="mono">${esc(run.config_hash)}</dd></div>
      <div><dt>Provider / model</dt><dd class="mono">${esc(run.provider)} ${esc(run.model)}</dd></div>
      <div><dt>Participants</dt><dd>${config.participants.length}</dd></div>
      <div><dt>Moderator</dt><dd>${esc(displayName(config, config.moderator.id))} <span class="muted">(${esc(
        config.moderator.mode ?? 'llm',
      )})</span></dd></div>
      <div><dt>Rounds</dt><dd>${totalRounds} across four phases</dd></div>
      <div><dt>Tools</dt><dd>${esc(tools)}</dd></div>
      <div><dt>Context policy</dt><dd class="mono">${esc(config.context_policy.version)}</dd></div>
      <div><dt>Prompt versions</dt><dd class="mono">${esc(
        Object.values(config.prompts).join(', '),
      )}</dd></div>
      <div><dt>Duration</dt><dd>${
        run.duration_ms === null ? 'not recorded' : `${(run.duration_ms / 1000).toFixed(1)}s`
      }</dd></div>
      <div><dt>Code revision</dt><dd class="mono">${
        p.git_commit_sha ? esc(p.git_commit_sha.slice(0, 12)) : esc(UNAVAILABLE)
      }</dd></div>
    </dl>
  </section>

  <section id="execution">
    <h2>Execution summary</h2>
    <p class="note">This is what the run did. It is a run-level result, not Phase 0 evidence.</p>
    <dl class="vp-grid">
      <div><dt>Response opportunities</dt><dd>${analytics.total_response_opportunities}</dd></div>
      <div><dt>Public messages</dt><dd>${analytics.total_public_messages}</dd></div>
      <div><dt>Private messages</dt><dd>${analytics.total_private_messages}</dd></div>
      <div><dt>Deliveries recorded</dt><dd>${analytics.total_deliveries}</dd></div>
      <div><dt>Events recorded</dt><dd>${analytics.total_events}</dd></div>
      <div><dt>Model invocations</dt><dd>${analytics.total_model_calls}</dd></div>
      <div><dt>Scripted invocations</dt><dd>${analytics.total_scripted_calls}</dd></div>
      <div><dt>Retries</dt><dd>${analytics.total_retries}</dd></div>
      <div><dt>Infrastructure failures</dt><dd>${analytics.total_infrastructure_failures}</dd></div>
      <div><dt>Completion status</dt><dd>${esc(analytics.workshop_completion_status)}</dd></div>
    </dl>
  </section>

  <section id="gates">
    <h2>Phase 0 gates</h2>
    <p class="note">Each verdict is followed by the evidence it was computed from and the
    run that evidence came from.</p>
    ${set.gates.map(gateCard).join('\n')}
  </section>

  <section id="evidence-runs">
    <h2>Evidence runs</h2>
    <p class="note">A single run is not expected to demonstrate everything. Each run below
    is listed with its own outcome and with what it is being used to show.</p>
    <div class="scroll">
      <table class="vp-runs">
        <thead><tr>
          <th>Run</th><th>Supplies evidence for</th><th>Run-level result</th><th>Why</th>
        </tr></thead>
        <tbody>${set.runs
          .map(
            (r) => `<tr>
          <td><a class="mono" href="/runs/${esc(r.run_id)}">${esc(r.run_id)}</a></td>
          <td>${esc(r.role.replace(/_/g, ' '))}</td>
          <td><span class="pill ${
            r.run_level_result.status === 'COMPLETED'
              ? 'ok'
              : r.run_level_result.status === 'INTERRUPTED'
                ? 'unproven'
                : 'bad'
          }">${esc(r.run_level_result.status)}</span>
            <div class="vp-src">${esc(r.run_level_result.config_hash.slice(0, 19))}</div></td>
          <td class="muted">${esc(r.note)}</td>
        </tr>`,
          )
          .join('\n')}</tbody>
      </table>
    </div>
  </section>

  <section id="provenance">
    <h2>Provenance</h2>
    <p class="note">Every response can be traced back to the exact material that produced
    it: the system prompt as sent, the rendered context, and the identifiers of every
    message included in that context.</p>
    <dl class="vp-grid">
      <div><dt>Commit</dt><dd class="mono wrap">${esc(shown(p.git_commit_sha))}</dd></div>
      <div><dt>Commit source</dt><dd class="mono">${esc(shown(p.commit_source))}</dd></div>
      <div><dt>Deployment</dt><dd class="mono wrap">${esc(shown(p.deployment_id))}</dd></div>
      <div><dt>App version</dt><dd class="mono">${esc(shown(p.app_version))}</dd></div>
      <div><dt>Environment</dt><dd class="mono">${esc(shown(p.environment))}</dd></div>
    </dl>
    <p class="vp-links" style="margin-top:1rem">
      ${
        input.sampleInvocationId
          ? `<a href="/runs/${esc(run.run_id)}/invocations/${esc(
              input.sampleInvocationId,
            )}"><button type="button">What exactly did an agent receive?</button></a>`
          : '<span class="muted">No invocation was recorded for this run.</span>'
      }
    </p>
  </section>

  <section id="evidence">
    <h2>Evidence and files</h2>
    <p class="vp-links">
      <a href="/runs/${esc(run.run_id)}"><button type="button" class="secondary">Run detail</button></a>
      <a href="/runs/${esc(run.run_id)}/replay"><button type="button" class="secondary">Replay</button></a>
      <a href="/api/runs/${esc(run.run_id)}/events"><button type="button" class="secondary">Raw events</button></a>
      <a href="/api/runs/${esc(run.run_id)}"><button type="button" class="secondary">Config snapshot</button></a>
      <a href="/api/runs/${esc(run.run_id)}/invocations"><button type="button" class="secondary">Invocation provenance</button></a>
      <a href="/api/runs/${esc(run.run_id)}/validation"><button type="button" class="secondary">This package as JSON</button></a>
    </p>
    <form method="post" action="/api/runs/${esc(run.run_id)}/export" style="margin-top:.6rem">
      <button type="submit" class="secondary">Export artifact bundle</button>
      <span class="muted" style="margin-left:.5rem;font-size:.85rem">${
        input.exportedFiles > 0
          ? `${input.exportedFiles} files exported so far`
          : 'not yet exported'
      }</span>
    </form>
    <p class="note" style="margin-top:1rem">Comparable runs under config hash
      <span class="mono">${esc(run.config_hash.slice(0, 19))}</span>:
      ${
        input.comparableRunIds.length === 0
          ? 'none yet.'
          : input.comparableRunIds
              .map((id) => `<a class="mono" href="/runs/${esc(id)}">${esc(id)}</a>`)
              .join(', ')
      }
    </p>
  </section>

  <section>
    <h2>Scope</h2>
    <p class="note">Phase 0 validates the apparatus. Nothing on this page supports a claim
    about how AI agents behave, and nothing here is evidence of coalitions, persuasion,
    convergence, or emergence. Repeated runs are not expected to produce identical text:
    only the experimental conditions are reproducible.</p>
  </section>
`,
  );
}

function gateCard(gate: ValidationSetGate): string {
  const hasDetail =
    gate.evidence.length > 0 || gate.failures.length > 0 || gate.not_exercised.length > 0;
  return `<article class="vp-gate ${tone(gate.status)}">
    <h3>${esc(gate.title)} <span class="pill ${tone(gate.status)}">${esc(label(gate.status))}</span></h3>
    <p class="q">${esc(gate.question)}</p>
    <p class="meaning">${esc(gate.meaning)}</p>
    <p class="vp-src">Evidence from: ${gate.evidence_run_ids
      .map((id) => `<a href="/runs/${esc(id)}">${esc(id)}</a>`)
      .join(', ')}</p>
    ${
      hasDetail
        ? `<details>
      <summary>Show the evidence</summary>
      ${gate.evidence.length ? `<ul>${gate.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      ${gate.failures.length ? `<ul class="failures">${gate.failures.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      ${gate.not_exercised.length ? `<ul class="unproven">${gate.not_exercised.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
    </details>`
        : ''
    }
  </article>`;
}
