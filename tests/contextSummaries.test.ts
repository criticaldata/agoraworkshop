import { describe, expect, it } from 'vitest';
import { assembleContext } from '../src/orchestrator/context.js';
import { frozen } from './helpers.js';

describe('channel-aware context summaries', () => {
  it('keeps a private breakout source out of an unrelated participant public context', () => {
    const config = frozen({
      context_policy: {
        version: 'phase0_1',
        include_public_history: true,
        include_own_private: true,
        max_messages: 1,
        summarization: {
          enabled: true,
          version: 'rolling-v1',
          max_source_messages: 1,
          scopes: ['public', 'breakout', 'private'],
          fidelity_audit: true,
        },
      },
    }).config;
    const history = [
      {
        message_id: 'public_1',
        sequence: 1,
        channel: 'public' as const,
        breakout_group_id: null,
        sender_agent_id: 'agent_1',
        intended_recipients: ['agent_2'],
        actual_recipients: ['agent_2'],
        workshop_state: 'INTRODUCTION',
        created_at: '2026-01-01T00:00:00.000Z',
        content: 'Public premise',
        source_invocation_id: null,
        source_event_id: null,
      },
      {
        message_id: 'private_a',
        sequence: 2,
        channel: 'private' as const,
        breakout_group_id: 'breakout_a',
        sender_agent_id: 'agent_1',
        intended_recipients: ['agent_2'],
        actual_recipients: ['agent_2'],
        workshop_state: 'PRIVATE_OR_BREAKOUT',
        created_at: '2026-01-01T00:00:01.000Z',
        content: 'Private breakout A detail',
        source_invocation_id: null,
        source_event_id: null,
      },
    ];

    const context = assembleContext({
      config,
      history,
      agentId: 'agent_3',
      state: 'FINAL_DISCUSSION',
      roundIndex: 0,
      totalRounds: 1,
      channel: 'public',
    }) as unknown as {
      summaryRecords: Array<{ source_message_ids: string[]; content: string; content_hash: string }>;
    };

    expect(context.summaryRecords).toHaveLength(1);
    expect(context.summaryRecords[0]!.source_message_ids).toEqual(['public_1']);
    expect(context.summaryRecords[0]!.content).not.toContain('Private breakout A detail');
    expect(context.summaryRecords[0]!.content_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
