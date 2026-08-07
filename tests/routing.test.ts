import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { readEvents } from '../src/events/recorder.js';
import { getInvocations, getMessages } from '../src/db/queries.js';
import { auditPrivacyLeaks } from '../src/acceptance/gates.js';
import { breakoutRecipients, isVisibleTo } from '../src/orchestrator/visibility.js';
import { canonicalize, configHash, deepFreeze } from '../src/config/hash.js';
import type { ExperimentConfig } from '../src/config/schema.js';
import type { FrozenConfig } from '../src/config/load.js';
import { baseConfigObject, frozen, tempDb } from './helpers.js';

describe('message routing', () => {
  it('routes a public message to every other participant and the moderator', async () => {
    const db = tempDb();
    const config = frozen();
    const runner = new WorkshopRunner({ db, frozen: config });
    await runner.execute();

    const messages = getMessages(db, runner.id);
    const publicMessages = messages.filter((m) => m.channel === 'public');
    expect(publicMessages.length).toBeGreaterThan(0);

    const everyone = new Set([
      ...config.config.participants.map((p) => p.id),
      config.config.moderator.id,
    ]);
    for (const message of publicMessages) {
      const expected = [...everyone].filter((id) => id !== message.sender_agent_id).sort();
      expect([...message.actual_recipients].sort()).toEqual(expected);
    }
  });

  it('routes a breakout message only to that group', async () => {
    const db = tempDb();
    const config = frozen();
    const runner = new WorkshopRunner({ db, frozen: config });
    await runner.execute();

    const privateMessages = getMessages(db, runner.id).filter((m) => m.channel === 'private');
    expect(privateMessages.length).toBeGreaterThan(0);

    for (const message of privateMessages) {
      const group = config.config.channels.private.breakout_groups.find(
        (g) => g.id === message.breakout_group_id,
      )!;
      const expected = group.members.filter((id) => id !== message.sender_agent_id).sort();
      expect([...message.actual_recipients].sort()).toEqual(expected);
      // moderator_observes_private is false in this config.
      expect(message.actual_recipients).not.toContain('moderator');
    }
  });

  it('never places a private message in a non-recipient future context', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const audit = auditPrivacyLeaks(db, runner.id);
    expect(audit.contextReferencesChecked).toBeGreaterThan(0);
    expect(audit.violations).toEqual([]);
  });

  it('keeps agent_3 blind to breakout_a and agent_1 blind to breakout_b', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const messages = new Map(getMessages(db, runner.id).map((m) => [m.message_id, m]));
    const invocations = getInvocations(db, runner.id);

    const contextsFor = (agentId: string) =>
      invocations
        .filter((i) => i.agent_id === agentId)
        .flatMap((i) => JSON.parse(i.context_message_ids) as string[])
        .map((id) => messages.get(id)!)
        .filter((m) => m.channel === 'private');

    expect(contextsFor('agent_3').every((m) => m.breakout_group_id === 'breakout_b')).toBe(true);
    expect(contextsFor('agent_1').every((m) => m.breakout_group_id === 'breakout_a')).toBe(true);
    // The moderator does not observe private channels in this config.
    expect(contextsFor('moderator')).toEqual([]);
  });

  it('emits one delivery event per actual recipient', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const messages = getMessages(db, runner.id);
    const events = readEvents(db, runner.id);
    const deliveries = events.filter(
      (e) => e.event_type === 'message_delivered' || e.event_type === 'private_message_delivered',
    );
    const expected = messages.reduce((n, m) => n + m.actual_recipients.length, 0);
    expect(deliveries.length).toBe(expected);

    for (const message of messages) {
      const recipients = deliveries
        .filter((e) => e.payload['message_id'] === message.message_id)
        .map((e) => e.agent_id);
      expect([...recipients].sort()).toEqual([...message.actual_recipients].sort());
    }
  });

  it('routes to a moderator who is an explicit group member, even when observation is off', async () => {
    const db = tempDb();
    // moderator_observes_private only governs blanket observation. Explicit membership
    // is a separate, stronger statement and must still route.
    const config = frozen({
      channels: {
        public: { enabled: true },
        private: {
          enabled: true,
          moderator_observes_private: false,
          breakout_groups: [{ id: 'with_mod', members: ['agent_1', 'moderator'] }],
        },
      },
      workshop: {
        topic: 'moderator membership',
        max_duration_seconds: 60,
        rounds: {
          introduction: 0,
          public_discussion: 0,
          private_or_breakout: 1,
          final_discussion: 0,
        },
      },
    });

    const runner = new WorkshopRunner({ db, frozen: config });
    const result = await runner.execute();

    expect(result.status).toBe('COMPLETED');
    const privateMessages = getMessages(db, runner.id).filter((m) => m.channel === 'private');
    expect(privateMessages.length).toBe(1);
    expect(privateMessages[0]!.actual_recipients).toEqual(['moderator']);
  });

  it('emits a routing_error and fails the run when a group resolves to no recipients', async () => {
    const db = tempDb();
    // Deliberately bypasses schema validation to simulate a corrupted or hand-edited
    // config reaching the runtime. This is the case the routing guard exists for: the
    // run must fail loudly rather than silently dropping a message.
    const raw = baseConfigObject({
      channels: {
        public: { enabled: true },
        private: {
          enabled: true,
          moderator_observes_private: false,
          breakout_groups: [{ id: 'orphan', members: ['agent_1'] }],
        },
      },
      workshop: {
        topic: 'routing failure',
        max_duration_seconds: 60,
        rounds: {
          introduction: 0,
          public_discussion: 0,
          private_or_breakout: 1,
          final_discussion: 0,
        },
      },
    });
    const corrupted = deepFreeze(raw) as unknown as ExperimentConfig;
    const badConfig: FrozenConfig = {
      config: corrupted,
      hash: configHash(corrupted),
      canonical: canonicalize(corrupted),
      sourcePath: null,
    };

    const runner = new WorkshopRunner({ db, frozen: badConfig });
    const result = await runner.execute();

    expect(result.status).toBe('FAILED');
    const events = readEvents(db, runner.id);
    expect(events.some((e) => e.event_type === 'routing_error')).toBe(true);
    expect(events.at(-1)?.event_type).toBe('run_failed');
  });
});

describe('visibility rule', () => {
  const config = frozen().config;

  it('makes public messages visible to everyone', () => {
    expect(
      isVisibleTo(
        config,
        { channel: 'public', sender_agent_id: 'agent_1', actual_recipients: [] },
        'agent_5',
      ),
    ).toBe(true);
  });

  it('makes private messages visible to sender and recipients only', () => {
    const message = {
      channel: 'private' as const,
      sender_agent_id: 'agent_1',
      actual_recipients: ['agent_2'],
    };
    expect(isVisibleTo(config, message, 'agent_1')).toBe(true);
    expect(isVisibleTo(config, message, 'agent_2')).toBe(true);
    expect(isVisibleTo(config, message, 'agent_3')).toBe(false);
    expect(isVisibleTo(config, message, 'moderator')).toBe(false);
  });

  it('resolves an unknown breakout group to zero recipients rather than guessing', () => {
    expect(breakoutRecipients(config, 'no_such_group', 'agent_1')).toEqual([]);
  });
});
