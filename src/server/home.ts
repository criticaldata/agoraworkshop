import { esc } from '../export/replayHtml.js';
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
<title>AGORA — a controlled environment for watching AI agents interact</title>
<meta name="description" content="AGORA runs small, bounded workshops between AI agents and records every message, decision and failure, so the results can be trusted.">
<style>${HOME_STYLES}</style>
</head>
<body>
<nav class="top">
  <a class="brand" href="/">AGORA</a>
  <span class="brand-note">Phase 0</span>
  <a href="/runs">Runs</a>
  <a href="/api/runs">API</a>
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
  <p class="eyebrow">Research instrument</p>
  <h1>Five AI agents hold a meeting.<br><em>We record exactly what happened.</em></h1>
  <div class="hero-grid">
   <div class="hero-copy">
  <p class="lede">AGORA runs small, bounded workshops between AI agents — a public discussion,
  private breakout groups, a moderator keeping time. Every message, every turn an agent was
  offered, and every failure is written down as it happens. Afterwards you can replay the whole
  thing and see precisely what each agent was shown before it spoke.</p>

  <div class="cta-row">
    <a class="btn" href="/runs">See recorded runs</a>
    <span class="cta-note">Nothing here is a claim about how AI behaves. This is the apparatus,
    and the evidence that it can be trusted.</span>
  </div>
   </div>

  <figure class="ring-figure">
    ${ringDiagram()}
    <figcaption>
      <span class="legend"><i class="dot public"></i>Public — everyone sees it</span>
      <span class="legend"><i class="dot private"></i>Private — only that group sees it</span>
      <span class="legend"><i class="dot fault"></i>Failure — the message never arrived</span>
    </figcaption>
  </figure>
  </div>
</header>`;
}

/**
 * A live miniature of the canonical experiment: a moderator and five agents, the
 * public ring, the two breakout groups from the shipped config, and a failure. The
 * whole product in about twenty seconds, before a single paragraph of explanation.
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
       aria-label="Diagram of a workshop: a moderator and five agents exchange public messages around a ring, then split into two private breakout groups, and one message fails to arrive.">
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

  <g class="stage stage-1"><text x="300" y="176" class="stage-text">Everyone hears everyone</text></g>
  <g class="stage stage-2"><text x="300" y="176" class="stage-text">Two groups talk privately</text></g>
  <g class="stage stage-3"><text x="300" y="176" class="stage-text">Agent 4 never got its turn</text></g>
</svg>`;
}

// ------------------------------------------------------------- run section

function sectionRun(): string {
  const phases = [
    ['Set up', 'The exact settings are frozen and fingerprinted.'],
    ['Introductions', 'Each agent says how it intends to approach the topic.'],
    ['Open discussion', 'Everyone speaks in turn, in the public room.'],
    ['Private breakouts', 'Agents split into small groups that cannot hear each other.'],
    ['Final round', 'Everyone returns and says where they now stand.'],
    ['Closing', 'The moderator sums up what was actually said.'],
  ];

  return `<section id="run">
  <p class="eyebrow">What a run is</p>
  <h2>A meeting with a fixed agenda and a stopwatch</h2>
  <p class="body">A run always moves forward through the same phases and always ends — there is no
  path where it drifts on indefinitely. The software decides who speaks and when. The agents only
  decide <em>what to say</em>.</p>

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
  <p class="aside">Keeping the scheduling, timing and permissions in ordinary software — rather than
  asking an AI to manage them — is deliberate. It means the only unpredictable part of a run is the
  thing we are actually studying.</p>
</section>`;
}

// ----------------------------------------------------------- rooms section

function sectionRooms(): string {
  return `<section id="rooms">
  <p class="eyebrow">Public and private</p>
  <h2>What happens in a breakout stays in the breakout</h2>
  <p class="body">Agents can talk in the open room, where everyone hears them, or in a small private
  group. If private talk leaked into everyone's view, any finding about how agents behave differently
  in private would be worthless. So the rule is enforced once, in one place — and then
  <em>independently re-checked</em> from the saved records after the run.</p>

  <div class="rooms">
    <div class="room">
      <span class="room-tag public">Public room</span>
      <div class="chips">
        <span class="chip lit">Agent 1</span><span class="chip lit">Agent 2</span>
        <span class="chip lit">Agent 3</span><span class="chip lit">Agent 4</span>
        <span class="chip lit">Agent 5</span><span class="chip lit">Moderator</span>
      </div>
      <p class="room-note">Six recipients. Every delivery recorded by name.</p>
    </div>
    <div class="room">
      <span class="room-tag private">Breakout group</span>
      <div class="chips">
        <span class="chip lit amber">Agent 1</span><span class="chip lit amber">Agent 2</span>
        <span class="chip dim">Agent 3</span><span class="chip dim">Agent 4</span>
        <span class="chip dim">Agent 5</span><span class="chip dim">Moderator</span>
      </div>
      <p class="room-note">Two recipients. The other four are never shown this message —
      not in the transcript, and not in anything they are asked to respond to later.</p>
    </div>
  </div>
  <p class="aside">Every run reports the number of leaks found by re-deriving, from scratch, who was
  allowed to see each message. The target is zero, and it is stated as a number rather than assumed.</p>
</section>`;
}

// --------------------------------------------------------- silence section

function sectionSilence(): string {
  return `<section id="silence">
  <p class="eyebrow">The distinction everything rests on</p>
  <h2>An agent said nothing. Did it choose to, or did the line drop?</h2>
  <p class="body">This is the question that decides whether a study is worth anything. If a technical
  failure gets quietly counted as an agent "staying quiet", the conclusions are measuring the network,
  not the agent. AGORA records the reason for every silence, and refuses to guess.</p>

  <figure class="gauge">
    <p class="gauge-label">Ten turns offered to one agent over a run</p>
    <div class="gauge-row">
      ${Array.from({ length: 10 }, (_, i) => {
        const kind = i < 7 ? 'ok' : i < 9 ? 'broken' : 'abstain';
        return `<span class="slot ${kind}" style="--i:${i}"></span>`;
      }).join('')}
    </div>

    <figcaption class="gauge-key">
      <span class="legend"><i class="dot public"></i>Answered</span>
      <span class="legend"><i class="dot fault"></i>Never got a turn — technical failure</span>
      <span class="legend"><i class="dot grey"></i>Chose not to speak</span>
    </figcaption>

    <div class="readings">
      <div class="reading wrong">
        <span class="reading-tag">The careless reading</span>
        <span class="reading-figure">7 of 10 &nbsp;=&nbsp; 70%</span>
        <span class="reading-note">Counts two broken connections as if the agent had chosen
        to stay quiet. This number is wrong, and nothing in it says so.</span>
      </div>
      <div class="reading right">
        <span class="reading-tag">What AGORA reports</span>
        <span class="reading-figure">7 of 8 &nbsp;=&nbsp; 88%</span>
        <span class="reading-note">Two turns never reached the agent, so they are removed from
        the total. One silence was a genuine choice, and stays in.</span>
      </div>
    </div>
  </figure>

  <p class="aside">Both numbers are published side by side, so the difference is visible rather than
  taken on trust. When an agent never had a single working turn, AGORA reports "not applicable"
  instead of a participation score — a zero there would be a claim the evidence cannot support.</p>
</section>`;
}

// ---------------------------------------------------------- trace section

function sectionTrace(input: HomeInput): string {
  const { latestRun, latestEvents } = input;

  if (!latestRun || latestEvents.length === 0) {
    return `<section id="trace">
  <p class="eyebrow">The record</p>
  <h2>Every run leaves a complete trace</h2>
  <p class="body">Nothing has been run yet on this instance. Launch one and this section fills in
  with the real thing.</p>
  <p><a class="btn" href="/runs">Launch a run</a></p>
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
  <p class="eyebrow">The record</p>
  <h2>Every run leaves a complete trace</h2>
  <p class="body">Below is the actual trace of the most recent run on this instance — not an
  illustration. Each mark is one recorded moment, laid out left to right in the order it happened.</p>

  <figure class="trace">
    <div class="trace-strip">
      ${marks.map((m) => `<i class="mark ${m.kind}" style="left:${m.x.toFixed(3)}%"></i>`).join('')}
    </div>
    <div class="trace-axis"><span>start</span><span>${(span / 1000).toFixed(1)}s</span></div>
    <figcaption>
      <span class="legend"><i class="dot public"></i>${counts.public} public messages</span>
      <span class="legend"><i class="dot private"></i>${counts.private} private messages</span>
      <span class="legend"><i class="dot fault"></i>${counts.fault} failures</span>
      <span class="legend"><i class="dot grey"></i>${counts.total} recorded moments in total</span>
    </figcaption>
  </figure>

  <p class="aside">Open <a href="/runs/${esc(latestRun.run_id)}">that run</a> to step through it
  moment by moment, or click any single turn to see the exact text the agent was shown before it
  answered.</p>
</section>`;
}

// ---------------------------------------------------------- gates section

function sectionGates(): string {
  const gates: Array<[string, string, string]> = [
    [
      'Did the plumbing work?',
      'Messages reached the right people, private groups stayed private, the meeting ran its full course, and the records saved cleanly.',
      'Checked by re-deriving who was allowed to see each message, and counting the leaks. Zero, or it fails.',
    ],
    [
      'Do we know why each silence happened?',
      'Every missing answer is labelled either "the agent chose not to speak" or "the connection failed" — never left ambiguous.',
      'A run where nothing ever went wrong fails this check rather than passing it, because nothing was proven.',
    ],
    [
      'Can we do it again identically?',
      'The exact settings are frozen and fingerprinted, so a second run can be launched under provably identical conditions.',
      'Two runs with the same fingerprint were run the same way. The agents will still say different things — that part is expected.',
    ],
  ];

  return `<section id="gates">
  <p class="eyebrow">Before a run counts</p>
  <h2>Three checks, and the honest answer</h2>
  <p class="body">Every run is graded against the same three questions, automatically. The result is
  published with the evidence attached, and it is designed to fail rather than flatter.</p>

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
  <p class="aside">Only when all three pass does a run declare itself ready to support a real
  behavioural experiment. Anything less says so plainly, and lists what is missing.</p>
</section>`;
}

// ---------------------------------------------------------- scope section

function sectionScope(): string {
  return `<section id="scope">
  <p class="eyebrow">Being straight about it</p>
  <h2>What this is not</h2>
  <div class="scope">
    <p><span class="no">Not</span> evidence about how AI agents behave socially. This phase builds and
    tests the instrument. Reading conclusions about AI society out of these runs would be exactly the
    mistake the instrument exists to prevent.</p>
    <p><span class="no">Not</span> a claim that repeated runs produce the same words. They will not,
    and should not. Only the <em>conditions</em> are reproducible.</p>
    <p><span class="no">Not</span> a place where the moderator is treated as correct. Its summaries
    are model output like any other, recorded and questionable on the same terms.</p>
    <p><span class="no">Not</span> finished. The current limitations are written down and published
    alongside the code rather than discovered later.</p>
  </div>
</section>`;
}

function closing(input: HomeInput): string {
  return `<footer class="closing">
  <h2>Have a look at the evidence</h2>
  <p>${
    input.runCount > 0
      ? `${input.runCount} run${input.runCount === 1 ? '' : 's'} recorded on this instance.`
      : 'No runs recorded yet on this instance.'
  } Each one keeps its full timeline, its settings fingerprint, and its grading.</p>
  <a class="btn" href="/runs">Open runs</a>
</footer>`;
}

// ----------------------------------------------------------------- styles

const HOME_STYLES = `
:root {
  color-scheme: light dark;
  --paper: #eef1f5;
  --panel: #ffffff;
  --grid: #dde3ea;
  --ink: #14181f;
  --muted: #5d6673;
  --line: #d3dae2;
  /* The palette is the legend. */
  --public: #2f5fe0;
  --private: #b57408;
  --fault: #c7361f;
  --public-soft: #e4ebfc;
  --private-soft: #fbf0dc;
  --fault-soft: #fbe6e2;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #101319; --panel: #171b23; --grid: #1e242e; --ink: #e9edf3;
    --muted: #98a2b1; --line: #262d38;
    --public: #7fa2ff; --private: #e8b25c; --fault: #ff8f80;
    --public-soft: #16203a; --private-soft: #2c2413; --fault-soft: #331a19;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  color: var(--ink);
  background-color: var(--paper);
  /* Plotter paper: a fine grid, the ground an instrument draws on. */
  background-image:
    linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 28px 28px, 28px 28px;
  font: 16px/1.65 var(--sans);
  -webkit-font-smoothing: antialiased;
}
main { max-width: 68rem; margin: 0 auto; padding: 0 1.25rem 4rem; }
em { font-style: normal; }
a { color: var(--public); }

nav.top {
  display: flex; gap: 1.1rem; align-items: baseline;
  max-width: 68rem; margin: 0 auto; padding: 1.4rem 1.25rem;
  font-size: .9rem;
}
nav.top a { text-decoration: none; font-weight: 600; }
nav.top .brand { color: var(--ink); font-weight: 800; letter-spacing: .16em; font-size: .95rem; }
nav.top .brand-note {
  font-family: var(--mono); font-size: .7rem; color: var(--muted);
  border: 1px solid var(--line); border-radius: 999px; padding: .05rem .5rem; margin-right: auto;
}
nav.top a:focus-visible, .btn:focus-visible { outline: 2px solid var(--public); outline-offset: 3px; }

.eyebrow {
  font-family: var(--mono); font-size: .72rem; letter-spacing: .18em;
  text-transform: uppercase; color: var(--muted); margin: 0 0 .5rem;
}
h1 {
  font-size: clamp(2rem, 4.4vw, 3.15rem); line-height: 1.05;
  letter-spacing: -.035em; font-weight: 800; margin: 0 0 1rem; text-wrap: balance;
}
/* The accent enters as a drawn line, not as coloured type: the instrument recording
   a trace under the claim. Blue stays reserved for "public channel" everywhere else.
   Painted as a background so it follows the text when the headline wraps — an
   absolutely-positioned rule would force the phrase onto one line and overflow. */
h1 em {
  background-image: linear-gradient(var(--public), var(--public));
  background-repeat: no-repeat;
  background-position: 0 100%;
  background-size: 0 4px;
  padding-bottom: .1em;
  animation: drawRule 1.1s .35s cubic-bezier(.2,.7,.25,1) both;
}
@keyframes drawRule { from { background-size: 0 4px; } to { background-size: 100% 4px; } }
h2 {
  font-size: clamp(1.4rem, 2.9vw, 2rem); line-height: 1.15;
  letter-spacing: -.025em; font-weight: 750; margin: 0 0 .8rem; text-wrap: balance;
}
h3 { font-size: 1.02rem; letter-spacing: -.01em; margin: 0 0 .5rem; }
.lede { font-size: clamp(1rem, 1.6vw, 1.16rem); color: var(--muted); max-width: 46rem; margin: 0 0 2rem; }
.body { max-width: 46rem; margin: 0 0 1.5rem; }
.aside {
  max-width: 46rem; font-size: .92rem; color: var(--muted);
  border-left: 2px solid var(--line); padding-left: .9rem; margin: 1.5rem 0 0;
}

.btn {
  display: inline-block; background: var(--public); color: #fff; text-decoration: none;
  font-weight: 650; padding: .6rem 1.1rem; border-radius: 8px; font-size: .95rem;
}
.btn:hover { filter: brightness(1.08); }

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

figcaption { display: flex; flex-wrap: wrap; gap: .5rem 1.4rem; justify-content: center;
             margin-top: .75rem; font-size: .84rem; color: var(--muted); }
.legend { display: inline-flex; align-items: center; gap: .4rem; }
.dot { width: 9px; height: 9px; border-radius: 999px; display: inline-block; flex: none; }
.dot.public { background: var(--public); }
.dot.private { background: var(--private); }
.dot.fault { background: var(--fault); }
.dot.grey { background: var(--line); }

/* ---------- the spine: the page is itself a trace ---------- */
.spine { border-left: 1px solid var(--line); margin-left: .5rem; padding-left: 2.25rem; }
.spine > section { position: relative; padding: 3.25rem 0; }
.spine > section::before {
  content: ""; position: absolute; left: -2.68rem; top: 3.9rem;
  width: 9px; height: 9px; border-radius: 999px;
  background: var(--paper); border: 2px solid var(--public);
}
.spine > section + section { border-top: 1px solid var(--line); }

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
.scope p { margin: 0; padding-left: 1rem; border-left: 2px solid var(--fault); font-size: .96rem; }
.no { font-family: var(--mono); font-size: .74rem; letter-spacing: .1em; text-transform: uppercase;
      color: var(--fault); font-weight: 700; margin-right: .3rem; }

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
