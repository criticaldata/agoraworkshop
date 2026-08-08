import type { ExperimentConfig } from '../config/schema.js';
import { displayName } from '../config/schema.js';
import type { InvocationRow, OpportunityRow } from '../db/queries.js';
import type { StoredMessage } from '../orchestrator/visibility.js';
import { phaseLabel } from './interaction.js';
import {
  shownLabel,
  type SemanticEdgeRow,
  type SemanticNodeRow,
  type SemanticRelation,
} from '../semantic/types.js';

/**
 * The graph a researcher explores.
 *
 * Two layers, kept apart on purpose. The **recorded** layer is agents and the messages
 * that passed between them: it comes straight out of the event log and is authoritative.
 * The **derived** layer is topics, concepts and claims read out of the text afterwards:
 * it is an analysis, it can be wrong, and every part of it carries the messages it was
 * derived from.
 *
 * Every element is stamped with the sequence at which it was first recorded, which is
 * what lets the time control show the workshop as it accumulated. Sequence is used
 * rather than the clock because it is the authoritative order.
 */

export type GraphNodeKind = 'agent' | 'moderator' | 'topic' | 'concept' | 'claim';
export type GraphLayer = 'recorded' | 'derived';

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  layer: GraphLayer;
  label: string;
  /** Recorded sequence at which this first appears. 0 for participants: present throughout. */
  firstSequence: number;
  /** Phases in which this was observed. */
  phases: string[];
  /** Counts shown in the inspector. Keys differ by kind and are all directly counted. */
  facts: Record<string, string | number>;
  parentId?: string;
  reviewState?: string;
}

export type GraphEdgeRelation =
  | 'public_message'
  | 'private_message'
  | SemanticRelation;

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relation: GraphEdgeRelation;
  layer: GraphLayer;
  weight: number;
  firstSequence: number;
  phases: string[];
  /** Messages behind this edge, so the inspector never has to guess. */
  messageIds: string[];
}

export interface RunGraph {
  runId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Sequence bounds, for the time control. */
  minSequence: number;
  maxSequence: number;
  phases: Array<{ phase: string; label: string; fromSequence: number; toSequence: number }>;
  /** Null when nothing has been extracted, which is the normal state of a fresh run. */
  extraction: {
    extractionId: string;
    method: string;
    model: string;
    pipelineVersion: string;
    promptVersion: string;
    createdAt: string;
  } | null;
}

export interface BuildGraphInput {
  runId: string;
  config: ExperimentConfig;
  messages: StoredMessage[];
  opportunities: OpportunityRow[];
  invocations: InvocationRow[];
  phases: Array<{ phase: string; label: string; fromSequence: number; toSequence: number }>;
  semantic?: {
    extraction: RunGraph['extraction'];
    nodes: SemanticNodeRow[];
    edges: SemanticEdgeRow[];
  } | null;
}

export function buildRunGraph(input: BuildGraphInput): RunGraph {
  const { config, messages, opportunities, invocations } = input;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // ------------------------------------------------------------- participants
  const participants = [
    { id: config.moderator.id, kind: 'moderator' as const },
    ...config.participants.map((p) => ({ id: p.id, kind: 'agent' as const })),
  ];

  for (const participant of participants) {
    const mine = messages.filter((m) => m.sender_agent_id === participant.id);
    const myInvocations = invocations.filter((i) => i.agent_id === participant.id);
    const myOpportunities = opportunities.filter((o) => o.agent_id === participant.id);
    const latencies = myInvocations
      .map((i) => i.latency_ms)
      .filter((ms): ms is number => typeof ms === 'number');

    nodes.push({
      id: participant.id,
      kind: participant.kind,
      layer: 'recorded',
      label: displayName(config, participant.id),
      firstSequence: 0,
      phases: [...new Set(mine.map((m) => m.workshop_state))],
      facts: {
        model: config.model.model,
        provider: config.model.provider,
        prompt_version:
          participant.kind === 'moderator'
            ? config.prompts.moderator_prompt_version
            : config.prompts.participant_prompt_version,
        ...(participant.kind === 'moderator'
          ? { moderator_mode: config.moderator.mode ?? 'llm' }
          : {}),
        public_messages: mine.filter((m) => m.channel === 'public').length,
        private_messages: mine.filter((m) => m.channel === 'private').length,
        response_opportunities: myOpportunities.length,
        unavailable_turns: myOpportunities.filter(
          (o) => o.resolution === 'infrastructure_failure',
        ).length,
        infrastructure_failures: myInvocations.filter((i) => i.outcome === 'infra_failure')
          .length,
        input_tokens: sum(myInvocations.map((i) => i.input_tokens ?? 0)),
        output_tokens: sum(myInvocations.map((i) => i.output_tokens ?? 0)),
        mean_latency_ms:
          latencies.length === 0 ? 'not recorded' : Math.round(sum(latencies) / latencies.length),
      },
    });
  }

  // ------------------------------------------------------- communication edges
  //
  // One edge per ordered pair per channel. The recipients are the ones recorded at the
  // time of routing, so a private edge can only exist between agents that genuinely
  // shared a breakout group.
  const commKey = (from: string, to: string, channel: string) => `${channel}:${from}>${to}`;
  const comms = new Map<string, GraphEdge>();

  for (const message of messages) {
    for (const to of message.actual_recipients) {
      if (to === message.sender_agent_id) continue;
      const relation: GraphEdgeRelation =
        message.channel === 'private' ? 'private_message' : 'public_message';
      const key = commKey(message.sender_agent_id, to, message.channel);
      const existing = comms.get(key);
      if (existing) {
        existing.weight += 1;
        existing.messageIds.push(message.message_id);
        if (!existing.phases.includes(message.workshop_state)) {
          existing.phases.push(message.workshop_state);
        }
        continue;
      }
      comms.set(key, {
        id: `e_${key}`,
        source: message.sender_agent_id,
        target: to,
        relation,
        layer: 'recorded',
        weight: 1,
        firstSequence: message.sequence,
        phases: [message.workshop_state],
        messageIds: [message.message_id],
      });
    }
  }
  edges.push(...comms.values());

  // ------------------------------------------------------------ derived layer
  const semantic = input.semantic;
  if (semantic) {
    const messageById = new Map(messages.map((m) => [m.message_id, m]));
    const byNodeId = new Map(semantic.nodes.map((n) => [n.node_id, n]));

    for (const node of semantic.nodes) {
      // A node a researcher removed stays in the record but leaves the graph.
      if (node.review_state === 'removed') continue;
      const first = node.first_message_id ? messageById.get(node.first_message_id) : undefined;
      nodes.push({
        id: node.node_id,
        kind: node.kind,
        layer: 'derived',
        label: shownLabel(node),
        firstSequence: node.first_sequence ?? 0,
        phases: first ? [first.workshop_state] : [],
        parentId: node.parent_node_id ?? undefined,
        reviewState: node.review_state,
        facts: {
          kind: node.kind,
          mentions: node.mention_count,
          first_observed_at_sequence: node.first_sequence ?? 'not recorded',
          first_observed_in_phase: first ? phaseLabel(first.workshop_state) : 'not recorded',
          first_observed_from: first ? displayName(config, first.sender_agent_id) : 'not recorded',
          machine_label: node.label,
          review_state: node.review_state,
        },
      });
    }

    const live = new Set(nodes.filter((n) => n.layer === 'derived').map((n) => n.id));
    for (const edge of semantic.edges) {
      if (edge.review_state === 'removed') continue;
      const targetLive = live.has(edge.to_id) || edge.to_kind === 'agent';
      const sourceLive = live.has(edge.from_id) || edge.from_kind === 'agent';
      if (!targetLive || !sourceLive) continue;

      const node = byNodeId.get(edge.to_id) ?? byNodeId.get(edge.from_id);
      edges.push({
        id: edge.edge_id,
        source: edge.from_id,
        target: edge.to_id,
        relation: edge.relation,
        layer: 'derived',
        weight: edge.weight,
        firstSequence: node?.first_sequence ?? 0,
        phases: [],
        messageIds: [],
      });
    }
  }

  const sequences = messages.map((m) => m.sequence);

  // Phase bounds are recomputed against message sequence, because everything else on
  // this graph is positioned by message sequence. The event log numbers events, and a
  // run has an order of magnitude more events than messages, so reusing those bounds
  // would place every phase far off the end of the axis.
  const phases = input.phases
    .map((band) => {
      const inside = messages.filter((m) => m.workshop_state === band.phase);
      if (inside.length === 0) return null;
      return {
        phase: band.phase,
        label: band.label,
        fromSequence: Math.min(...inside.map((m) => m.sequence)),
        toSequence: Math.max(...inside.map((m) => m.sequence)),
      };
    })
    .filter((band): band is NonNullable<typeof band> => band !== null)
    .sort((a, b) => a.fromSequence - b.fromSequence);

  return {
    runId: input.runId,
    nodes,
    edges,
    minSequence: sequences.length ? Math.min(...sequences) : 0,
    maxSequence: sequences.length ? Math.max(...sequences) : 0,
    phases,
    extraction: semantic?.extraction ?? null,
  };
}

const sum = (values: number[]): number => values.reduce((total, v) => total + v, 0);

// ------------------------------------------------------------------ filtering

export interface GraphFilters {
  /** Node kinds to keep. */
  kinds?: GraphNodeKind[] | null;
  relations?: GraphEdgeRelation[] | null;
  agents?: string[] | null;
  phase?: string | null;
  /** Keep only what had appeared by this recorded sequence. */
  upToSequence?: number | null;
}

/**
 * Narrows a graph without altering it.
 *
 * Filtering is a property of the view. It drops elements from what is drawn and never
 * from what is stored, and the counts on the elements that survive are the counts that
 * were recorded, not recomputed over the narrowed set.
 */
export function filterGraph(graph: RunGraph, filters: GraphFilters): RunGraph {
  const kinds = filters.kinds?.length ? new Set(filters.kinds) : null;
  const relations = filters.relations?.length ? new Set(filters.relations) : null;
  const agents = filters.agents?.length ? new Set(filters.agents) : null;
  const upTo = filters.upToSequence ?? null;

  let nodes = graph.nodes.filter((node) => {
    if (kinds && !kinds.has(node.kind)) return false;
    if (upTo !== null && node.firstSequence > upTo) return false;
    if (agents && (node.kind === 'agent' || node.kind === 'moderator') && !agents.has(node.id)) {
      return false;
    }
    if (filters.phase && node.phases.length > 0 && !node.phases.includes(filters.phase)) {
      return false;
    }
    return true;
  });

  const present = new Set(nodes.map((n) => n.id));

  const edges = graph.edges.filter((edge) => {
    if (relations && !relations.has(edge.relation)) return false;
    if (upTo !== null && edge.firstSequence > upTo) return false;
    if (filters.phase && edge.phases.length > 0 && !edge.phases.includes(filters.phase)) {
      return false;
    }
    return present.has(edge.source) && present.has(edge.target);
  });

  // A derived node with nothing left attached to it is noise on the canvas, so it goes.
  // Participants always stay: an agent that said nothing is a fact about the run.
  const connected = new Set(edges.flatMap((e) => [e.source, e.target]));
  nodes = nodes.filter(
    (node) => node.layer === 'recorded' || connected.has(node.id),
  );

  return { ...graph, nodes, edges };
}
