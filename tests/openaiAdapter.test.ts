import { describe, expect, it } from 'vitest';
import { buildRequestPayload, classifyError } from '../src/providers/openai.js';
import type { AgentInvocationRequest } from '../src/providers/types.js';
import type { ExperimentConfig } from '../src/config/schema.js';
import { frozen } from './helpers.js';

function requestWith(overrides: Partial<ExperimentConfig['model']> = {}): AgentInvocationRequest {
  return {
    invocationId: 'inv_test',
    agentId: 'agent_1',
    attempt: 1,
    system: 'system prompt text',
    messages: [{ role: 'user', content: 'turn instruction' }],
    model: {
      ...frozen().config.model,
      provider: 'openai',
      model: 'gpt-5.6-sol',
      max_output_tokens: 1200,
      ...overrides,
    },
    timeoutMs: 1000,
  };
}

describe('openai request mapping', () => {
  it('uses max_completion_tokens, not the legacy max_tokens', () => {
    const payload = buildRequestPayload(requestWith());
    expect(payload.max_completion_tokens).toBe(1200);
    expect(payload).not.toHaveProperty('max_tokens');
  });

  it('sends the configured effort as reasoning_effort when thinking is adaptive', () => {
    expect(buildRequestPayload(requestWith({ thinking: 'adaptive', effort: 'high' })).reasoning_effort).toBe('high');
    expect(buildRequestPayload(requestWith({ thinking: 'adaptive', effort: 'xhigh' })).reasoning_effort).toBe('xhigh');
  });

  it("states 'none' explicitly when thinking is disabled, rather than omitting the field", () => {
    const payload = buildRequestPayload(requestWith({ thinking: 'disabled' }));
    expect(payload.reasoning_effort).toBe('none');
  });

  it('omits sampling parameters that the config left null, instead of sending defaults', () => {
    const payload = buildRequestPayload(
      requestWith({ temperature: null, top_p: null, seed: null }),
    );
    expect(payload).not.toHaveProperty('temperature');
    expect(payload).not.toHaveProperty('top_p');
    expect(payload).not.toHaveProperty('seed');
  });

  it('forwards sampling parameters the config did set', () => {
    const payload = buildRequestPayload(requestWith({ temperature: 0.2, top_p: 0.9, seed: 42 }));
    expect(payload.temperature).toBe(0.2);
    expect(payload.top_p).toBe(0.9);
    expect(payload.seed).toBe(42);
  });

  it('puts the system prompt in a developer message ahead of the turn', () => {
    const payload = buildRequestPayload(requestWith());
    expect(payload.messages[0]).toEqual({ role: 'developer', content: 'system prompt text' });
    expect(payload.messages[1]).toEqual({ role: 'user', content: 'turn instruction' });
  });

  it('never sends top_k, which the Chat Completions API does not accept', () => {
    const payload = buildRequestPayload(requestWith({ top_k: 40 }));
    expect(payload).not.toHaveProperty('top_k');
  });
});

describe('openai error classification', () => {
  it('classifies an aborted request as a timeout', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    expect(classifyError(error).category).toBe('timeout');
  });

  it('falls back to unknown rather than guessing a category', () => {
    expect(classifyError(new Error('something odd')).category).toBe('unknown');
  });
});
