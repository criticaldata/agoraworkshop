import { describe, expect, it } from 'vitest';
import { buildProvider } from '../src/providers/registry.js';
import { frozen } from './helpers.js';

describe('context-contract mock provider', () => {
  it('returns a deterministic receipt of the authorized context and trace', async () => {
    const config = frozen({
      model: { ...(frozen().config.model as object), provider: 'mock_context_contract' },
    }).config;
    const provider = buildProvider(config).provider;

    const request = {
      invocationId: 'inv_1',
      agentId: 'agent_1',
      attempt: 1,
      system: 'System prompt',
      messages: [{ role: 'user' as const, content: 'Visible transcript' }],
      model: config.model,
      timeoutMs: 1_000,
      workshopState: 'INTRODUCTION' as const,
      traceId: 'trace_contract',
      configHash: 'sha256:config',
      contextMessageIds: ['msg_public'],
      summaryIds: ['summary_public'],
      capabilityManifest: [],
    };

    const first = await provider.invoke(request);
    const second = await provider.invoke(request);

    expect(first.ok).toBe(true);
    expect(first.content).toBe(second.content);
    const receipt = JSON.parse(first.content ?? '{}') as Record<string, unknown>;
    expect(receipt).toMatchObject({
      kind: 'mock_context_contract',
      trace_id: 'trace_contract',
      config_hash: 'sha256:config',
      context_message_ids: ['msg_public'],
      summary_ids: ['summary_public'],
    });
    expect(receipt['system_hash']).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(receipt['rendered_messages_hash']).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

