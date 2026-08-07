import OpenAI from 'openai';
import {
  failureResult,
  type AgentInvocationRequest,
  type AgentInvocationResult,
  type AgentProvider,
} from './types.js';
import type { InfrastructureFailure } from '../events/types.js';

export class MissingCredentialsError extends Error {}

/**
 * Thin provider-neutral adapter over the OpenAI Chat Completions API.
 *
 * Same two experimental-control choices as the Anthropic adapter:
 *  - SDK retries are disabled, because retries are the orchestrator's job and every
 *    attempt has to be visible in the event log.
 *  - No model fallback of any kind. A refusal is surfaced as its own failure category
 *    rather than being quietly re-served by a different model.
 *
 * Sampling parameters are sent only when the config sets them to a non-null value, so
 * `null` in the config means "not set" rather than "set to the provider default" — the
 * distinction matters when the config is read as an experimental record.
 */
export class OpenAIProvider implements AgentProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) {
      throw new MissingCredentialsError(
        'OPENAI_API_KEY is not set. Set it, or run with the mock provider config.',
      );
    }
    this.client = new OpenAI({
      apiKey,
      maxRetries: 0,
      ...(process.env.OPENAI_BASE_URL ? { baseURL: process.env.OPENAI_BASE_URL } : {}),
    });
  }

  async invoke(request: AgentInvocationRequest): Promise<AgentInvocationResult> {
    const requestTs = new Date().toISOString();
    const startedAt = Date.now();
    const model = request.model;

    try {
      const response = await this.client.chat.completions.create(buildRequestPayload(request), {
        timeout: request.timeoutMs,
      });

      const choice = response.choices[0];
      if (!choice) {
        return failureResult(
          this.name,
          request,
          requestTs,
          startedAt,
          'malformed_response',
          'provider returned no choices',
          { response_id: response.id },
        );
      }

      // A refusal is a successful HTTP response carrying no usable content. Check it
      // before reading the message text.
      if (choice.message.refusal || choice.finish_reason === 'content_filter') {
        return failureResult(
          this.name,
          request,
          requestTs,
          startedAt,
          'provider_refusal',
          choice.message.refusal ?? 'content filtered by the provider',
          {
            response_id: response.id,
            finish_reason: choice.finish_reason,
            refusal: choice.message.refusal ?? null,
          },
        );
      }

      const responseTs = new Date().toISOString();
      return {
        ok: true,
        provider: this.name,
        requestedModel: model.model,
        respondedModel: response.model,
        requestTs,
        responseTs,
        latencyMs: Date.now() - startedAt,
        finishReason: choice.finish_reason ?? null,
        content: (choice.message.content ?? '').trim(),
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? null,
          outputTokens: response.usage?.completion_tokens ?? null,
        },
        failure: null,
        raw: {
          response_id: response.id,
          finish_reason: choice.finish_reason,
          system_fingerprint: response.system_fingerprint ?? null,
          reasoning_tokens:
            response.usage?.completion_tokens_details?.reasoning_tokens ?? null,
          cached_input_tokens: response.usage?.prompt_tokens_details?.cached_tokens ?? null,
        },
      };
    } catch (error) {
      const { category, message, raw } = classifyError(error);
      return failureResult(this.name, request, requestTs, startedAt, category, message, raw);
    }
  }
}

/**
 * Maps the provider-neutral config onto OpenAI's Chat Completions parameters.
 *
 * Exported so the mapping is directly inspectable and testable: it is the one place
 * where a recorded experimental parameter could be silently dropped or renamed.
 */
export function buildRequestPayload(
  request: AgentInvocationRequest,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  const model = request.model;
  return {
    model: model.model,
    max_completion_tokens: model.max_output_tokens,
    // `disabled` maps to the provider's explicit "no reasoning" setting rather than to
    // an omitted field, so the request states the choice outright.
    reasoning_effort: model.thinking === 'adaptive' ? model.effort : 'none',
    ...(model.temperature !== null ? { temperature: model.temperature } : {}),
    ...(model.top_p !== null ? { top_p: model.top_p } : {}),
    ...(model.seed !== null ? { seed: model.seed } : {}),
    messages: [
      { role: 'developer', content: request.system },
      ...request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  };
}

export function classifyError(error: unknown): {
  category: InfrastructureFailure;
  message: string;
  raw: Record<string, unknown>;
} {
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return { category: 'timeout', message: error.message, raw: { kind: 'APIConnectionTimeoutError' } };
  }
  if (error instanceof OpenAI.RateLimitError) {
    return { category: 'rate_limit', message: error.message, raw: { kind: 'RateLimitError', status: 429 } };
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return { category: 'network_error', message: error.message, raw: { kind: 'APIConnectionError' } };
  }
  if (error instanceof OpenAI.APIError) {
    return {
      category: 'provider_error',
      message: error.message,
      raw: { kind: 'APIError', status: error.status ?? null, code: error.code ?? null },
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
