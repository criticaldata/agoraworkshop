import type { Outcome, ProviderCallSpec, ProviderResponse } from '../index.js';

const outcomes = new Set<Outcome>([
  'success',
  'abstained',
  'refused',
  'timeout',
  'provider_error',
  'invalid_response',
  'rate_limit',
  'permission_denied',
]);

const deliveredOutcomes = new Set<Outcome>(['success', 'abstained', 'refused']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validTokenCount(value: unknown): boolean {
  return value === null || (Number.isInteger(value) && Number(value) >= 0);
}

/**
 * Validate the untrusted provider result before the runtime can commit an
 * opportunity. In particular, a provider saying "success" is not proof that a
 * private checkpoint was collected: every delivered outcome needs archived,
 * non-empty text.
 */
export function validateProviderResponseAtBoundary(
  spec: Pick<ProviderCallSpec, 'provider' | 'model'>,
  input: unknown,
): ProviderResponse {
  const violations: string[] = [];
  const response = isRecord(input) ? input : {};
  const outcome = typeof response.outcome === 'string' && outcomes.has(response.outcome as Outcome)
    ? response.outcome as Outcome
    : null;

  if (!isRecord(input)) violations.push('response_not_object');
  if (!outcome) violations.push('unknown_outcome');
  if (response.provider !== spec.provider) violations.push('provider_identity_mismatch');
  if (response.model !== spec.model) violations.push('model_identity_mismatch');
  if (!isRecord(response.raw)) violations.push('raw_not_object');
  if (response.finishReason !== null && typeof response.finishReason !== 'string') violations.push('invalid_finish_reason');

  if (response.usage !== null) {
    if (!isRecord(response.usage)
      || !validTokenCount(response.usage.inputTokens)
      || !validTokenCount(response.usage.outputTokens)) {
      violations.push('invalid_usage');
    }
  }

  if (outcome && deliveredOutcomes.has(outcome)) {
    if (typeof response.content !== 'string' || response.content.trim().length === 0) {
      violations.push('delivered_outcome_requires_nonempty_text');
    }
  } else if (outcome && response.content !== null) {
    violations.push('technical_outcome_must_not_deliver_text');
  }

  if (violations.length > 0) {
    return {
      outcome: 'invalid_response',
      provider: spec.provider,
      model: spec.model,
      content: null,
      usage: isRecord(response.usage)
        && validTokenCount(response.usage.inputTokens)
        && validTokenCount(response.usage.outputTokens)
        ? {
            inputTokens: response.usage.inputTokens as number | null,
            outputTokens: response.usage.outputTokens as number | null,
          }
        : null,
      finishReason: typeof response.finishReason === 'string' ? response.finishReason : null,
      raw: {
        ...(isRecord(response.raw) ? response.raw : {}),
        wp02_boundary_rejection: {
          violations,
          received_outcome: typeof response.outcome === 'string' ? response.outcome : null,
          received_content_type: response.content === null ? 'null' : typeof response.content,
        },
      },
    };
  }

  return {
    outcome: outcome!,
    provider: response.provider as string,
    model: response.model as string,
    content: response.content as string | null,
    usage: response.usage as ProviderResponse['usage'],
    finishReason: response.finishReason as string | null,
    raw: response.raw as Record<string, unknown>,
  };
}

export function isRetriableProviderOutcome(outcome: Outcome): boolean {
  return outcome === 'timeout' || outcome === 'provider_error' || outcome === 'invalid_response' || outcome === 'rate_limit';
}
