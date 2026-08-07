import Anthropic from '@anthropic-ai/sdk';
import {
  failureResult,
  type AgentInvocationRequest,
  type AgentInvocationResult,
  type AgentProvider,
} from './types.js';
import type { InfrastructureFailure } from '../events/types.js';

export class MissingCredentialsError extends Error {}
export class UnsupportedModelParameterError extends Error {}

/**
 * Thin provider-neutral adapter over the Anthropic Messages API.
 *
 * Two deliberate choices, both required by the Phase 0 experimental-control rules:
 *  - SDK retries are disabled. Retries are the orchestrator's job so that every
 *    attempt is visible in the event log.
 *  - No server-side fallback is configured. The spec forbids silently falling back
 *    to another model, so a policy refusal is surfaced as its own failure category
 *    rather than being rescued by a different model.
 */
export class AnthropicProvider implements AgentProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) {
      throw new MissingCredentialsError(
        'ANTHROPIC_API_KEY is not set. Set it, or run with the mock provider config.',
      );
    }
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  async invoke(request: AgentInvocationRequest): Promise<AgentInvocationResult> {
    const requestTs = new Date().toISOString();
    const startedAt = Date.now();
    const model = request.model;

    // Current Claude models reject non-default sampling parameters outright. Failing
    // loudly beats silently discarding a recorded experimental parameter.
    for (const [key, value] of [
      ['temperature', model.temperature],
      ['top_p', model.top_p],
      ['top_k', model.top_k],
    ] as const) {
      if (value !== null) {
        throw new UnsupportedModelParameterError(
          `model.${key} is set to ${value}, but ${model.model} does not accept sampling parameters. ` +
            `Set it to null and control generation with model.effort instead.`,
        );
      }
    }

    try {
      const response = await this.client.messages.create(
        {
          model: model.model,
          max_tokens: model.max_output_tokens,
          system: request.system,
          messages: request.messages,
          thinking:
            model.thinking === 'adaptive'
              ? { type: 'adaptive', display: model.thinking_display }
              : { type: 'disabled' },
          output_config: { effort: model.effort },
        },
        { timeout: request.timeoutMs },
      );

      // A policy refusal is a successful HTTP response with an empty or partial body.
      // Check stop_reason before touching content.
      if (response.stop_reason === 'refusal') {
        return failureResult(
          this.name,
          request,
          requestTs,
          startedAt,
          'provider_refusal',
          `provider refused: ${response.stop_details?.category ?? 'uncategorised'}`,
          {
            stop_reason: response.stop_reason,
            stop_details: response.stop_details ?? null,
            response_id: response.id,
          },
        );
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();

      const responseTs = new Date().toISOString();
      return {
        ok: true,
        provider: this.name,
        requestedModel: model.model,
        respondedModel: response.model,
        requestTs,
        responseTs,
        latencyMs: Date.now() - startedAt,
        finishReason: response.stop_reason ?? null,
        content: text,
        usage: {
          inputTokens: response.usage.input_tokens ?? null,
          outputTokens: response.usage.output_tokens ?? null,
        },
        failure: null,
        raw: {
          response_id: response.id,
          stop_reason: response.stop_reason,
          cache_read_input_tokens: response.usage.cache_read_input_tokens ?? null,
          cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? null,
        },
      };
    } catch (error) {
      const { category, message, raw } = classifyError(error);
      return failureResult(this.name, request, requestTs, startedAt, category, message, raw);
    }
  }
}

export function classifyError(error: unknown): {
  category: InfrastructureFailure;
  message: string;
  raw: Record<string, unknown>;
} {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { category: 'timeout', message: error.message, raw: { kind: 'APIConnectionTimeoutError' } };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { category: 'rate_limit', message: error.message, raw: { kind: 'RateLimitError', status: 429 } };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { category: 'network_error', message: error.message, raw: { kind: 'APIConnectionError' } };
  }
  if (error instanceof Anthropic.APIError) {
    return {
      category: 'provider_error',
      message: error.message,
      raw: { kind: 'APIError', status: error.status ?? null },
    };
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return { category: 'timeout', message: error.message, raw: { kind: 'AbortError' } };
  }
  return {
    category: 'unknown',
    message: error instanceof Error ? error.message : String(error),
    raw: { kind: 'unknown' },
  };
}
