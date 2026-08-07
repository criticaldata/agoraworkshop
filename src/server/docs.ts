import { esc } from '../export/replayHtml.js';
import { BASE_STYLES } from './theme.js';

/**
 * Technical documentation.
 *
 * Written for someone who has to extend or review the code, rather than for a reviewer
 * who only needs to understand what the system produces. It states how the parts fit
 * together, what the current limits are, and what would have to change to remove them.
 *
 * The counts quoted here are checked against the source by the test suite, so the page
 * cannot drift silently away from the code it describes.
 */

/** Figures quoted in the prose. `tests/docsPage.test.ts` asserts these against source. */
export const FACTS = {
  eventTypes: 38,
  failureCategories: 11,
  tables: 7,
  runtimeNode: 22,
} as const;

export function docsPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AGORA — technical documentation</title>
<meta name="description" content="Architecture, data model, execution model, current limits, and proposed work for the AGORA Phase 0 research environment.">
<style>${BASE_STYLES}${DOCS_STYLES}</style>
</head>
<body>
<nav class="top">
  <a class="brand" href="/">AGORA</a>
  <span class="brand-note">Phase 0</span>
  <a href="/">Overview</a>
  <a href="/docs">Documentation</a>
  <a href="/runs">Runs</a>
  <a href="/api/runs">API</a>
</nav>

<main>
  <header class="doc-head">
    <p class="eyebrow">Technical documentation</p>
    <h1>How the system is built, and what it cannot yet do</h1>
    <p class="lede">This page describes the architecture, the data model, the execution
    model, and the constraints that follow from them. The final two sections state the
    present limits and the work that would remove them, in the order it should be done.</p>
    <nav class="toc" aria-label="Contents">
      ${[
        ['#shape', 'Shape of the system'],
        ['#execution', 'Execution model'],
        ['#config', 'Configuration and hashing'],
        ['#data', 'Data model'],
        ['#events', 'Event model'],
        ['#visibility', 'Channel visibility'],
        ['#failure', 'Failure classification'],
        ['#provider', 'Provider adapter'],
        ['#extending', 'Extension points'],
        ['#limits', 'Current limits'],
        ['#work', 'Proposed work'],
      ]
        .map(([href, label]) => `<a href="${href}">${esc(label!)}</a>`)
        .join('')}
    </nav>
  </header>

<div class="spine">
${sectionShape()}
${sectionExecution()}
${sectionConfig()}
${sectionData()}
${sectionEvents()}
${sectionVisibility()}
${sectionFailure()}
${sectionProvider()}
${sectionExtending()}
${sectionLimits()}
${sectionWork()}
</div>

<footer class="closing">
  <h2>Source</h2>
  <p>The repository contains the full test suite and the limitations file referenced
  above. The overview page describes the same system without reference to the code.</p>
  <a class="btn" href="/">Overview</a>
</footer>
</main>
</body>
</html>
`;
}

// ------------------------------------------------------------------ shape

function sectionShape(): string {
  const modules: Array<[string, string, string]> = [
    ['src/config/', 'Schema, validation, canonical serialisation, hashing, freezing.', 'No default is applied outside the schema, so the stored config is the whole record.'],
    ['src/orchestrator/', 'State machine, turn scheduling, context assembly, routing, budgets, retries.', 'Contains no model calls other than through the provider interface.'],
    ['src/providers/', 'Provider-neutral interface, OpenAI and Anthropic adapters, mock, fault injection.', 'Adapters never throw; they return a classified result.'],
    ['src/events/', 'Event envelope, type list, synchronous recorder.', 'Sequence numbers are assigned here and nowhere else.'],
    ['src/db/', 'SQLite schema and typed read helpers.', 'The only module that writes SQL.'],
    ['src/analytics/', 'Per-run and per-agent metrics.', 'Derives everything from stored rows; holds no state.'],
    ['src/acceptance/', 'The three acceptance checks and the visibility audit.', 'Recomputes visibility rather than trusting the routing decision.'],
    ['src/export/', 'Artifact bundle and the self-contained replay page.', 'Writes files and records their hashes.'],
    ['src/server/', 'HTTP routes, overview, documentation, operator views.', 'Runs execute in this process; see Current limits.'],
  ];

  return `<section id="shape">
  <p class="eyebrow">Architecture</p>
  <h2>Shape of the system</h2>
  <p class="body">A run is a single asynchronous loop. It reads a frozen configuration,
  drives a state machine, and calls a provider through one narrow interface. Every step
  writes to the event log before the next step begins. Analytics, the acceptance checks,
  the export bundle and the replay page are all derived from those stored rows; none of
  them holds state of its own, and none can report something the log does not contain.</p>

  ${flowDiagram()}

  <div class="scroll">
    <table class="ref">
      <thead><tr><th>Module</th><th>Responsibility</th><th>Constraint</th></tr></thead>
      <tbody>
        ${modules
          .map(
            ([m, r, c]) =>
              `<tr><td class="mono">${esc(m!)}</td><td>${esc(r!)}</td><td class="muted">${esc(c!)}</td></tr>`,
          )
          .join('\n        ')}
      </tbody>
    </table>
  </div>
</section>`;
}

function flowDiagram(): string {
  const stages: Array<[string, string]> = [
    ['Frozen config', 'YAML, validated, hashed'],
    ['State machine', 'phases, ordering'],
    ['Turn loop', 'context, budget, retry'],
    ['Provider adapter', 'OpenAI · Anthropic · mock'],
    ['Routing', 'public / breakout'],
    ['Event log', 'SQLite, append only'],
  ];
  const derived = ['Analytics', 'Acceptance checks', 'Export bundle', 'Replay'];

  return `<figure class="flow">
  <ol class="flow-line">
    ${stages
      .map(
        ([name, note], i) => `<li style="--i:${i}">
      <span class="flow-name">${esc(name!)}</span>
      <span class="flow-note">${esc(note!)}</span>
    </li>`,
      )
      .join('\n    ')}
  </ol>
  <p class="flow-branch">All of the following read the event log, and only the event log:</p>
  <ul class="flow-derived">
    ${derived.map((d) => `<li>${esc(d)}</li>`).join('')}
  </ul>
  <figcaption>Data flows in one direction. Nothing downstream of the log can introduce a
  fact that is not recorded in it.</figcaption>
</figure>`;
}

// -------------------------------------------------------------- execution

function sectionExecution(): string {
  return `<section id="execution">
  <p class="eyebrow">Runtime</p>
  <h2>Execution model</h2>
  <p class="body">The state machine moves forward only. A phase configured with zero
  rounds is skipped; a phase may never be revisited; and the terminal state is reachable
  from the closing phase alone, so every run ends with an explicit close even when the
  deadline cut it short.</p>

  <pre class="code">CREATED → INTRODUCTION → PUBLIC_DISCUSSION → PRIVATE_OR_BREAKOUT
        → FINAL_DISCUSSION → CLOSING → COMPLETED
                         ↘ FAILED | CANCELLED</pre>

  <p class="body">Within a phase the orchestrator repeats one loop per turn. The order of
  operations matters, because each step is what makes the next one auditable:</p>

  <ol class="steps">
    <li><span class="step-n">1</span><span>Create a response opportunity and record it. This exists whether or not the agent ever answers, and is the denominator for participation.</span></li>
    <li><span class="step-n">2</span><span>Check the agent's call and token budget. Exhaustion resolves the opportunity as an infrastructure outcome and no request is sent.</span></li>
    <li><span class="step-n">3</span><span>Assemble context from raw stored messages, filtered by the visibility rule, and record the exact message identifiers used.</span></li>
    <li><span class="step-n">4</span><span>Call the provider. Record the attempt, its latency, its token usage and its outcome, whether it succeeded or failed.</span></li>
    <li><span class="step-n">5</span><span>Classify the response as a message, an explicit decision not to respond, or a malformed result.</span></li>
    <li><span class="step-n">6</span><span>Route the message, compute the recipients, store it, and record one delivery per recipient.</span></li>
    <li><span class="step-n">7</span><span>Resolve the opportunity with its outcome and whether the agent was in fact able to act.</span></li>
  </ol>

  <p class="aside">Speaking order rotates by round. The rotation is derived from the round
  index, so it is fully determined by the configuration and contains no randomness. The
  deadline is checked before each turn rather than during one, so a run cannot be
  interrupted midway through recording a turn.</p>
</section>`;
}

// ----------------------------------------------------------------- config

function sectionConfig(): string {
  return `<section id="config">
  <p class="eyebrow">Reproducibility</p>
  <h2>Configuration and hashing</h2>
  <p class="body">The configuration is parsed and validated once, then deep-frozen, so a
  run cannot alter the conditions it is recording. It is serialised canonically — object
  keys sorted recursively, array order preserved, no insignificant whitespace — and
  hashed with SHA-256. Two configurations that differ in any recorded field produce
  different hashes; two that differ only in key order produce the same one.</p>

  <p class="body">The hash covers every field, including the fault-injection plan. A run
  with deliberately injected failures therefore has a different identifier from the
  baseline and cannot be mistaken for one. A rerun rehydrates the configuration from the
  snapshot stored on the source run rather than from the file on disk, so it reproduces
  the conditions that run actually used even if the file has since been edited.</p>

  <pre class="code">agora hash --config configs/agora_phase0_v1.yaml
sha256:dde5d4ec2da78eeffde203334b87b9ba3cf060ae28766fa592388ec29f3f489c</pre>
</section>`;
}

// ------------------------------------------------------------------- data

function sectionData(): string {
  const tables: Array<[string, string]> = [
    ['runs', 'One row per run. Holds the immutable configuration snapshot, its canonical form, its hash, the code commit, the termination reason, and the source run for a rerun.'],
    ['events', 'The authoritative record. One row per recorded moment, with a per-run sequence number that is unique by database constraint.'],
    ['state_transitions', 'Each attempted phase change, whether it completed or was rejected.'],
    ['opportunities', 'Each turn an agent was offered, how it resolved, and whether the agent was in fact able to act. This table alone determines participation figures.'],
    ['invocations', 'Each provider attempt, including failed ones: the resolved system prompt, the rendered context, the message identifiers included, the generation parameters, the budget position at the time, latency, usage and outcome.'],
    ['messages', 'Each message, with its channel, intended and actual recipients, and the invocation and event that produced it.'],
    ['artifacts', 'Each exported file with its size and SHA-256.'],
  ];

  return `<section id="data">
  <p class="eyebrow">Persistence</p>
  <h2>Data model</h2>
  <p class="body">${FACTS.tables} tables in SQLite. The database file is the unit of
  backup and the unit of transfer; there is no external service to keep in step with it.</p>

  <div class="scroll">
    <table class="ref">
      <thead><tr><th>Table</th><th>What it holds</th></tr></thead>
      <tbody>
        ${tables
          .map(([n, d]) => `<tr><td class="mono">${esc(n!)}</td><td>${esc(d!)}</td></tr>`)
          .join('\n        ')}
      </tbody>
    </table>
  </div>

  <p class="aside">A failed attempt is stored in <code>invocations</code> exactly like a
  successful one. Retries are therefore visible as separate rows against the same
  opportunity, and a turn that eventually succeeded still carries the record of the
  attempts that did not.</p>
</section>`;
}

// ----------------------------------------------------------------- events

function sectionEvents(): string {
  const groups: Array<[string, string]> = [
    ['Run lifecycle', 'run_created, run_started, run_completed, run_failed, run_cancelled'],
    ['Phases', 'state_transition_started, state_transition_completed, state_transition_rejected'],
    ['Turns', 'response_opportunity_created, context_assembled, agent_invocation_started, agent_invocation_succeeded, agent_invocation_failed'],
    ['Messages', 'message_generated, message_routed, message_delivered, and the three private equivalents'],
    ['Behaviour', 'explicit_abstention, no_op'],
    ['Retries', 'retry_scheduled, retry_started, retry_exhausted'],
    ['Failures', 'timeout, rate_limit, provider_error, provider_refusal, network_error, malformed_response, permission_denied, routing_error'],
    ['Budgets and time', 'budget_warning, budget_exhausted, deadline_reached'],
    ['Artifacts', 'artifact_created, analytics_export_created, acceptance_report_created'],
  ];

  return `<section id="events">
  <p class="eyebrow">The record</p>
  <h2>Event model</h2>
  <p class="body">${FACTS.eventTypes} event types. Every event carries the run and
  experiment identifiers, the configuration hash, a sequence number, a timestamp, the
  elapsed time since the run started, the workshop phase, and optionally the agent and
  channel it concerns. Causality is explicit: <code>parent_event_id</code> records the
  event that led to this one, and <code>causal_event_ids</code> records any others that
  contributed.</p>

  <p class="body">Recording is synchronous and part of execution rather than a later
  transcription. If the write fails, the run fails; it does not continue with an
  incomplete record.</p>

  <div class="scroll">
    <table class="ref">
      <thead><tr><th>Group</th><th>Types</th></tr></thead>
      <tbody>
        ${groups
          .map(([g, types]) => `<tr><td>${esc(g!)}</td><td class="mono small">${esc(types!)}</td></tr>`)
          .join('\n        ')}
      </tbody>
    </table>
  </div>

  <p class="aside">One delivery event is written per recipient rather than one per
  message. This is more rows, but it makes the question “which agents received this
  message” answerable directly from the log instead of by re-deriving it.</p>
</section>`;
}

// ------------------------------------------------------------- visibility

function sectionVisibility(): string {
  return `<section id="visibility">
  <p class="eyebrow">Channels</p>
  <h2>Channel visibility</h2>
  <p class="body">One function decides who may see a message. Routing calls it when a
  message is written, and context assembly calls it when a message is read. Because both
  paths share the function, a leak would have to be a defect in that function rather than
  a disagreement between two implementations.</p>

  <pre class="code">export function isVisibleTo(config, message, agentId): boolean {
  if (message.channel === 'public') return true;
  if (message.sender_agent_id === agentId) return true;
  if (message.actual_recipients.includes(agentId)) return true;
  if (agentId === config.moderator.id &&
      config.channels.private.moderator_observes_private) return true;
  return false;
}</pre>

  <p class="body">The acceptance check does not trust either caller. It reads the stored
  invocations, takes every message identifier that appeared in each agent's context, and
  recomputes visibility from the configuration snapshot. The reported figure is the number
  of violations found, and the check requires zero.</p>
</section>`;
}

// ---------------------------------------------------------------- failure

function sectionFailure(): string {
  return `<section id="failure">
  <p class="eyebrow">Classification</p>
  <h2>Failure classification</h2>
  <p class="body">Each opportunity resolves as either a behavioural outcome or one of
  ${FACTS.failureCategories} infrastructure categories. The distinction is stored, not
  inferred later, and analytics exclude infrastructure outcomes from the denominator used
  for participation.</p>

  <div class="two-col">
    <div class="card">
      <span class="card-tag public">Behavioural</span>
      <ul>
        <li><code>success</code> — the agent produced a message.</li>
        <li><code>explicit_abstention</code> — the agent returned the abstention token.</li>
        <li><code>no_op</code> — the agent returned the pass token.</li>
      </ul>
    </div>
    <div class="card">
      <span class="card-tag fault">Infrastructure</span>
      <ul>
        <li><code>timeout</code>, <code>rate_limit</code>, <code>provider_error</code>, <code>provider_refusal</code>, <code>network_error</code></li>
        <li><code>malformed_response</code>, <code>routing_error</code>, <code>permission_denied</code></li>
        <li><code>budget_exhausted</code>, <code>retry_exhausted</code>, <code>unknown</code></li>
      </ul>
    </div>
  </div>

  <p class="body">An empty response is classified as <code>malformed_response</code>, not
  as a decision to stay silent. Silence counts as behaviour only when the agent says so
  explicitly. Classifying it the other way would manufacture abstentions out of provider
  defects, which is the specific error the environment exists to prevent.</p>

  <p class="aside">A policy refusal from the provider is recorded as
  <code>provider_refusal</code> rather than retried on a different model. No adapter is
  configured with a fallback, because substituting a model would change the experimental
  conditions without recording that it had happened.</p>
</section>`;
}

// --------------------------------------------------------------- provider

function sectionProvider(): string {
  const mapping: Array<[string, string, string]> = [
    ['max_output_tokens', 'max_completion_tokens', 'max_tokens'],
    ['thinking: adaptive + effort', 'reasoning_effort: <effort>', 'thinking: {type: adaptive}'],
    ['thinking: disabled', "reasoning_effort: 'none'", 'thinking: {type: disabled}'],
    ['temperature / top_p (null)', 'omitted from the request', 'refuses to start if set'],
    ['top_k', 'never sent', 'refuses to start if set'],
    ['seed', 'forwarded when set', 'not supported'],
  ];

  return `<section id="provider">
  <p class="eyebrow">Model access</p>
  <h2>Provider adapter</h2>
  <p class="body">Adapters implement one method and never throw. A failure is returned as
  a classified result, so the orchestrator handles a network error and a refusal through
  the same path and both appear in the log.</p>

  <pre class="code">interface AgentProvider {
  readonly name: string;
  invoke(request: AgentInvocationRequest): Promise&lt;AgentInvocationResult&gt;;
}</pre>

  <p class="body">Two settings are deliberate. Retries at the SDK level are disabled, so
  that retries are performed by the orchestrator and every attempt is recorded. No
  fallback model is configured, for the reason given above.</p>

  <div class="scroll">
    <table class="ref">
      <thead><tr><th>Configuration field</th><th>OpenAI</th><th>Anthropic</th></tr></thead>
      <tbody>
        ${mapping
          .map(
            ([f, o, a]) =>
              `<tr><td class="mono small">${esc(f!)}</td><td class="mono small">${esc(o!)}</td><td class="mono small">${esc(a!)}</td></tr>`,
          )
          .join('\n        ')}
      </tbody>
    </table>
  </div>

  <p class="aside">A null sampling parameter means “not set”, and adapters must not
  substitute a provider default for it. The mapping is exported as a pure function so
  that it can be asserted on directly; it is the one place where a recorded parameter
  could be dropped or renamed without anything else noticing.</p>
</section>`;
}

// -------------------------------------------------------------- extending

function sectionExtending(): string {
  const tasks: Array<[string, string]> = [
    ['Add a provider', 'Implement AgentProvider, register it, and add the value to the provider enum in the config schema. The enum entry is what makes the choice part of the hash.'],
    ['Add a phase', 'Add the state, place it in the canonical phase order, and give it a round count in the schema. Ordering is derived from that list, so no transition table needs editing.'],
    ['Add an event type', 'Add it to the type list. The recorder assigns sequence numbers, so nothing else changes.'],
    ['Add an acceptance check', 'Add a function returning a status with its evidence and failures. A check that cannot find evidence must fail rather than pass by default.'],
    ['Change context policy', 'Extend the context policy block and version it. Never replace raw messages with derived text; a summary must be an additional artifact that links back to the identifiers it came from.'],
  ];

  return `<section id="extending">
  <p class="eyebrow">Working on it</p>
  <h2>Extension points</h2>
  <div class="scroll">
    <table class="ref">
      <thead><tr><th>Task</th><th>What it involves</th></tr></thead>
      <tbody>
        ${tasks
          .map(([task, how]) => `<tr><td>${esc(task!)}</td><td>${esc(how!)}</td></tr>`)
          .join('\n        ')}
      </tbody>
    </table>
  </div>
  <p class="aside">One rule governs all of them. Any addition must preserve the separation
  between behaviour and infrastructure. A feature that makes a technical failure
  indistinguishable from a decision by an agent removes the property the environment was
  built to provide, whatever else it adds.</p>
</section>`;
}

// ----------------------------------------------------------------- limits

function sectionLimits(): string {
  const limits: Array<[string, string, string]> = [
    [
      'Runs execute in the web process',
      'There is no queue and no worker. A deployment or restart during a run leaves its row marked as running, with a complete log up to the point of interruption and no further entries.',
      'Operational',
    ],
    [
      'The deployed instance is unauthenticated',
      'Anyone who can reach the URL can start a run, which spends tokens. This is acceptable for a private link and not acceptable for a shared one.',
      'Operational',
    ],
    [
      'Turn-taking is strictly sequential',
      'Agents speak one at a time in a rotation. Simultaneous speech, interruption, and agents choosing when to speak are not modelled at all.',
      'Design',
    ],
    [
      'Context is assembled raw and grows with the run',
      'Each turn resends the full visible transcript, so token use grows roughly with the square of the number of turns. A long run will eventually exceed the context window; the only control is a blunt cap on message count.',
      'Design',
    ],
    [
      'Breakout groups are fixed',
      'Membership comes from the configuration and does not change during a run. Agents cannot form, leave, or be moved between groups.',
      'Design',
    ],
    [
      'Failed attempts consume call budget',
      'An agent that repeatedly times out exhausts its budget on attempts that produced nothing. This bounds spend, but it means budget exhaustion and provider instability are correlated in the data.',
      'Design',
    ],
    [
      'Analytics report tokens, not cost',
      'There is no price table, so no run states what it cost. Cost has to be computed by hand from the token totals.',
      'Gap',
    ],
    [
      'Metrics are recomputed on every request',
      'Analytics and the acceptance checks are derived on each page load rather than cached. This is comfortable at present volumes and will not stay so.',
      'Gap',
    ],
    [
      'SQLite allows one writer',
      'Concurrent runs on one instance contend for the write lock. Adequate for one run at a time; not a basis for running many in parallel.',
      'Gap',
    ],
    [
      'The moderator is a participant in the record but not in the analysis',
      'Its messages enter every agent’s context and shape the discussion, but nothing measures that influence.',
      'Gap',
    ],
  ];

  return `<section id="limits">
  <p class="eyebrow">Constraints</p>
  <h2>Current limits</h2>
  <p class="body">These are properties of the system as it stands. They are separated by
  kind, because they do not all call for the same response: operational limits should be
  removed, design limits are choices that were correct for this phase and may not be for
  the next, and gaps are simply work that has not been done.</p>

  <div class="limits">
    ${limits
      .map(
        ([title, detail, kind]) => `<article class="limit ${kind.toLowerCase()}">
      <span class="limit-kind">${esc(kind)}</span>
      <h3>${esc(title)}</h3>
      <p>${esc(detail)}</p>
    </article>`,
      )
      .join('\n    ')}
  </div>
</section>`;
}

// ------------------------------------------------------------------- work

function sectionWork(): string {
  const work: Array<[string, string, string, string]> = [
    [
      '1',
      'Reconcile interrupted runs at startup',
      'On boot, mark any run still recorded as running as failed, with the reason recorded as an interrupted process.',
      'Small and self-contained. It closes the only route by which the stored record can currently be misleading, which matters more than anything below it.',
    ],
    [
      '2',
      'Put the deployed instance behind authentication',
      'A single shared credential in front of the run-starting routes is sufficient.',
      'Starting a run spends money. The link should be shareable without that being true of the ability to spend.',
    ],
    [
      '3',
      'Record cost per run',
      'Add a price table keyed by provider and model, and compute cost from the token totals already stored.',
      'Cost governs how many runs can be afforded, which governs what can be asked statistically. It should not require a spreadsheet.',
    ],
    [
      '4',
      'Separate run execution from the web process',
      'Move runs onto a queue with a worker, so a deployment does not interrupt a run in progress.',
      'This is what makes long runs safe to start. It should follow the reconciler rather than replace it, because the reconciler is also the safety net for a worker that dies.',
    ],
    [
      '5',
      'Introduce a context strategy that does not discard the record',
      'When a transcript grows too large, summarise into a derived artifact that links to the message identifiers it was built from, and keep the raw messages authoritative.',
      'This is the constraint that most limits run length. It has to be done in a way that preserves provenance, or the ability to reconstruct what an agent saw is lost.',
    ],
    [
      '6',
      'Support repeated runs and comparison',
      'Launch a configuration n times and present the runs together, with the variation between them shown rather than averaged away.',
      'A single run of a stochastic system supports no conclusion. This is the first piece of work that is about producing findings rather than about producing the environment.',
    ],
    [
      '7',
      'Allow different models per agent',
      'Move the model configuration from the run to the individual agent.',
      'This is the obvious next experimental variable and should be introduced deliberately, once, with everything else held constant. It is listed last because it is only meaningful after repeated runs and cost accounting exist.',
    ],
  ];

  return `<section id="work">
  <p class="eyebrow">Next</p>
  <h2>Proposed work</h2>
  <p class="body">In the order it should be carried out. The ordering is not by size: the
  first two items concern whether the record and the deployment can be trusted, and
  should be finished before anything that adds capability.</p>

  <ol class="work">
    ${work
      .map(
        ([n, title, what, why]) => `<li>
      <span class="work-n">${esc(n!)}</span>
      <div>
        <h3>${esc(title!)}</h3>
        <p>${esc(what!)}</p>
        <p class="work-why"><span class="why-tag">Why here</span> ${esc(why!)}</p>
      </div>
    </li>`,
      )
      .join('\n    ')}
  </ol>

  <p class="aside">Not proposed, and deliberately so: coalition detection, persuasion
  scoring, semantic convergence, and any other measure of what the agents mean. Those
  belong after the environment has been shown to produce comparable runs, and adding them
  now would produce numbers that look like findings without support.</p>
</section>`;
}

// ----------------------------------------------------------------- styles

const DOCS_STYLES = `
.doc-head { padding: 1.5rem 0 .5rem; }
.doc-head .lede { max-width: 44rem; }

.toc { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: 1.5rem; }
.toc a {
  font-family: var(--mono); font-size: .76rem; text-decoration: none;
  border: 1px solid var(--line); border-radius: 999px; padding: .25rem .7rem;
  color: var(--muted); background: var(--panel);
}
.toc a:hover { color: var(--public); border-color: var(--public); }

.code {
  font-family: var(--mono); font-size: .8rem; line-height: 1.6; background: var(--panel);
  border: 1px solid var(--line); border-radius: 10px; padding: .9rem 1rem;
  overflow-x: auto; white-space: pre; margin: 0 0 1.25rem;
}
code {
  font-family: var(--mono); font-size: .88em; background: var(--panel);
  border: 1px solid var(--line); border-radius: 4px; padding: .05em .3em;
}

table.ref { border-collapse: collapse; width: 100%; font-size: .9rem; margin-bottom: .5rem; }
table.ref th, table.ref td {
  text-align: left; padding: .55rem .7rem; border-bottom: 1px solid var(--line);
  vertical-align: top;
}
table.ref th {
  color: var(--muted); font-weight: 600; font-size: .74rem;
  text-transform: uppercase; letter-spacing: .06em; white-space: nowrap;
}
table.ref .small { font-size: .78rem; }
table.ref td.mono { white-space: nowrap; }

/* ---------- flow ---------- */
.flow { margin: 0 0 1.75rem; }
.flow-line { list-style: none; margin: 0; padding: 0; display: grid; gap: .3rem; }
.flow-line li {
  display: grid; grid-template-columns: minmax(8rem, 11rem) 1fr; gap: .8rem;
  align-items: baseline; padding: .55rem .85rem; background: var(--panel);
  border: 1px solid var(--line); border-left: 3px solid var(--public); border-radius: 8px;
  animation: stepIn .5s both; animation-delay: calc(var(--i) * 60ms);
}
@keyframes stepIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
.flow-name { font-weight: 650; font-size: .93rem; }
.flow-note { color: var(--muted); font-size: .87rem; font-family: var(--mono); }
.flow-branch { margin: 1rem 0 .5rem; font-size: .9rem; color: var(--muted); }
.flow-derived { list-style: none; display: flex; flex-wrap: wrap; gap: .4rem; margin: 0; padding: 0; }
.flow-derived li {
  font-family: var(--mono); font-size: .78rem; padding: .25rem .6rem;
  border: 1px dashed var(--line); border-radius: 6px; color: var(--muted);
}

/* ---------- numbered steps ---------- */
.steps { list-style: none; margin: 0 0 1.25rem; padding: 0; display: grid; gap: .4rem;
         max-width: 50rem; }
.steps li { display: grid; grid-template-columns: 1.6rem 1fr; gap: .7rem;
            align-items: baseline; font-size: .93rem; }
.step-n { font-family: var(--mono); font-size: .8rem; font-weight: 700; color: var(--public); }

/* ---------- two column cards ---------- */
.two-col { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
           gap: 1rem; margin-bottom: 1.25rem; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
        padding: 1rem 1.1rem; }
.card-tag { font-family: var(--mono); font-size: .7rem; letter-spacing: .12em;
            text-transform: uppercase; font-weight: 700; padding: .12rem .55rem;
            border-radius: 999px; }
.card-tag.public { background: var(--public-soft); color: var(--public); }
.card-tag.fault { background: var(--fault-soft); color: var(--fault); }
.card ul { margin: .8rem 0 0; padding-left: 1.1rem; font-size: .9rem; }
.card li { margin: .3rem 0; }

/* ---------- limits ---------- */
.limits { display: grid; grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
          gap: .8rem; margin-top: 1.5rem; }
.limit { background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
         padding: 1rem 1.1rem; border-top: 3px solid var(--line); }
.limit.operational { border-top-color: var(--fault); }
.limit.design { border-top-color: var(--private); }
.limit.gap { border-top-color: var(--muted); }
.limit-kind { font-family: var(--mono); font-size: .68rem; letter-spacing: .12em;
              text-transform: uppercase; color: var(--muted); }
.limit h3 { margin: .3rem 0 .4rem; font-size: .98rem; }
.limit p { margin: 0; font-size: .9rem; color: var(--muted); }

/* ---------- proposed work ---------- */
.work { list-style: none; margin: 1.5rem 0 0; padding: 0; display: grid; gap: .8rem; }
.work li { display: grid; grid-template-columns: 2rem 1fr; gap: .9rem;
           background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
           padding: 1rem 1.1rem; }
.work-n { font-family: var(--mono); font-size: 1.1rem; font-weight: 750; color: var(--public);
          line-height: 1.3; }
.work h3 { margin: 0 0 .35rem; font-size: 1rem; }
.work p { margin: 0 0 .5rem; font-size: .93rem; }
.work-why { color: var(--muted); font-size: .88rem !important; margin: 0 !important; }
.why-tag { font-family: var(--mono); font-size: .68rem; letter-spacing: .1em;
           text-transform: uppercase; color: var(--public); margin-right: .35rem; }

.closing { max-width: 68rem; margin: 0 auto; padding: 3rem 0 4rem; }
.closing p { color: var(--muted); max-width: 40rem; }

@media (max-width: 44rem) {
  .flow-line li { grid-template-columns: 1fr; gap: .15rem; }
  .work li { grid-template-columns: 1.5rem 1fr; gap: .6rem; }
  table.ref td.mono { white-space: normal; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;
