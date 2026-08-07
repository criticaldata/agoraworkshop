import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { getInvocations, getMessages, getRun, runConfig } from '../src/db/queries.js';
import { readEvents } from '../src/events/recorder.js';
import { assembleContext } from '../src/orchestrator/context.js';
import { frozen, tempDb } from './helpers.js';

describe('context provenance', () => {
  it('records the exact source message ids for every invocation', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const messages = new Map(getMessages(db, runner.id).map((m) => [m.message_id, m]));
    const invocations = getInvocations(db, runner.id);
    expect(invocations.length).toBeGreaterThan(0);

    for (const invocation of invocations) {
      const ids = JSON.parse(invocation.context_message_ids) as string[];
      for (const id of ids) expect(messages.has(id)).toBe(true);

      // Only messages that already existed can be in a context.
      const maxSequence = Math.max(0, ...ids.map((id) => messages.get(id)!.sequence));
      if (invocation.output_message_id) {
        expect(messages.get(invocation.output_message_id)!.sequence).toBeGreaterThan(maxSequence);
      }
    }
  });

  it('keeps public and private context ids in separate fields that partition the whole', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    for (const invocation of getInvocations(db, runner.id)) {
      const all = JSON.parse(invocation.context_message_ids) as string[];
      const publicIds = JSON.parse(invocation.context_public_ids) as string[];
      const privateIds = JSON.parse(invocation.context_private_ids) as string[];

      expect(publicIds.length + privateIds.length).toBe(all.length);
      expect(publicIds.some((id) => privateIds.includes(id))).toBe(false);
      expect([...publicIds, ...privateIds].sort()).toEqual([...all].sort());
    }
  });

  it('stores the resolved system prompt and rendered context, not just a version tag', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const invocation = getInvocations(db, runner.id).find((i) => i.agent_id === 'agent_2')!;
    expect(invocation.prompt_version).toBe('v1');
    expect(invocation.system_prompt).toContain('agent id: agent_2');
    const rendered = JSON.parse(invocation.rendered_messages) as Array<{ content: string }>;
    expect(rendered[0]?.content).toContain('WORKSHOP PHASE:');
    expect(invocation.context_policy_version).toBe('v1');
    expect(JSON.parse(invocation.generation_params)).toMatchObject({ provider: 'mock' });
  });

  it('can reconstruct a stored context from the config snapshot and message ids alone', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const run = getRun(db, runner.id)!;
    const config = runConfig(run);
    const messages = getMessages(db, runner.id);

    // Pick a mid-run public invocation so the reconstruction is non-trivial.
    const invocation = getInvocations(db, runner.id).find(
      (i) =>
        i.workshop_state === 'FINAL_DISCUSSION' &&
        i.channel === 'public' &&
        i.agent_id !== config.moderator.id &&
        i.outcome === 'success',
    )!;
    expect(invocation).toBeDefined();

    const outputSequence = messages.find((m) => m.message_id === invocation.output_message_id)!.sequence;
    const historyAtTime = messages.filter((m) => m.sequence < outputSequence);

    const rebuilt = assembleContext({
      config,
      history: historyAtTime,
      agentId: invocation.agent_id,
      state: 'FINAL_DISCUSSION',
      roundIndex: 0,
      totalRounds: 1,
      channel: 'public',
    });

    expect(rebuilt.includedMessageIds).toEqual(JSON.parse(invocation.context_message_ids));
    expect(rebuilt.systemPrompt).toBe(invocation.system_prompt);
  });

  it('links context_assembled events to the invocation that consumed them', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const events = readEvents(db, runner.id);
    const assembled = events.filter((e) => e.event_type === 'context_assembled');
    expect(assembled.length).toBeGreaterThan(0);

    for (const event of assembled) {
      const children = events.filter(
        (e) => e.event_type === 'agent_invocation_started' && e.parent_event_id === event.event_id,
      );
      expect(children.length).toBeGreaterThan(0);
      const opportunityId = event.payload['opportunity_id'];
      expect(children.every((c) => c.payload['opportunity_id'] === opportunityId)).toBe(true);
    }
  });
});
