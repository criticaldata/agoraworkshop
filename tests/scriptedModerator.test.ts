import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { getInvocations, getMessages } from '../src/db/queries.js';
import { computeAnalytics } from '../src/analytics/summary.js';
import { configHash } from '../src/config/hash.js';
import { freezeConfig } from '../src/config/load.js';
import { ExperimentConfigSchema } from '../src/config/schema.js';
import { scriptedModeratorLine } from '../src/providers/scriptedModerator.js';
import { baseConfigObject, frozen, tempDb } from './helpers.js';

const scripted = () =>
  frozen({ moderator: { id: 'moderator', display_name: 'Moderator', mode: 'scripted' } });

describe('scripted moderator', () => {
  it('[CTX-01] produces the fixed line for each phase, not model output', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: scripted() });
    await runner.execute();

    const moderatorMessages = getMessages(db, runner.id).filter(
      (m) => m.sender_agent_id === 'moderator',
    );
    expect(moderatorMessages.length).toBeGreaterThan(0);
    for (const message of moderatorMessages) {
      expect(message.content).toBe(scriptedModeratorLine(message.workshop_state as never));
    }
  });

  it('never summarises when it closes the session', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: scripted() });
    await runner.execute();

    const closing = getMessages(db, runner.id).find(
      (m) => m.sender_agent_id === 'moderator' && m.workshop_state === 'CLOSING',
    )!;
    expect(closing.content).toContain('does not summarise');
    // Nothing a participant said can appear in a line that is fixed in source.
    expect(closing.content).toBe(scriptedModeratorLine('CLOSING'));
  });

  it('spends no tokens and is counted separately from model calls', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: scripted() });
    await runner.execute();

    const invocations = getInvocations(db, runner.id);
    const moderatorCalls = invocations.filter((i) => i.agent_id === 'moderator');
    expect(moderatorCalls.length).toBeGreaterThan(0);
    for (const call of moderatorCalls) {
      expect(call.provider).toBe('scripted');
      expect(call.input_tokens).toBe(0);
      expect(call.output_tokens).toBe(0);
    }

    const analytics = computeAnalytics(db, runner.id);
    expect(analytics.total_scripted_calls).toBe(moderatorCalls.length);
    expect(analytics.total_model_calls).toBe(invocations.length - moderatorCalls.length);
    expect(analytics.total_model_calls).toBeGreaterThan(0);
  });

  it('leaves participants on the configured model provider', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: scripted() });
    await runner.execute();

    const participantCalls = getInvocations(db, runner.id).filter(
      (i) => i.agent_id !== 'moderator',
    );
    expect(participantCalls.length).toBeGreaterThan(0);
    expect(new Set(participantCalls.map((i) => i.provider))).toEqual(new Set(['mock']));
  });

  it('is deterministic: two runs produce identical moderator text', async () => {
    const db = tempDb();
    const a = new WorkshopRunner({ db, frozen: scripted() });
    await a.execute();
    const b = new WorkshopRunner({ db, frozen: scripted() });
    await b.execute();

    const linesOf = (runId: string) =>
      getMessages(db, runId)
        .filter((m) => m.sender_agent_id === 'moderator')
        .map((m) => m.content);
    expect(linesOf(a.id)).toEqual(linesOf(b.id));
  });
});

describe('moderator.mode as a config field', () => {
  it('is optional and adds nothing to the hash when absent', () => {
    // A default would be written into every parsed config and would move the hash of
    // runs already recorded, breaking rerun of those runs.
    const parsed = ExperimentConfigSchema.parse(baseConfigObject());
    expect('mode' in parsed.moderator).toBe(false);
    expect(configHash(parsed)).toBe(configHash(ExperimentConfigSchema.parse(baseConfigObject())));
  });

  it('changes the hash when set, because it changes the experiment', () => {
    const withoutMode = freezeConfig(baseConfigObject());
    const withMode = freezeConfig(
      baseConfigObject({
        moderator: { id: 'moderator', display_name: 'Moderator', mode: 'scripted' },
      }),
    );
    expect(withMode.hash).not.toBe(withoutMode.hash);
  });

  it('refuses a config that aims a fault at a moderator which never calls a provider', () => {
    expect(() =>
      freezeConfig(
        baseConfigObject({
          moderator: { id: 'moderator', display_name: 'Moderator', mode: 'scripted' },
          fault_injection: {
            enabled: true,
            faults: [
              {
                agent_id: 'moderator',
                state: 'PUBLIC_DISCUSSION',
                occurrence: 1,
                kind: 'timeout',
                recover_after_attempts: 1,
              },
            ],
          },
        }),
      ),
    ).toThrow(/scripted/);
  });
});
