import type { ExperimentConfig, WorkshopState } from '../config/schema.js';
import { displayName } from '../config/schema.js';
import type { AgoraEvent } from '../events/types.js';
import type { InvocationRow, OpportunityRow, RunRow } from '../db/queries.js';
import type { StoredMessage } from '../orchestrator/visibility.js';

/**
 * Derived views over a recorded run.
 *
 * Everything here is a projection of stored records. Nothing is inferred, estimated, or
 * reconstructed: if a number cannot be counted from what was written at the time, it is
 * not reported. These functions are deliberately free of rendering concerns so that the
 * rules they encode can be tested directly.
 *
 * Two rules are enforced here rather than left to each view:
 *
 *  - Infrastructure outcomes never merge with behavioural ones. A timeout is not
 *    silence, a provider failure is not disengagement, and retry exhaustion is not
 *    abstention.
 *  - Temporal order is reported as temporal order. Nothing in this file describes one
 *    event as having caused another.
 */

export const PHASE_SEQUENCE: WorkshopState[] = [
  'INTRODUCTION',
  'PUBLIC_DISCUSSION',
  'PRIVATE_OR_BREAKOUT',
  'FINAL_DISCUSSION',
  'CLOSING',
];

export const PHASE_LABEL: Record<string, string> = {
  CREATED: 'Created',
  INTRODUCTION: 'Introduction',
  PUBLIC_DISCUSSION: 'Public discussion',
  PRIVATE_OR_BREAKOUT: 'Breakout',
  FINAL_DISCUSSION: 'Final discussion',
  CLOSING: 'Closing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  INTERRUPTED: 'Interrupted',
};

export const phaseLabel = (state: string): string => PHASE_LABEL[state] ?? state;

/**
 * What a marker on the timeline represents.
 *
 * `behaviour` covers what an agent did: it spoke, it declined to speak, it passed.
 * `infrastructure` covers what happened to the apparatus. The two are separate kinds,
 * not two shades of one kind, and the interface never renders them the same way.
 */
export type MarkerKind =
  | 'public_message'
  | 'private_message'
  | 'moderator_message'
  | 'abstention'
  | 'no_op'
  | 'failure'
  | 'retry'
  | 'invocation';

export type MarkerClass = 'behaviour' | 'infrastructure';

const MARKER_CLASS: Record<MarkerKind, MarkerClass> = {
  public_message: 'behaviour',
  private_message: 'behaviour',
  moderator_message: 'behaviour',
  abstention: 'behaviour',
  no_op: 'behaviour',
  failure: 'infrastructure',
  retry: 'infrastructure',
  invocation: 'infrastructure',
};

/** Human wording for each marker, used in labels and in the text alternative. */
export const MARKER_LABEL: Record<MarkerKind, string> = {
  public_message: 'Public message',
  private_message: 'Private message',
  moderator_message: 'Moderator message',
  abstention: 'Declined to speak',
  no_op: 'Passed',
  failure: 'Infrastructure failure',
  retry: 'Retry',
  invocation: 'Model call',
};

/** A short symbol per marker, so meaning never rests on colour alone. */
export const MARKER_SYMBOL: Record<MarkerKind, string> = {
  public_message: '●',
  private_message: '◆',
  moderator_message: '▲',
  abstention: '○',
  no_op: '·',
  failure: '✕',
  retry: '↻',
  invocation: '│',
};

export interface TimelineMarker {
  sequence: number;
  elapsedMs: number;
  agentId: string;
  kind: MarkerKind;
  markerClass: MarkerClass;
  phase: WorkshopState | string;
  channel: 'public' | 'private' | null;
  /** Breakout group, when the marker belongs to one. */
  breakoutGroupId: string | null;
  /** First line of a message, or the failure category. Never invented. */
  summary: string;
  messageId: string | null;
  invocationId: string | null;
  eventId: string;
  /** Who actually received this message, as recorded at the time. */
  recipients: string[];
}

export interface PhaseBand {
  phase: WorkshopState | string;
  label: string;
  /** Sequence of the first and last event recorded inside the phase. */
  fromSequence: number;
  toSequence: number;
  markerCount: number;
}

export interface TimelineLane {
  agentId: string;
  displayName: string;
  role: 'moderator' | 'participant';
  markers: TimelineMarker[];
}

export interface TimelineFilters {
  agents?: string[] | null;
  channel?: 'public' | 'private' | null;
  phase?: string | null;
  /** Show model calls, retries and failures. Off by default: they crowd out behaviour. */
  infrastructure?: boolean;
  /** Marker kinds to keep. Null means every kind allowed by the other filters. */
  kinds?: MarkerKind[] | null;
}

export interface Timeline {
  lanes: TimelineLane[];
  phases: PhaseBand[];
  /** Every marker the filters admitted, in sequence order. */
  markers: TimelineMarker[];
  /** How many markers exist before filtering, so the interface can say what it hid. */
  totalMarkers: number;
  infrastructureMarkers: number;
  firstSequence: number;
  lastSequence: number;
}

const MESSAGE_EVENTS = new Set(['message_generated', 'private_message_generated']);
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

export interface TimelineInput {
  config: ExperimentConfig;
  events: AgoraEvent[];
  messages: StoredMessage[];
  filters?: TimelineFilters;
}

/**
 * Projects the event log onto one lane per participant.
 *
 * Ordering is by the recorded sequence, never by wall-clock time: sequence is the
 * authoritative order and is contiguous by construction, while timestamps only say when
 * something was written.
 */
export function buildTimeline(input: TimelineInput): Timeline {
  const { config, events, messages } = input;
  const filters = input.filters ?? {};
  const byMessageId = new Map(messages.map((m) => [m.message_id, m]));

  const all: TimelineMarker[] = [];

  for (const event of events) {
    const marker = markerFor(event, byMessageId, config);
    if (marker) all.push(marker);
  }

  const totalMarkers = all.length;
  const infrastructureMarkers = all.filter((m) => m.markerClass === 'infrastructure').length;

  const kept = all.filter((marker) => admits(marker, filters));

  const agents: Array<{ id: string; role: 'moderator' | 'participant' }> = [
    { id: config.moderator.id, role: 'moderator' },
    ...config.participants.map((p) => ({ id: p.id, role: 'participant' as const })),
  ];

  const lanes: TimelineLane[] = agents
    .filter((agent) => !filters.agents?.length || filters.agents.includes(agent.id))
    .map((agent) => ({
      agentId: agent.id,
      displayName: displayName(config, agent.id),
      role: agent.role,
      markers: kept.filter((m) => m.agentId === agent.id),
    }));

  return {
    lanes,
    phases: phaseBands(events, all),
    markers: kept,
    totalMarkers,
    infrastructureMarkers,
    firstSequence: events[0]?.sequence ?? 0,
    lastSequence: events.at(-1)?.sequence ?? 0,
  };
}

function markerFor(
  event: AgoraEvent,
  byMessageId: Map<string, StoredMessage>,
  config: ExperimentConfig,
): TimelineMarker | null {
  const agentId = event.agent_id;
  if (!agentId) return null;

  const base = {
    sequence: event.sequence,
    elapsedMs: event.elapsed_ms,
    agentId,
    phase: event.workshop_state,
    eventId: event.event_id,
    messageId: null as string | null,
    invocationId: (event.payload['invocation_id'] as string | undefined) ?? null,
    breakoutGroupId: null as string | null,
    recipients: [] as string[],
  };

  if (MESSAGE_EVENTS.has(event.event_type)) {
    const messageId = event.payload['message_id'];
    const message = typeof messageId === 'string' ? byMessageId.get(messageId) : undefined;
    if (!message) return null;
    const kind: MarkerKind =
      agentId === config.moderator.id
        ? 'moderator_message'
        : message.channel === 'private'
          ? 'private_message'
          : 'public_message';
    return {
      ...base,
      kind,
      markerClass: MARKER_CLASS[kind],
      channel: message.channel,
      breakoutGroupId: message.breakout_group_id,
      summary: firstLine(message.content),
      messageId: message.message_id,
      recipients: message.actual_recipients,
    };
  }

  if (event.event_type === 'explicit_abstention' || event.event_type === 'no_op') {
    const kind: MarkerKind = event.event_type === 'no_op' ? 'no_op' : 'abstention';
    return {
      ...base,
      kind,
      markerClass: MARKER_CLASS[kind],
      channel: (event.channel as 'public' | 'private' | null) ?? null,
      summary: MARKER_LABEL[kind],
    };
  }

  if (FAILURE_EVENTS.has(event.event_type)) {
    return {
      ...base,
      kind: 'failure',
      markerClass: 'infrastructure',
      channel: (event.channel as 'public' | 'private' | null) ?? null,
      // The recorded category, not a description of it.
      summary: event.event_type,
    };
  }

  if (event.event_type === 'retry_scheduled' || event.event_type === 'retry_started') {
    return {
      ...base,
      kind: 'retry',
      markerClass: 'infrastructure',
      channel: (event.channel as 'public' | 'private' | null) ?? null,
      summary: event.event_type,
    };
  }

  if (event.event_type === 'agent_invocation_started') {
    return {
      ...base,
      kind: 'invocation',
      markerClass: 'infrastructure',
      channel: (event.channel as 'public' | 'private' | null) ?? null,
      summary: 'model call',
    };
  }

  return null;
}

function admits(marker: TimelineMarker, filters: TimelineFilters): boolean {
  if (!filters.infrastructure && marker.markerClass === 'infrastructure') return false;
  if (filters.kinds?.length && !filters.kinds.includes(marker.kind)) return false;
  if (filters.agents?.length && !filters.agents.includes(marker.agentId)) return false;
  if (filters.channel && marker.channel !== filters.channel) return false;
  if (filters.phase && marker.phase !== filters.phase) return false;
  return true;
}

/**
 * Where each phase began and ended, taken from the state machine's own record rather
 * than guessed from message timing.
 */
function phaseBands(events: AgoraEvent[], markers: TimelineMarker[]): PhaseBand[] {
  const bands = new Map<string, PhaseBand>();
  for (const event of events) {
    const phase = event.workshop_state;
    const existing = bands.get(phase);
    if (existing) {
      existing.toSequence = event.sequence;
    } else {
      bands.set(phase, {
        phase,
        label: phaseLabel(phase),
        fromSequence: event.sequence,
        toSequence: event.sequence,
        markerCount: 0,
      });
    }
  }
  for (const marker of markers) {
    const band = bands.get(String(marker.phase));
    if (band) band.markerCount += 1;
  }
  return [...bands.values()].sort((a, b) => a.fromSequence - b.fromSequence);
}

const firstLine = (text: string): string => {
  const line = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  return line.length > 180 ? `${line.slice(0, 179)}…` : line;
};

// ------------------------------------------------------------------- matrix

export type InteractionMetric = 'messages' | 'deliveries' | 'output_tokens';

export const METRIC_LABEL: Record<InteractionMetric, string> = {
  messages: 'Messages sent',
  deliveries: 'Deliveries',
  output_tokens: 'Output tokens',
};

export interface MatrixCell {
  from: string;
  to: string;
  value: number;
  messageIds: string[];
}

export interface InteractionMatrix {
  agentIds: string[];
  labels: Record<string, string>;
  metric: InteractionMetric;
  cells: MatrixCell[];
  /** Highest cell value, so a view can scale shading without rescanning. */
  max: number;
  total: number;
}

export interface MatrixFilters {
  channel?: 'public' | 'private' | null;
  phase?: string | null;
}

/**
 * Counts observed communication from one agent to another.
 *
 * "To" means the recipients actually recorded for the message at the time it was routed,
 * not who the sender may have had in mind. A message counts once per recipient under
 * `deliveries` and once in total under `messages`; token counts come from the invocation
 * that produced the message and are attributed to every recipient of it, which is why
 * they are offered as a rough volume measure and nothing more.
 */
export function interactionMatrix(
  config: ExperimentConfig,
  messages: StoredMessage[],
  invocations: InvocationRow[],
  metric: InteractionMetric = 'messages',
  filters: MatrixFilters = {},
): InteractionMatrix {
  const agentIds = [config.moderator.id, ...config.participants.map((p) => p.id)];
  const labels = Object.fromEntries(agentIds.map((id) => [id, displayName(config, id)]));
  const tokensByInvocation = new Map(
    invocations.map((i) => [i.invocation_id, i.output_tokens ?? 0]),
  );

  const key = (from: string, to: string) => `${from} ${to}`;
  const cells = new Map<string, MatrixCell>();

  for (const message of messages) {
    if (filters.channel && message.channel !== filters.channel) continue;
    if (filters.phase && message.workshop_state !== filters.phase) continue;

    for (const to of message.actual_recipients) {
      if (to === message.sender_agent_id) continue;
      const id = key(message.sender_agent_id, to);
      const cell =
        cells.get(id) ??
        ({ from: message.sender_agent_id, to, value: 0, messageIds: [] } as MatrixCell);
      cell.value +=
        metric === 'output_tokens'
          ? (message.source_invocation_id
              ? tokensByInvocation.get(message.source_invocation_id) ?? 0
              : 0)
          : 1;
      cell.messageIds.push(message.message_id);
      cells.set(id, cell);
    }
  }

  // `messages` counts each message once for its sender, not once per recipient.
  if (metric === 'messages') {
    for (const cell of cells.values()) {
      cell.value = new Set(cell.messageIds).size;
    }
  }

  const values = [...cells.values()];
  return {
    agentIds,
    labels,
    metric,
    cells: values,
    max: values.reduce((max, c) => Math.max(max, c.value), 0),
    total: values.reduce((sum, c) => sum + c.value, 0),
  };
}

export function matrixValue(matrix: InteractionMatrix, from: string, to: string): number {
  return matrix.cells.find((c) => c.from === from && c.to === to)?.value ?? 0;
}

// --------------------------------------------------------------- trajectory

export interface TrajectoryPhase {
  phase: string;
  label: string;
  markers: TimelineMarker[];
}

export interface AgentMetrics {
  responseOpportunities: number;
  successfulResponses: number;
  abstentions: number;
  noOps: number;
  /** Turns the agent never got, because the apparatus failed. Not behaviour. */
  unavailableTurns: number;
  publicMessages: number;
  privateMessages: number;
  inputTokens: number;
  outputTokens: number;
  infrastructureFailures: number;
  retries: number;
  meanLatencyMs: number | null;
}

export interface AgentTrajectory {
  agentId: string;
  displayName: string;
  role: 'moderator' | 'participant';
  breakoutGroups: string[];
  phases: TrajectoryPhase[];
  metrics: AgentMetrics;
}

/** One agent's course through the run, in recorded order, with operational counts. */
export function agentTrajectory(
  config: ExperimentConfig,
  agentId: string,
  events: AgoraEvent[],
  messages: StoredMessage[],
  opportunities: OpportunityRow[],
  invocations: InvocationRow[],
): AgentTrajectory {
  const timeline = buildTimeline({
    config,
    events,
    messages,
    filters: { agents: [agentId], infrastructure: true },
  });
  const mine = timeline.markers.filter((m) => m.agentId === agentId);

  const phases: TrajectoryPhase[] = [];
  for (const band of timeline.phases) {
    const markers = mine.filter((m) => m.phase === band.phase);
    // Every phase the run entered is listed, including the ones where this agent did
    // nothing: an empty phase is a fact about the run, not an absence of data.
    if (band.phase === 'CREATED' || band.phase === 'COMPLETED') continue;
    phases.push({ phase: String(band.phase), label: band.label, markers });
  }

  const mineOpportunities = opportunities.filter((o) => o.agent_id === agentId);
  const mineInvocations = invocations.filter((i) => i.agent_id === agentId);
  const latencies = mineInvocations
    .map((i) => i.latency_ms)
    .filter((ms): ms is number => typeof ms === 'number');

  return {
    agentId,
    displayName: displayName(config, agentId),
    role: agentId === config.moderator.id ? 'moderator' : 'participant',
    breakoutGroups: config.channels.private.breakout_groups
      .filter((g) => g.members.includes(agentId))
      .map((g) => g.id),
    phases,
    metrics: {
      responseOpportunities: mineOpportunities.length,
      successfulResponses: mineOpportunities.filter((o) => o.resolution === 'success').length,
      abstentions: mineOpportunities.filter((o) => o.resolution === 'explicit_abstention')
        .length,
      noOps: mineOpportunities.filter((o) => o.resolution === 'no_op').length,
      unavailableTurns: mineOpportunities.filter(
        (o) => o.resolution === 'infrastructure_failure',
      ).length,
      publicMessages: messages.filter(
        (m) => m.sender_agent_id === agentId && m.channel === 'public',
      ).length,
      privateMessages: messages.filter(
        (m) => m.sender_agent_id === agentId && m.channel === 'private',
      ).length,
      inputTokens: sum(mineInvocations.map((i) => i.input_tokens ?? 0)),
      outputTokens: sum(mineInvocations.map((i) => i.output_tokens ?? 0)),
      infrastructureFailures: mineInvocations.filter((i) => i.outcome === 'infra_failure')
        .length,
      retries: mineInvocations.filter((i) => i.attempt > 1).length,
      meanLatencyMs: latencies.length === 0 ? null : Math.round(sum(latencies) / latencies.length),
    },
  };
}

const sum = (values: number[]): number => values.reduce((total, v) => total + v, 0);

// ------------------------------------------------------------------ compare

export interface RunMeasures {
  runId: string;
  experimentId: string;
  configHash: string;
  status: string;
  model: string;
  moderatorMode: string;
  createdAt: string;
  completed: boolean;
  responseOpportunities: number;
  successfulResponses: number;
  unavailableTurns: number;
  publicMessages: number;
  privateMessages: number;
  inputTokens: number;
  outputTokens: number;
  infrastructureFailures: number;
  retries: number;
  medianLatencyMs: number | null;
  durationMs: number | null;
}

export interface MeasureSpread {
  key: keyof RunMeasures;
  label: string;
  values: number[];
  min: number;
  max: number;
  median: number;
  /** True when every run agreed, which for a stochastic process is worth seeing. */
  identical: boolean;
}

export interface RunComparison {
  runs: RunMeasures[];
  spreads: MeasureSpread[];
  /** Distinct config hashes among the runs compared. More than one is a warning. */
  configHashes: string[];
  sameConfiguration: boolean;
  /** Moderator modes in play. Mixing them silently would be misleading. */
  moderatorModes: string[];
  sameModerator: boolean;
}

const COMPARED_MEASURES: Array<[keyof RunMeasures, string]> = [
  ['responseOpportunities', 'Response opportunities'],
  ['successfulResponses', 'Successful responses'],
  ['unavailableTurns', 'Unavailable turns'],
  ['publicMessages', 'Public messages'],
  ['privateMessages', 'Private messages'],
  ['outputTokens', 'Output tokens'],
  ['infrastructureFailures', 'Infrastructure failures'],
  ['retries', 'Retries'],
  ['medianLatencyMs', 'Median latency (ms)'],
  ['durationMs', 'Duration (ms)'],
];

export function runMeasures(
  run: RunRow,
  config: ExperimentConfig,
  messages: StoredMessage[],
  opportunities: OpportunityRow[],
  invocations: InvocationRow[],
): RunMeasures {
  const latencies = invocations
    .map((i) => i.latency_ms)
    .filter((ms): ms is number => typeof ms === 'number')
    .sort((a, b) => a - b);

  return {
    runId: run.run_id,
    experimentId: run.experiment_id,
    configHash: run.config_hash,
    status: run.status,
    model: run.model,
    moderatorMode: config.moderator.mode ?? 'llm',
    createdAt: run.created_at,
    completed: run.status === 'COMPLETED',
    responseOpportunities: opportunities.length,
    successfulResponses: opportunities.filter((o) => o.resolution === 'success').length,
    unavailableTurns: opportunities.filter((o) => o.resolution === 'infrastructure_failure')
      .length,
    publicMessages: messages.filter((m) => m.channel === 'public').length,
    privateMessages: messages.filter((m) => m.channel === 'private').length,
    inputTokens: sum(invocations.map((i) => i.input_tokens ?? 0)),
    outputTokens: sum(invocations.map((i) => i.output_tokens ?? 0)),
    infrastructureFailures: invocations.filter((i) => i.outcome === 'infra_failure').length,
    retries: invocations.filter((i) => i.attempt > 1).length,
    medianLatencyMs: latencies.length === 0 ? null : median(latencies),
    durationMs: run.duration_ms,
  };
}

/**
 * Compares runs by reporting the spread of each measure, never a single average.
 *
 * Model output is stochastic, so two runs of one configuration are two samples, not a
 * repetition and a deviation from it. Reporting a mean alone would present a range of
 * outcomes as a fact.
 */
export function compareRuns(runs: RunMeasures[]): RunComparison {
  const spreads: MeasureSpread[] = COMPARED_MEASURES.map(([key, label]) => {
    const values = runs
      .map((run) => run[key])
      .filter((value): value is number => typeof value === 'number');
    const sorted = [...values].sort((a, b) => a - b);
    return {
      key,
      label,
      values,
      min: sorted[0] ?? 0,
      max: sorted.at(-1) ?? 0,
      median: sorted.length === 0 ? 0 : median(sorted),
      identical: sorted.length > 0 && sorted[0] === sorted.at(-1),
    };
  });

  const configHashes = [...new Set(runs.map((r) => r.configHash))];
  const moderatorModes = [...new Set(runs.map((r) => r.moderatorMode))];

  return {
    runs,
    spreads,
    configHashes,
    sameConfiguration: configHashes.length <= 1,
    moderatorModes,
    sameModerator: moderatorModes.length <= 1,
  };
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1]! + sorted[middle]!) / 2)
    : sorted[middle]!;
}
