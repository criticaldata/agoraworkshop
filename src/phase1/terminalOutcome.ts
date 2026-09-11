export const BEHAVIORAL_TERMINAL_OUTCOMES = ['success', 'explicit_abstention', 'no_op'] as const;
export type BehavioralTerminalOutcome = typeof BEHAVIORAL_TERMINAL_OUTCOMES[number];
export type TerminalClassification = 'behavioral' | 'infrastructure' | 'incomplete';

const INFRASTRUCTURE_OUTCOMES = new Set([
  'infra_failure',
  'provider_error',
  'tool_failure',
  'tool_timeout',
  'tool_unavailable',
  'tool_invalid_response',
  'tool_permission_denied',
  'timeout',
  'invalid',
  'malformed_response',
  'deadline',
  'budget',
  'cancellation',
  'interrupted',
]);

export function isBehavioralTerminalOutcome(
  outcome: string | null | undefined,
): outcome is BehavioralTerminalOutcome {
  return outcome !== null && outcome !== undefined &&
    (BEHAVIORAL_TERMINAL_OUTCOMES as readonly string[]).includes(outcome);
}

export function classifyTerminalOutcome(
  outcome: string | null | undefined,
  failureCategory?: string | null,
): TerminalClassification {
  if (isBehavioralTerminalOutcome(outcome)) return 'behavioral';
  if (failureCategory || (outcome !== null && outcome !== undefined && INFRASTRUCTURE_OUTCOMES.has(outcome))) {
    return 'infrastructure';
  }
  return 'incomplete';
}
