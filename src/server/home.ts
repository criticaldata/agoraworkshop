import { esc } from '../export/replayHtml.js';
import { BASE_STYLES } from './theme.js';
import type { AgoraEvent } from '../events/types.js';
import type { RunRow } from '../db/queries.js';

/**
 * The overview page.
 *
 * Written for someone who has to review and use AGORA but does not read code. The
 * design metaphor is the one true thing about the product: it is an instrument that
 * records a chronological trace. So the palette is the legend — signal blue for the
 * public channel, amber for private breakouts, vermilion for infrastructure failure —
 * and those are the same three colours the run timeline uses. What you learn here you
 * can read there.
 *
 * Everything is inline and self-contained: no external fonts, scripts, or assets.
 */

export interface HomeInput {
  latestRun: RunRow | null;
  latestEvents: AgoraEvent[];
  runCount: number;
}

const FAILURE_EVENTS = new Set([
  'timeout',
  'rate_limit',
  'provider_error',
  'provider_refusal',
  'network_error',
  'malformed_response',
  'routing_error',
  'permission_denied',
  'budget_exhausted',
  'retry_exhausted',
]);

export function homePage(input: HomeInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AGORA · a controlled environment for observing interaction between AI agents</title>
<meta name="description" content="AGORA runs small workshops between AI agents and records each message, response opportunity and technical failure, so that a completed run can be examined in detail.">
<style>${HOME_STYLES}</style>
</head>
<body>
<nav class="top">
  <a class="brand" href="/">AGORA</a>
  <span class="brand-note">Phase 0</span>
  <a href="/">Overview</a>
  <a href="/docs">Documentation</a>
  <a href="/runs">Runs</a>
  <a href="/compare">Compare</a>
  <a href="/api">Raw API</a>
</nav>

<main>
${hero()}
<div class="spine">
${sectionRun()}
${sectionRooms()}
${sectionSilence()}
${sectionTrace(input)}
${sectionGates()}
${sectionScope()}
</div>
${closing(input)}
</main>
</body>
</html>
`;
}

// ------------------------------------------------------------------- hero

function hero(): string {
  return `<header class="hero">
  <p class="eyebrow">Overview</p>
  <h1>A controlled environment for observing <em>how AI agents interact</em>.</h1>
  <div class="hero-grid">
   <div class="hero-copy">
  <p class="lede">AGORA runs small workshops in which five AI agents and a moderator discuss a
  set topic. A workshop uses a public channel and private breakout groups. The system records
  each message, each opportunity an agent was given to respond, and each technical failure, so
  that a completed run can be examined in detail afterwards.</p>

  <div class="cta-row">
    <a class="btn" href="/runs">View recorded runs</a>
    <span class="cta-note">Phase 0 concerns whether the environment works and can be relied
    upon. It does not report findings about agent behaviour.</span>
  </div>
   </div>

  <figure class="ring-figure">
    ${ringDiagram()}
    <figcaption>
      <span class="legend"><i class="dot public"></i>Public: received by all participants</span>
      <span class="legend"><i class="dot private"></i>Private: received only within the group</span>
      <span class="legend"><i class="dot fault"></i>Failure: the message was not delivered</span>
    </figcaption>
  </figure>
  </div>
</header>`;
}

/**
 * A reduced illustration of the shipped configuration: a moderator and five agents, the
 * public channel, the two breakout groups defined in the canonical config, and a
 * technical failure.
 */
function ringDiagram(): string {
  const nodes = [
    { id: 'moderator', label: 'Mod', x: 300, y: 50, cls: 'mod' },
    { id: 'agent_1', label: '1', x: 404, y: 110, cls: 'a1' },
    { id: 'agent_2', label: '2', x: 404, y: 230, cls: 'a2' },
    { id: 'agent_3', label: '3', x: 300, y: 290, cls: 'a3' },
    { id: 'agent_4', label: '4', x: 196, y: 230, cls: 'a4' },
    { id: 'agent_5', label: '5', x: 196, y: 110, cls: 'a5' },
  ];

  return `<svg class="ring" viewBox="0 0 600 340" role="img"
       aria-label="Diagram of a workshop. A moderator and five agents exchange messages on a public channel, then divide into two private breakout groups, and one message is not delivered.">
  <circle class="ring-track" cx="300" cy="170" r="120"/>
  <circle class="ring-pulse" cx="300" cy="170" r="120"/>

  <!-- Breakout group A: agents 1 and 2. Breakout group B: agents 3, 4 and 5. -->
  <path class="chord chord-a" d="M 404 110 Q 460 170 404 230"/>
  <path class="chord chord-b" d="M 300 290 Q 180 290 196 230 Q 150 170 196 110"/>

  ${nodes
    .map(
      (n) => `<g class="node ${n.cls}">
    <circle class="node-halo" cx="${n.x}" cy="${n.y}" r="26"/>
    <circle class="node-dot" cx="${n.x}" cy="${n.y}" r="19"/>
    <text class="node-label" x="${n.x}" y="${n.y + 5}">${n.label}</text>
  </g>`,
    )
    .join('\n  ')}

  <g class="stage stage-1"><text x="300" y="176" class="stage-text">All participants receive the message</text></g>
  <g class="stage stage-2"><text x="300" y="176" class="stage-text">Groups exchange messages privately</text></g>
  <g class="stage stage-3"><text x="300" y="176" class="stage-text">One opportunity did not reach agent 4</text></g>
</svg>`;
}

// ------------------------------------------------------------- run section

function sectionRun(): string {
  const phases = [
    ['Set up', 'The settings for the run are fixed and recorded.'],
    ['Introductions', 'Each agent states how it intends to approach the topic.'],
    ['Open discussion', 'Agents speak in turn on the public channel.'],
    ['Private breakouts', 'Agents are divided into groups that cannot see each other’s messages.'],
    ['Final round', 'Agents return to the public channel and state their position.'],
    ['Closing', 'The moderator summarises the discussion.'],
  ];

  return `<section id="run">
  <p class="eyebrow">Structure of a run</p>
  <h2>Each run follows a fixed sequence of phases</h2>
  <p class="body">A run proceeds through the phases below in order and then ends. The software
  determines which agent speaks and when. The agents determine only the content of their
  messages.</p>

  <ol class="phases">
    ${phases
      .map(
        ([name, note], i) => `<li style="--i:${i}">
      <span class="phase-index">${String(i + 1).padStart(2, '0')}</span>
      <span class="phase-name">${esc(name!)}</span>
      <span class="phase-note">${esc(note!)}</span>
    </li>`,
      )
      .join('\n    ')}
  </ol>
  <p class="aside">Scheduling, timing and permissions are handled in ordinary program code rather
  than by a model. This limits the number of things that vary between one run and the next.</p>
</section>`;
}

// ----------------------------------------------------------- rooms section

function sectionRooms(): string {
  return `<section id="rooms">
  <p class="eyebrow">Channels</p>
  <h2>Public and private messages are kept separate</h2>
  <p class="body">An agent writes either to the public channel, which all participants receive, or
  to a private breakout group. If private messages became visible to participants outside the
  group, any comparison between public and private behaviour would be invalid. The rule
  determining who may see a message is applied in one place, and is checked again from the stored
  records after the run has finished.</p>

  <div class="rooms">
    <div class="room">
      <span class="room-tag public">Public channel</span>
      <div class="chips">
        <span class="chip lit">Agent 1</span><span class="chip lit">Agent 2</span>
        <span class="chip lit">Agent 3</span><span class="chip lit">Agent 4</span>
        <span class="chip lit">Agent 5</span><span class="chip lit">Moderator</span>
      </div>
      <p class="room-note">All six participants receive the message. Each delivery is recorded
      individually.</p>
    </div>
    <div class="room">
      <span class="room-tag private">Breakout group</span>
      <div class="chips">
        <span class="chip lit amber">Agent 1</span><span class="chip lit amber">Agent 2</span>
        <span class="chip dim">Agent 3</span><span class="chip dim">Agent 4</span>
        <span class="chip dim">Agent 5</span><span class="chip dim">Moderator</span>
      </div>
      <p class="room-note">Only the two members of the group receive the message. It does not
      appear in the material shown to the other four participants at any later point in the run.</p>
    </div>
  </div>
  <p class="aside">Each run reports the number of cases in which an agent was given a message it
  was not entitled to see. The figure is recalculated from the stored records rather than assumed
  to be zero.</p>
</section>`;
}

// --------------------------------------------------------- silence section

function sectionSilence(): string {
  return `<section id="silence">
  <p class="eyebrow">Missing responses</p>
  <h2>A missing response may be a decision or a technical failure</h2>
  <p class="body">If a technical failure is recorded as a decision by the agent not to respond,
  then measurements of participation describe the reliability of the connection rather than the
  behaviour of the agent. The system records the reason for each missing response, and does not
  infer one where it is not known.</p>

  <figure class="gauge">
    <p class="gauge-label">Ten opportunities to respond, given to one agent during a run</p>
    <div class="gauge-row">
      ${Array.from({ length: 10 }, (_, i) => {
        const kind = i < 7 ? 'ok' : i < 9 ? 'broken' : 'abstain';
        return `<span class="slot ${kind}" style="--i:${i}"></span>`;
      }).join('')}
    </div>

    <figcaption class="gauge-key">
      <span class="legend"><i class="dot public"></i>Responded</span>
      <span class="legend"><i class="dot fault"></i>Did not reach the agent</span>
      <span class="legend"><i class="dot grey"></i>Recorded decision not to respond</span>
    </figcaption>

    <div class="readings">
      <div class="reading wrong">
        <span class="reading-tag">If the reason is not recorded</span>
        <span class="reading-figure">7 of 10 &nbsp;=&nbsp; 70%</span>
        <span class="reading-note">Two failed connections are counted as though the agent had
        decided not to respond.</span>
      </div>
      <div class="reading right">
        <span class="reading-tag">As reported by AGORA</span>
        <span class="reading-figure">7 of 8 &nbsp;=&nbsp; 88%</span>
        <span class="reading-note">Two opportunities did not reach the agent and are excluded
        from the total. One was a recorded decision not to respond, and is retained.</span>
      </div>
    </div>
  </figure>

  <p class="aside">Both figures are reported, so that the difference between them can be seen.
  Where an agent had no opportunity that reached it, no participation figure is given.</p>
</section>`;
}

// ---------------------------------------------------------- trace section

function sectionTrace(input: HomeInput): string {
  const { latestRun, latestEvents } = input;

  if (!latestRun || latestEvents.length === 0) {
    return `<section id="trace">
  <p class="eyebrow">Records</p>
  <h2>Each run produces a complete record</h2>
  <p class="body">No run has been carried out on this instance yet. Once one has, its record is
  shown here.</p>
  <p><a class="btn" href="/runs">Start a run</a></p>
</section>`;
  }

  const span = Math.max(1, latestEvents.at(-1)?.elapsed_ms ?? 1);
  const marks = latestEvents.map((event) => {
    const kind = FAILURE_EVENTS.has(event.event_type)
      ? 'fault'
      : event.event_type === 'private_message_generated'
        ? 'private'
        : event.event_type === 'message_generated'
          ? 'public'
          : 'minor';
    return { x: (event.elapsed_ms / span) * 100, kind };
  });

  const counts = {
    total: latestEvents.length,
    public: marks.filter((m) => m.kind === 'public').length,
    private: marks.filter((m) => m.kind === 'private').length,
    fault: marks.filter((m) => m.kind === 'fault').length,
  };

  return `<section id="trace">
  <p class="eyebrow">Records</p>
  <h2>Each run produces a complete record</h2>
  <p class="body">The chart below is the record of the most recent run carried out on this
  instance. Each mark is one recorded event, placed from left to right in the order it occurred.</p>

  <figure class="trace">
    <div class="trace-strip">
      ${marks.map((m) => `<i class="mark ${m.kind}" style="left:${m.x.toFixed(3)}%"></i>`).join('')}
    </div>
    <div class="trace-axis"><span>start</span><span>${(span / 1000).toFixed(1)}s</span></div>
    <figcaption>
      <span class="legend"><i class="dot public"></i>${counts.public} public messages</span>
      <span class="legend"><i class="dot private"></i>${counts.private} private messages</span>
      <span class="legend"><i class="dot fault"></i>${counts.fault} technical failures</span>
      <span class="legend"><i class="dot grey"></i>${counts.total} recorded events in total</span>
    </figcaption>
  </figure>

  <p class="aside">Open <a href="/runs/${esc(latestRun.run_id)}">that run</a> to view its events in
  sequence, or select an individual turn to see the text the agent received before it responded.</p>
</section>`;
}

// ---------------------------------------------------------- gates section

function sectionGates(): string {
  const gates: Array<[string, string, string]> = [
    [
      'Was the run carried out correctly?',
      'Messages reached the intended recipients, private groups remained separate, the sequence of phases completed, and the records were stored.',
      'Verified by recalculating from the stored records which participants were entitled to see each message. The check requires a count of zero.',
    ],
    [
      'Is the reason for each missing response recorded?',
      'Each missing response is recorded either as a decision by the agent or as a technical failure. Neither is inferred from the other.',
      'A run in which no technical failure occurred does not pass this check, because the distinction was not exercised.',
    ],
    [
      'Can the run be repeated under the same conditions?',
      'The settings are fixed and recorded with an identifier, so that a further run can be started under the same conditions.',
      'Two runs sharing an identifier were carried out under the same settings. The agents are not expected to produce the same text.',
    ],
  ];

  return `<section id="gates">
  <p class="eyebrow">Acceptance checks</p>
  <h2>Three checks are applied to each run</h2>
  <p class="body">The three checks below are applied automatically. The result of each is recorded
  together with the evidence on which it is based.</p>

  <div class="gates">
    ${gates
      .map(
        ([q, a, note], i) => `<article class="gate-card" style="--i:${i}">
      <h3>${esc(q)}</h3>
      <p>${esc(a)}</p>
      <p class="gate-note">${esc(note)}</p>
    </article>`,
      )
      .join('\n    ')}
  </div>
  <p class="aside">A run is described as satisfying the apparatus checks only if all three
  pass. If any does not, the report states which, and what is missing. Passing them says
  the instrument worked; it is not itself a behavioural result.</p>
</section>`;
}

// ---------------------------------------------------------- scope section

function sectionScope(): string {
  const limits = [
    'This phase concerns the environment itself. The runs carried out so far are not evidence about how AI agents behave, and should not be presented as such.',
    'Repeated runs are not expected to produce the same text. Only the conditions under which a run is carried out are held constant.',
    'The moderator’s summaries are model output. They are recorded on the same terms as any other message, and are not treated as an accurate account of the discussion.',
    'The system is incomplete. Its present limitations are recorded in the repository rather than left to be found later.',
  ];

  return `<section id="scope">
  <p class="eyebrow">Limitations</p>
  <h2>What this work does not establish</h2>
  <div class="scope">
    ${limits.map((line) => `<p>${esc(line)}</p>`).join('\n    ')}
  </div>
</section>`;
}

function closing(input: HomeInput): string {
  return `<footer class="closing">
  <h2>Recorded runs</h2>
  <p>${
    input.runCount > 0
      ? `${input.runCount} run${input.runCount === 1 ? '' : 's'} recorded on this instance.`
      : 'No runs have been recorded on this instance.'
  } Each retains its full record, the identifier of the settings it used, and the result of the
  three checks.</p>
  <a class="btn" href="/runs">View runs</a>
</footer>`;
}

// ----------------------------------------------------------------- styles

const HOME_STYLES = `${BASE_STYLES}
/* ---------- hero ---------- */
.hero { padding: 1.5rem 0 .5rem; }
.hero-grid { display: grid; gap: 2rem; align-items: center; }
@media (min-width: 62rem) {
  .hero-grid { grid-template-columns: minmax(0, 1.02fr) minmax(0, 1fr); gap: 3rem; }
  .hero { padding-bottom: 1.5rem; }
}
.hero-copy .lede { margin-bottom: 1.5rem; }
.cta-row { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
.cta-note { font-size: .87rem; color: var(--muted); max-width: 26rem; }

.ring-figure { margin: 0; }
.ring { width: 100%; max-width: 30rem; height: auto; display: block; margin: 0 auto; }
.ring-track { fill: none; stroke: var(--line); stroke-width: 3; }
.ring-pulse {
  fill: none; stroke: var(--public); stroke-width: 3; stroke-linecap: round;
  stroke-dasharray: 60 694; stroke-dashoffset: 754; opacity: 0;
  animation: ringPulse 18s linear infinite;
}
@keyframes ringPulse {
  0%   { stroke-dashoffset: 754; opacity: 0; }
  2%   { opacity: 1; }
  38%  { stroke-dashoffset: 0; opacity: 1; }
  42%  { opacity: 0; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}

.chord { fill: none; stroke: var(--private); stroke-width: 3; stroke-linecap: round; opacity: 0; }
.chord-a { stroke-dasharray: 40 200; animation: chordPulse 18s linear infinite; }
.chord-b { stroke-dasharray: 40 400; animation: chordPulse 18s linear infinite; }
@keyframes chordPulse {
  0%, 42%   { opacity: 0; stroke-dashoffset: 240; }
  46%       { opacity: 1; }
  70%       { opacity: 1; stroke-dashoffset: 0; }
  74%, 100% { opacity: 0; stroke-dashoffset: 0; }
}

.node-halo { fill: var(--public-soft); opacity: 0; }
.node-dot { fill: var(--panel); stroke: var(--muted); stroke-width: 2.5; }
.node-label {
  font-family: var(--mono); font-size: 14px; font-weight: 700;
  fill: var(--ink); text-anchor: middle;
}
.node.mod .node-dot { stroke: var(--ink); stroke-width: 3.5; fill: var(--ink); }
.node.mod .node-label { fill: var(--panel); }

/* Breakout dimming: the agents outside a group visibly stop receiving. */
.node.a3, .node.a4, .node.a5 { animation: groupB 18s linear infinite; }
.node.a1, .node.a2 { animation: groupA 18s linear infinite; }
@keyframes groupA {
  0%, 42% { opacity: 1; } 46%, 70% { opacity: 1; } 74%, 100% { opacity: 1; }
}
@keyframes groupB {
  0%, 42% { opacity: 1; } 46%, 70% { opacity: 1; } 74%, 100% { opacity: 1; }
}
.node.a1 .node-halo, .node.a2 .node-halo { animation: haloA 18s linear infinite; }
@keyframes haloA {
  0%, 43% { opacity: 0; fill: var(--public-soft); }
  47%, 69% { opacity: 1; fill: var(--private-soft); }
  73%, 100% { opacity: 0; }
}
.node.a3 .node-halo, .node.a4 .node-halo, .node.a5 .node-halo { animation: haloB 18s linear infinite; }
@keyframes haloB {
  0%, 45% { opacity: 0; fill: var(--public-soft); }
  49%, 69% { opacity: 1; fill: var(--private-soft); }
  73%, 100% { opacity: 0; }
}

/* The failure beat: agent 4 is offered a turn and the call never lands. */
.node.a4 .node-dot { animation: faultDot 18s linear infinite; }
@keyframes faultDot {
  0%, 78%   { stroke: var(--muted); stroke-width: 2.5; }
  82%, 94%  { stroke: var(--fault); stroke-width: 5; }
  97%, 100% { stroke: var(--muted); stroke-width: 2.5; }
}

.stage-text {
  font-family: var(--mono); font-size: 14px; fill: var(--muted);
  text-anchor: middle; letter-spacing: .02em;
}
.stage { opacity: 0; }
.stage-1 { animation: stage1 18s linear infinite; }
.stage-2 { animation: stage2 18s linear infinite; }
.stage-3 { animation: stage3 18s linear infinite; }
@keyframes stage1 { 0%, 36% { opacity: 1; } 40%, 100% { opacity: 0; } }
@keyframes stage2 { 0%, 44% { opacity: 0; } 48%, 70% { opacity: 1; } 74%, 100% { opacity: 0; } }
@keyframes stage3 { 0%, 79% { opacity: 0; } 83%, 95% { opacity: 1; } 98%, 100% { opacity: 0; } }



/* ---------- phases ---------- */
.phases { list-style: none; margin: 1.5rem 0 0; padding: 0; display: grid; gap: .3rem; }
.phases li {
  display: grid; grid-template-columns: 2.6rem minmax(9rem, 12rem) 1fr;
  gap: .9rem; align-items: baseline; padding: .7rem .9rem;
  background: var(--panel); border: 1px solid var(--line); border-radius: 9px;
  animation: stepIn .5s both; animation-delay: calc(var(--i) * 70ms);
}
@keyframes stepIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: none; } }
.phase-index { font-family: var(--mono); font-size: .8rem; color: var(--public); font-weight: 700; }
.phase-name { font-weight: 650; }
.phase-note { color: var(--muted); font-size: .92rem; }

/* ---------- rooms ---------- */
.rooms { display: grid; grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr)); gap: 1rem; }
.room { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 1.1rem; }
.room-tag {
  font-family: var(--mono); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase;
  padding: .12rem .55rem; border-radius: 999px; font-weight: 700;
}
.room-tag.public { background: var(--public-soft); color: var(--public); }
.room-tag.private { background: var(--private-soft); color: var(--private); }
.chips { display: flex; flex-wrap: wrap; gap: .35rem; margin: .9rem 0 .7rem; }
.chip {
  font-family: var(--mono); font-size: .76rem; padding: .22rem .55rem;
  border-radius: 6px; border: 1px solid var(--line);
}
.chip.lit { background: var(--public-soft); color: var(--public); border-color: transparent; }
.chip.lit.amber { background: var(--private-soft); color: var(--private); }
.chip.dim { color: var(--muted); opacity: .5; text-decoration: line-through; }
.room-note { font-size: .89rem; color: var(--muted); margin: 0; }

/* ---------- participation gauge ---------- */
.gauge { margin: 1.5rem 0 0; }
.gauge-label {
  font-family: var(--mono); font-size: .72rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--muted); margin: 0 0 .55rem;
}
.gauge-key { justify-content: flex-start; margin: .7rem 0 0; }
.gauge-row { display: flex; gap: .4rem; flex-wrap: wrap; }
.slot {
  width: 2.6rem; height: 2.6rem; border-radius: 8px; display: block;
  background: var(--public); animation: slotCycle 12s ease-in-out infinite;
}
.slot.broken { background: var(--fault); }
.slot.abstain { background: var(--line); }
.slot.broken { animation-name: slotDrop; }
@keyframes slotCycle { 0%, 100% { transform: none; } }
/* The two failed turns physically leave the total. That removal IS the idea. */
@keyframes slotDrop {
  0%, 40%   { transform: none; opacity: 1; }
  52%, 90%  { transform: translateY(14px) scale(.78); opacity: .28; }
  100%      { transform: none; opacity: 1; }
}
.readings { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
            gap: 1rem; margin-top: 1.25rem; }
.reading { border-radius: 12px; padding: 1rem 1.1rem; border: 1px solid var(--line);
           background: var(--panel); display: flex; flex-direction: column; gap: .35rem; }
.reading.wrong { border-color: var(--fault); }
.reading.right { border-color: var(--public); }
.reading-tag { font-family: var(--mono); font-size: .7rem; letter-spacing: .12em;
               text-transform: uppercase; color: var(--muted); }
.reading.wrong .reading-tag { color: var(--fault); }
.reading.right .reading-tag { color: var(--public); }
.reading-figure { font-size: 1.5rem; font-weight: 750; letter-spacing: -.02em;
                  font-variant-numeric: tabular-nums; }
.reading.wrong .reading-figure { text-decoration: line-through; text-decoration-thickness: 2px;
                                 text-decoration-color: var(--fault); }
.reading-note { font-size: .89rem; color: var(--muted); }

/* ---------- live trace ---------- */
.trace { margin: 1.5rem 0 0; }
.trace-strip {
  position: relative; height: 4.5rem; background: var(--panel);
  border: 1px solid var(--line); border-radius: 10px; overflow: hidden;
}
.mark { position: absolute; top: 12%; width: 2px; height: 76%; background: var(--line);
        animation: traceIn .8s both; }
.mark.public { background: var(--public); top: 8%; height: 84%; width: 3px; }
.mark.private { background: var(--private); top: 8%; height: 84%; width: 3px; }
.mark.fault { background: var(--fault); top: 0; height: 100%; width: 4px; }
.mark.minor { opacity: .5; }
@keyframes traceIn { from { transform: scaleY(0); } to { transform: scaleY(1); } }
.trace-axis { display: flex; justify-content: space-between; font-family: var(--mono);
              font-size: .72rem; color: var(--muted); margin-top: .35rem; }

/* ---------- gates ---------- */
.gates { display: grid; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); gap: 1rem;
         margin-top: 1.5rem; }
.gate-card {
  background: var(--panel); border: 1px solid var(--line); border-top: 3px solid var(--public);
  border-radius: 12px; padding: 1.1rem;
}
.gate-card p { margin: 0 0 .6rem; font-size: .94rem; }
.gate-note { color: var(--muted); font-size: .87rem !important; margin: 0 !important; }

/* ---------- scope ---------- */
.scope { display: grid; gap: .8rem; max-width: 48rem; }
.scope p { margin: 0; padding-left: 1rem; border-left: 2px solid var(--line); font-size: .96rem;
            color: var(--muted); }

/* ---------- closing ---------- */
.closing { max-width: 68rem; margin: 0 auto; padding: 3.5rem 1.25rem 5rem; }
.closing p { color: var(--muted); max-width: 40rem; }

@media (max-width: 44rem) {
  .spine { padding-left: 1.35rem; }
  .spine > section::before { left: -1.78rem; }
  .phases li { grid-template-columns: 2.2rem 1fr; }
  .phase-note { grid-column: 2 / -1; }
  .slot { width: 1.9rem; height: 1.9rem; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .ring-pulse, .chord { opacity: 1; stroke-dashoffset: 0; stroke-dasharray: none; }
  .node-halo { opacity: .55; }
  .stage-1 { opacity: 1; }
  .stage-2, .stage-3 { opacity: 0; }
  .slot.broken { transform: translateY(14px) scale(.78); opacity: .28; }
}
`;
