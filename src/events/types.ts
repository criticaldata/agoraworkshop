/**
 * The event log is the authoritative record of a run. Every meaningful runtime
 * action emits one of these, in a strictly increasing per-run sequence, so that a
 * researcher can reconstruct causality after the fact.
 */
export const EVENT_TYPES = [
  'run_created',
  'run_started',
  'run_completed',
  'run_failed',
  'run_cancelled',
  'run_interrupted',

  'state_transition_started',
  'state_transition_completed',
  'state_transition_rejected',

  'response_opportunity_created',
  'context_assembled',
  'agent_invocation_started',
  'agent_invocation_succeeded',
  'agent_invocation_failed',

  'message_generated',
  'message_routed',
  'message_delivered',

  'private_message_generated',
  'private_message_routed',
  'private_message_delivered',

  'explicit_abstention',
  'no_op',

  'retry_scheduled',
  'retry_started',
  'retry_exhausted',

  'timeout',
  'rate_limit',
  'provider_error',
  'provider_refusal',
  'network_error',
  'malformed_response',
  'permission_denied',
  'routing_error',

  'budget_warning',
  'budget_exhausted',

  'deadline_reached',

  'artifact_created',
  'analytics_export_created',
  'acceptance_report_created',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Outcomes that describe what the *agent* did. Only these may be used for
 * behavioural claims.
 */
export const BEHAVIOURAL_OUTCOMES = ['success', 'explicit_abstention', 'no_op'] as const;
export type BehaviouralOutcome = (typeof BEHAVIOURAL_OUTCOMES)[number];

/**
 * Outcomes that describe what the *infrastructure* did. A turn resolved with any of
 * these was never behaviourally available, and analytics must never count it as
 * abstention.
 */
export const INFRASTRUCTURE_FAILURES = [
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
  /** The process stopped while the run was still in progress. */
  'interrupted',
  'unknown',
] as const;
export type InfrastructureFailure = (typeof INFRASTRUCTURE_FAILURES)[number];

export type OpportunityResolution = BehaviouralOutcome | 'infrastructure_failure';

export function isInfrastructureFailure(value: string): value is InfrastructureFailure {
  return (INFRASTRUCTURE_FAILURES as readonly string[]).includes(value);
}

export function isBehaviouralOutcome(value: string): value is BehaviouralOutcome {
  return (BEHAVIOURAL_OUTCOMES as readonly string[]).includes(value);
}

/** Maps an infrastructure failure category onto its dedicated event type. */
export const FAILURE_EVENT_TYPE: Record<InfrastructureFailure, EventType> = {
  timeout: 'timeout',
  rate_limit: 'rate_limit',
  provider_error: 'provider_error',
  provider_refusal: 'provider_refusal',
  network_error: 'network_error',
  malformed_response: 'malformed_response',
  routing_error: 'routing_error',
  permission_denied: 'permission_denied',
  budget_exhausted: 'budget_exhausted',
  retry_exhausted: 'retry_exhausted',
  interrupted: 'run_interrupted',
  unknown: 'provider_error',
};

export interface AgoraEvent {
  event_id: string;
  run_id: string;
  experiment_id: string;
  config_hash: string;
  sequence: number;
  timestamp: string;
  elapsed_ms: number;
  event_type: EventType;
  workshop_state: string;
  agent_id: string | null;
  channel: string | null;
  trace_id: string | null;
  parent_event_id: string | null;
  causal_event_ids: string[];
  payload: Record<string, unknown>;
}
