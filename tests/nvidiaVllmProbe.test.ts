import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeNvidiaVllm, type NvidiaVllmProbeOptions } from '../src/providers/nvidiaVllmProbe.js';

function options(fetchImpl: typeof fetch): NvidiaVllmProbeOptions {
  return {
    baseURL: 'http://127.0.0.1:18002/v1',
    model: 'leoclaw-qwen3-32b',
    apiKey: 'do-not-return-this-secret',
    fetchImpl,
    timeoutMs: 1_000,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NVIDIA VLLM provider preflight', () => {
  it('qualifies models, version and one no-thinking chat request', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({
          object: 'list',
          data: [{ id: 'leoclaw-qwen3-32b', max_model_len: 16_384 }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.endsWith('/version')) {
        return new Response(JSON.stringify({ version: '0.25.1' }), { status: 200 });
      }
      expect(url).toBe('http://127.0.0.1:18002/v1/chat/completions');
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: 'leoclaw-qwen3-32b',
        max_tokens: 16,
        chat_template_kwargs: { enable_thinking: false },
      });
      expect(body.messages[0]).toEqual({ role: 'system', content: 'AGORA provider preflight.' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Reply with exactly AGORA-READY.' });
      expect(init?.headers).toMatchObject({ authorization: 'Bearer do-not-return-this-secret' });
      return new Response(JSON.stringify({
        id: 'preflight-chat',
        model: 'leoclaw-qwen3-32b',
        choices: [{ finish_reason: 'stop', message: { content: 'AGORA-READY' } }],
        usage: { prompt_tokens: 10, completion_tokens: 1 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const result = await probeNvidiaVllm(options(fetchImpl));

    expect(result.ok).toBe(true);
    expect(result.provider).toBe('nvidia_vllm');
    expect(result.authorization_present).toBe(true);
    expect(result.model).toBe('leoclaw-qwen3-32b');
    expect(result.models).toEqual({ count: 1, ids: ['leoclaw-qwen3-32b'], max_context_tokens: 16_384 });
    expect(result.server).toEqual({ version: '0.25.1' });
    expect(result.chat).toMatchObject({ finish_reason: 'stop', response_id: 'preflight-chat' });
    expect(JSON.stringify(result)).not.toContain('do-not-return-this-secret');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('rejects a requested model that the endpoint does not serve', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'other-model' }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ version: '0.25.1' }), { status: 200 });
    }) as typeof fetch;

    const result = await probeNvidiaVllm(options(fetchImpl));

    expect(result.ok).toBe(false);
    expect(result.failure?.category).toBe('model_mismatch');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns a redacted failure for an HTTP preflight error', async () => {
    const fetchImpl = vi.fn(async () => new Response('upstream unavailable', { status: 503 })) as typeof fetch;

    const result = await probeNvidiaVllm(options(fetchImpl));

    expect(result.ok).toBe(false);
    expect(result.failure?.category).toBe('http_error');
    expect(result.failure?.status).toBe(503);
    expect(JSON.stringify(result)).not.toContain('do-not-return-this-secret');
  });

  it('requires an endpoint instead of silently falling back to a mock', async () => {
    const result = await probeNvidiaVllm({ model: 'leoclaw-qwen3-32b', fetchImpl: fetch });

    expect(result.ok).toBe(false);
    expect(result.failure?.category).toBe('missing_base_url');
  });

  it('does not call the no-auth placeholder a real credential', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/models')) return new Response(JSON.stringify({ data: [{ id: 'leoclaw-qwen3-32b' }] }), { status: 200 });
      if (url.endsWith('/version')) return new Response(JSON.stringify({ version: '0.25.1' }), { status: 200 });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
    }) as typeof fetch;

    const result = await probeNvidiaVllm({
      baseURL: 'http://127.0.0.1:18002/v1',
      model: 'leoclaw-qwen3-32b',
      apiKey: '',
      fetchImpl,
    });

    expect(result.authorization_present).toBe(false);
  });
});
