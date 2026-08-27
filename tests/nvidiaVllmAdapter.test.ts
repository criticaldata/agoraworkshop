import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildNvidiaVllmRequestPayload,
  NvidiaVllmProvider,
} from '../src/providers/nvidiaVllm.js';
import type { AgentInvocationRequest } from '../src/providers/types.js';
import type { ExperimentConfig } from '../src/config/schema.js';
import { frozen } from './helpers.js';

function requestWith(overrides: Partial<ExperimentConfig['model']> = {}): AgentInvocationRequest {
  return {
    invocationId: 'inv_test',
    agentId: 'agent_1',
    attempt: 1,
    system: 'system prompt text',
    messages: [
      { role: 'user', content: 'turn instruction' },
      { role: 'assistant', content: 'earlier answer' },
    ],
    model: {
      ...frozen().config.model,
      provider: 'nvidia_vllm',
      model: 'leoclaw-qwen3-32b',
      max_output_tokens: 32,
      temperature: null,
      top_p: null,
      top_k: 40,
      seed: 7,
      thinking: 'disabled',
      effort: 'low',
      ...overrides,
    },
    timeoutMs: 1_000,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('nvidia_vllm request mapping', () => {
  it('uses max_tokens with a leading system message and disables Qwen thinking', () => {
    const payload = buildNvidiaVllmRequestPayload(requestWith());

    expect(payload.model).toBe('leoclaw-qwen3-32b');
    expect(payload.max_tokens).toBe(32);
    expect(payload.messages[0]).toEqual({ role: 'system', content: 'system prompt text' });
    expect(payload.messages[1]).toEqual({ role: 'user', content: 'turn instruction' });
    expect(payload.messages[2]).toEqual({ role: 'assistant', content: 'earlier answer' });
    expect(payload.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(payload.seed).toBe(7);
    expect(payload).not.toHaveProperty('max_completion_tokens');
    expect(payload).not.toHaveProperty('reasoning_effort');
    expect(payload).not.toHaveProperty('top_k');
  });

  it('omits null sampling parameters rather than sending defaults', () => {
    const payload = buildNvidiaVllmRequestPayload(
      requestWith({ temperature: null, top_p: null, seed: null }),
    );

    expect(payload).not.toHaveProperty('temperature');
    expect(payload).not.toHaveProperty('top_p');
    expect(payload).not.toHaveProperty('seed');
  });
});

describe('nvidia_vllm invoke', () => {
  it('maps a valid VLLM chat response into the provider-neutral result', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          model: 'leoclaw-qwen3-32b',
          choices: [
            {
              finish_reason: 'stop',
              message: { role: 'assistant', content: 'AGORA-READY' },
            },
          ],
          usage: { prompt_tokens: 11, completion_tokens: 3 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    ) as typeof fetch;
    const provider = new NvidiaVllmProvider({
      baseURL: 'http://127.0.0.1:18002/v1',
      apiKey: 'local-no-auth',
      fetchImpl,
    });

    const result = await provider.invoke(requestWith());

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('nvidia_vllm');
    expect(result.requestedModel).toBe('leoclaw-qwen3-32b');
    expect(result.respondedModel).toBe('leoclaw-qwen3-32b');
    expect(result.finishReason).toBe('stop');
    expect(result.content).toBe('AGORA-READY');
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 3 });
    expect(result.raw).toMatchObject({
      response_id: 'chatcmpl-test',
      finish_reason: 'stop',
      wire_protocol: 'openai_chat_completions',
      thinking_control: { mode: 'chat_template_kwargs.enable_thinking', value: false },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('classifies HTTP 429 as rate_limit', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'slow down' } }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;
    const provider = new NvidiaVllmProvider({
      baseURL: 'http://127.0.0.1:18002/v1',
      fetchImpl,
    });

    const result = await provider.invoke(requestWith());

    expect(result.ok).toBe(false);
    expect(result.failure?.category).toBe('rate_limit');
    expect(result.failure?.message).toMatch(/slow down/i);
  });

  it('classifies a non-JSON HTTP 429 as rate_limit instead of malformed_response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('too many requests', {
        status: 429,
        headers: { 'content-type': 'text/plain' },
      }),
    ) as typeof fetch;
    const provider = new NvidiaVllmProvider({
      baseURL: 'http://127.0.0.1:18002/v1',
      fetchImpl,
    });

    const result = await provider.invoke(requestWith());

    expect(result.ok).toBe(false);
    expect(result.failure?.category).toBe('rate_limit');
    expect(result.failure?.message).toMatch(/http 429/i);
  });

  it('classifies aborts as timeout', async () => {
    const fetchImpl = vi.fn(async () => {
      const error = new Error('aborted by signal');
      error.name = 'AbortError';
      throw error;
    }) as typeof fetch;
    const provider = new NvidiaVllmProvider({
      baseURL: 'http://127.0.0.1:18002/v1',
      fetchImpl,
    });

    const result = await provider.invoke(requestWith());

    expect(result.ok).toBe(false);
    expect(result.failure?.category).toBe('timeout');
  });

  it('classifies malformed JSON as malformed_response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as typeof fetch;
    const provider = new NvidiaVllmProvider({
      baseURL: 'http://127.0.0.1:18002/v1',
      fetchImpl,
    });

    const result = await provider.invoke(requestWith());

    expect(result.ok).toBe(false);
    expect(result.failure?.category).toBe('malformed_response');
  });

  it('classifies an empty choices array as malformed_response', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: 'chatcmpl-empty',
          model: 'leoclaw-qwen3-32b',
          choices: [],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    ) as typeof fetch;
    const provider = new NvidiaVllmProvider({
      baseURL: 'http://127.0.0.1:18002/v1',
      fetchImpl,
    });

    const result = await provider.invoke(requestWith());

    expect(result.ok).toBe(false);
    expect(result.failure?.category).toBe('malformed_response');
    expect(result.failure?.message).toMatch(/no choices/i);
  });
});
