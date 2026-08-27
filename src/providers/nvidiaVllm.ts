import {
  failureResult,
  type AgentInvocationRequest,
  type AgentInvocationResult,
  type AgentProvider,
} from './types.js';
import type { InfrastructureFailure } from '../events/types.js';

export interface NvidiaVllmProviderOptions {
  baseURL?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

interface NvidiaVllmChatPayload {
  model: string;
  max_tokens: number;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  chat_template_kwargs: { enable_thinking: false };
  temperature?: number;
  top_p?: number;
  seed?: number;
}

interface NvidiaVllmChatResponse {
  id?: string;
  model?: string;
  system_fingerprint?: string | null;
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null } | null;
  }>;
  usage?: {
    prompt_tokens?: number | null;
    completion_tokens?: number | null;
  } | null;
  error?: {
    message?: string | null;
    code?: string | null;
  } | null;
}

export class MissingBaseUrlError extends Error {}

export class NvidiaVllmProvider implements AgentProvider {
  readonly name = 'nvidia_vllm';
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NvidiaVllmProviderOptions = {}) {
    this.baseURL = options.baseURL ?? process.env.NVIDIA_VLLM_BASE_URL ?? '';
    if (!this.baseURL) {
      throw new MissingBaseUrlError(
        'NVIDIA_VLLM_BASE_URL is not set. Set it, or run with a mock provider config.',
      );
    }
    this.apiKey = options.apiKey ?? process.env.NVIDIA_VLLM_API_KEY ?? 'local-no-auth';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async invoke(request: AgentInvocationRequest): Promise<AgentInvocationResult> {
    const requestTs = new Date().toISOString();
    const startedAt = Date.now();
    const timeout = setAbortTimer(request.timeoutMs);

    try {
      const response = await this.fetchImpl(buildChatCompletionsUrl(this.baseURL), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(buildNvidiaVllmRequestPayload(request)),
        signal: timeout.controller.signal,
      });

      const payload = await parseJson(response);
      if (!response.ok) {
        const category: InfrastructureFailure = response.status === 429 ? 'rate_limit' : 'provider_error';
        return failureResult(
          this.name,
          request,
          requestTs,
          startedAt,
          category,
          payload.error?.message?.trim() || `provider returned HTTP ${response.status}`,
          {
            status: response.status,
            response_id: payload.id ?? null,
            code: payload.error?.code ?? null,
          },
        );
      }

      const choice = payload.choices?.[0];
      if (!choice) {
        return failureResult(
          this.name,
          request,
          requestTs,
          startedAt,
          'malformed_response',
          'provider returned no choices',
          { response_id: payload.id ?? null },
        );
      }

      if (choice.message?.refusal) {
        return failureResult(
          this.name,
          request,
          requestTs,
          startedAt,
          'provider_refusal',
          choice.message.refusal,
          {
            response_id: payload.id ?? null,
            finish_reason: choice.finish_reason ?? null,
          },
        );
      }

      const responseTs = new Date().toISOString();
      return {
        ok: true,
        provider: this.name,
        requestedModel: request.model.model,
        respondedModel: payload.model ?? null,
        requestTs,
        responseTs,
        latencyMs: Date.now() - startedAt,
        finishReason: choice.finish_reason ?? null,
        content: (choice.message?.content ?? '').trim(),
        usage: {
          inputTokens: payload.usage?.prompt_tokens ?? null,
          outputTokens: payload.usage?.completion_tokens ?? null,
        },
        failure: null,
        raw: {
          response_id: payload.id ?? null,
          model: payload.model ?? null,
          system_fingerprint: payload.system_fingerprint ?? null,
          finish_reason: choice.finish_reason ?? null,
          usage: payload.usage ?? null,
          wire_protocol: 'openai_chat_completions',
          thinking_control: { mode: 'chat_template_kwargs.enable_thinking', value: false },
        },
      };
    } catch (error) {
      const { category, message, raw } = classifyError(error);
      return failureResult(this.name, request, requestTs, startedAt, category, message, raw);
    } finally {
      clearTimeout(timeout.timer);
    }
  }
}

export function buildNvidiaVllmRequestPayload(
  request: AgentInvocationRequest,
): NvidiaVllmChatPayload {
  const model = request.model;
  return {
    model: model.model,
    max_tokens: model.max_output_tokens,
    ...(model.temperature !== null ? { temperature: model.temperature } : {}),
    ...(model.top_p !== null ? { top_p: model.top_p } : {}),
    ...(model.seed !== null ? { seed: model.seed } : {}),
    chat_template_kwargs: { enable_thinking: false },
    messages: [
      { role: 'system', content: request.system },
      ...request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ],
  };
}

function buildChatCompletionsUrl(baseURL: string): string {
  return new URL('chat/completions', ensureTrailingSlash(baseURL)).toString();
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function setAbortTimer(timeoutMs: number): {
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

async function parseJson(response: Response): Promise<NvidiaVllmChatResponse> {
  try {
    return (await response.json()) as NvidiaVllmChatResponse;
  } catch (error) {
    throw new MalformedResponseError(error instanceof Error ? error.message : String(error));
  }
}

class MalformedResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MalformedResponseError';
  }
}

function classifyError(error: unknown): {
  category: InfrastructureFailure;
  message: string;
  raw: Record<string, unknown>;
} {
  if (error instanceof MalformedResponseError) {
    return {
      category: 'malformed_response',
      message: error.message,
      raw: { kind: 'MalformedResponseError' },
    };
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return { category: 'timeout', message: error.message, raw: { kind: 'AbortError' } };
  }
  if (error instanceof TypeError) {
    return { category: 'network_error', message: error.message, raw: { kind: 'TypeError' } };
  }
  return {
    category: 'unknown',
    message: error instanceof Error ? error.message : String(error),
    raw: { kind: 'unknown' },
  };
}
