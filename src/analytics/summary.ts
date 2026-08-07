import type { Db } from '../db/index.js';
import {
  getInvocations,
  getMessages,
  getOpportunities,
  getRun,
  getTransitions,
  runConfig,
} from '../db/queries.js';
import { readEvents } from '../events/recorder.js';
import { allAgentIds } from '../config/schema.js';

export interface AgentAnalytics {
  agent_id: string;
  response_opportunities: number;
  provider_calls: number;
  successful_responses: number;
  explicit_abstentions: number;
  no_ops: number;
  infrastructure_failures: number;
  infrastructure_failures_by_category: Record<string, number>;
  retries: number;
  /** Opportunities where the agent was actually able to act. */
  behaviourally_available_opportunities: number;
  /**
   * successful_responses / behaviourally_available_opportunities.
   * Null when the agent was never behaviourally available — reporting 0 would be a
   * behavioural claim the data does not support.
   */
  infrastructure_adjusted_participation: number | null;
  /** The naive metric, kept only so the two can be compared side by side. */
  naive_participation: number | null;
  public_messages: number;
  private_messages: number;
  input_tokens: number;
  output_tokens: number;
  mean_latency_ms: number | null;
  median_latency_ms: number | null;
}

export interface RunAnalytics {
  run_id: string;
  experiment_id: string;
  config_hash: string;
  provider: string;
  requested_model: string;
  responded_models: string[];
  status: string;
  termination_reason: string | null;
  workshop_completion_status: string;
  started_at: string | null;
  ended_at: string | null;
  total_duration_ms: number | null;
  total_provider_calls: number;
  /** Calls that actually reached a model provider, so actually cost money. */
  total_model_calls: number;
  /** Calls answered from a fixed script. Zero tokens, zero cost, no model involved. */
  total_scripted_calls: number;
  total_response_opportunities: number;
  total_public_messages: number;
  total_private_messages: number;
  total_events: number;
  /** Message deliveries, i.e. one count per recipient per message. */
  total_deliveries: number;
  total_retries: number;
  total_infrastructure_failures: number;
  infrastructure_failures_by_category: Record<string, number>;
  state_transitions_completed: number;
  state_transition_failures: number;
  mean_latency_ms: number | null;
  median_latency_ms: number | null;
  total_input_tokens: number;
  total_output_tokens: number;
  participation_share_by_messages: Record<string, number>;
  participation_share_by_output_tokens: Record<string, number>;
  per_agent: AgentAnalytics[];
  generated_at: string;
}

export function computeAnalytics(db: Db, runId: string): RunAnalytics {
  const run = getRun(db, runId);
  if (!run) throw new Error(`unknown run: ${runId}`);
  const config = runConfig(run);

  const opportunities = getOpportunities(db, runId);
  const invocations = getInvocations(db, runId);
  const messages = getMessages(db, runId);
  const transitions = getTransitions(db, runId);
  const events = readEvents(db, runId);

  const agents = allAgentIds(config);
  const perAgent: AgentAnalytics[] = agents.map((agentId) => {
    const agentOpportunities = opportunities.filter((o) => o.agent_id === agentId);
    const agentInvocations = invocations.filter((i) => i.agent_id === agentId);
    const agentMessages = messages.filter((m) => m.sender_agent_id === agentId);
    const latencies = agentInvocations
      .map((i) => i.latency_ms)
      .filter((n): n is number => typeof n === 'number');

    const failuresByCategory: Record<string, number> = {};
    for (const opportunity of agentOpportunities) {
      if (opportunity.resolution === 'infrastructure_failure' && opportunity.failure_category) {
        failuresByCategory[opportunity.failure_category] =
          (failuresByCategory[opportunity.failure_category] ?? 0) + 1;
      }
    }

    const successes = agentOpportunities.filter((o) => o.resolution === 'success').length;
    const abstentions = agentOpportunities.filter(
      (o) => o.resolution === 'explicit_abstention',
    ).length;
    const noOps = agentOpportunities.filter((o) => o.resolution === 'no_op').length;
    const infraFailures = agentOpportunities.filter(
      (o) => o.resolution === 'infrastructure_failure',
    ).length;
    const available = agentOpportunities.filter((o) => o.behaviourally_available === 1).length;

    return {
      agent_id: agentId,
      response_opportunities: agentOpportunities.length,
      provider_calls: agentInvocations.length,
      successful_responses: successes,
      explicit_abstentions: abstentions,
      no_ops: noOps,
      infrastructure_failures: infraFailures,
      infrastructure_failures_by_category: failuresByCategory,
      retries: agentInvocations.filter((i) => i.attempt > 1).length,
      behaviourally_available_opportunities: available,
      infrastructure_adjusted_participation: available > 0 ? successes / available : null,
      naive_participation:
        agentOpportunities.length > 0 ? successes / agentOpportunities.length : null,
      public_messages: agentMessages.filter((m) => m.channel === 'public').length,
      private_messages: agentMessages.filter((m) => m.channel === 'private').length,
      input_tokens: sum(agentInvocations.map((i) => i.input_tokens ?? 0)),
      output_tokens: sum(agentInvocations.map((i) => i.output_tokens ?? 0)),
      mean_latency_ms: mean(latencies),
      median_latency_ms: median(latencies),
    };
  });

  const allLatencies = invocations
    .map((i) => i.latency_ms)
    .filter((n): n is number => typeof n === 'number');

  const failuresByCategory: Record<string, number> = {};
  for (const invocation of invocations) {
    if (invocation.outcome === 'infra_failure' && invocation.failure_category) {
      failuresByCategory[invocation.failure_category] =
        (failuresByCategory[invocation.failure_category] ?? 0) + 1;
    }
  }

  const totalMessages = messages.length;
  const totalOutputTokens = sum(perAgent.map((a) => a.output_tokens));

  return {
    run_id: runId,
    experiment_id: run.experiment_id,
    config_hash: run.config_hash,
    provider: run.provider,
    requested_model: run.model,
    responded_models: [
      ...new Set(invocations.map((i) => i.responded_model).filter((m): m is string => !!m)),
    ],
    status: run.status,
    termination_reason: run.termination_reason,
    workshop_completion_status:
      run.status === 'COMPLETED' && run.termination_reason === 'completed'
        ? 'completed_in_full'
        : run.status === 'COMPLETED'
          ? `completed_${run.termination_reason}`
          : run.status.toLowerCase(),
    started_at: run.started_at,
    ended_at: run.ended_at,
    total_duration_ms: run.duration_ms,
    total_provider_calls: invocations.length,
    total_model_calls: invocations.filter((i) => i.provider !== 'scripted').length,
    total_scripted_calls: invocations.filter((i) => i.provider === 'scripted').length,
    total_response_opportunities: opportunities.length,
    total_public_messages: messages.filter((m) => m.channel === 'public').length,
    total_private_messages: messages.filter((m) => m.channel === 'private').length,
    total_events: events.length,
    total_deliveries: events.filter(
      (e) =>
        e.event_type === 'message_delivered' || e.event_type === 'private_message_delivered',
    ).length,
    total_retries: invocations.filter((i) => i.attempt > 1).length,
    total_infrastructure_failures: invocations.filter((i) => i.outcome === 'infra_failure').length,
    infrastructure_failures_by_category: failuresByCategory,
    state_transitions_completed: transitions.filter((t) => t.status === 'completed').length,
    state_transition_failures: transitions.filter((t) => t.status !== 'completed').length,
    mean_latency_ms: mean(allLatencies),
    median_latency_ms: median(allLatencies),
    total_input_tokens: sum(perAgent.map((a) => a.input_tokens)),
    total_output_tokens: totalOutputTokens,
    participation_share_by_messages: share(
      perAgent.map((a) => [a.agent_id, a.public_messages + a.private_messages]),
      totalMessages,
    ),
    participation_share_by_output_tokens: share(
      perAgent.map((a) => [a.agent_id, a.output_tokens]),
      totalOutputTokens,
    ),
    per_agent: perAgent,
    generated_at: new Date().toISOString(),
  };
}

const sum = (values: number[]): number => values.reduce((a, b) => a + b, 0);

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(sum(values) / values.length);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function share(entries: Array<[string, number]>, total: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of entries) {
    out[key] = total > 0 ? Number((value / total).toFixed(4)) : 0;
  }
  return out;
}
