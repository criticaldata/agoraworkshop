import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  plannedStates,
} from '../src/orchestrator/stateMachine.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { readEvents } from '../src/events/recorder.js';
import { getRun, getTransitions } from '../src/db/queries.js';
import { frozen, tempDb } from './helpers.js';
import type { AgentProvider } from '../src/providers/types.js';

describe('state machine', () => {
  it('permits the canonical sequence', () => {
    const sequence = [
      'CREATED',
      'INTRODUCTION',
      'PUBLIC_DISCUSSION',
      'PRIVATE_OR_BREAKOUT',
      'FINAL_DISCUSSION',
      'CLOSING',
      'COMPLETED',
    ] as const;
    for (let i = 0; i < sequence.length - 1; i += 1) {
      expect(canTransition(sequence[i]!, sequence[i + 1]!)).toBe(true);
    }
  });

  it('rejects backwards and skipping transitions', () => {
    expect(canTransition('COMPLETED', 'INTRODUCTION')).toBe(false);
    expect(canTransition('CREATED', 'COMPLETED')).toBe(false);
    expect(canTransition('FINAL_DISCUSSION', 'PUBLIC_DISCUSSION')).toBe(false);
  });

  it('has no outgoing transitions from terminal states', () => {
    expect(ALLOWED_TRANSITIONS.COMPLETED).toEqual([]);
    expect(ALLOWED_TRANSITIONS.FAILED).toEqual([]);
    expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([]);
  });

  it('skips phases with zero configured rounds but keeps ordering', () => {
    expect(
      plannedStates({
        introduction: 1,
        public_discussion: 0,
        private_or_breakout: 1,
        final_discussion: 0,
      }),
    ).toEqual(['INTRODUCTION', 'PRIVATE_OR_BREAKOUT', 'CLOSING']);
  });
});

describe('run lifecycle', () => {
  it('completes the full sequence and records every transition', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    const result = await runner.execute();

    expect(result.status).toBe('COMPLETED');
    expect(result.terminationReason).toBe('completed');

    const transitions = getTransitions(db, runner.id);
    expect(transitions.every((t) => t.status === 'completed')).toBe(true);
    expect(transitions.map((t) => t.to_state)).toEqual([
      'INTRODUCTION',
      'PUBLIC_DISCUSSION',
      'PRIVATE_OR_BREAKOUT',
      'FINAL_DISCUSSION',
      'CLOSING',
      'COMPLETED',
    ]);

    const events = readEvents(db, runner.id);
    expect(events.at(0)?.event_type).toBe('run_created');
    expect(events.at(-1)?.event_type).toBe('run_completed');
    expect(events.map((e) => e.sequence)).toEqual(events.map((_, i) => i + 1));
  });

  it('terminates cleanly and never runs indefinitely when the deadline passes', async () => {
    const db = tempDb();
    // A one-second budget with a slow provider guarantees the deadline fires mid-run.
    const slow: AgentProvider = {
      name: 'slow',
      invoke: async (request) => {
        await new Promise((r) => setTimeout(r, 120));
        const ts = new Date().toISOString();
        return {
          ok: true,
          provider: 'slow',
          requestedModel: request.model.model,
          respondedModel: request.model.model,
          requestTs: ts,
          responseTs: ts,
          latencyMs: 120,
          finishReason: 'end_turn',
          content: 'ok',
          usage: { inputTokens: 1, outputTokens: 1 },
          failure: null,
          raw: {},
        };
      },
    };

    const runner = new WorkshopRunner({
      db,
      frozen: frozen({
        workshop: {
          topic: 'deadline',
          max_duration_seconds: 1,
          rounds: {
            introduction: 1,
            public_discussion: 5,
            private_or_breakout: 1,
            final_discussion: 1,
          },
        },
      }),
      provider: slow,
    });

    const result = await runner.execute();
    expect(result.status).toBe('COMPLETED');
    expect(result.terminationReason).toBe('deadline_reached');

    const events = readEvents(db, runner.id);
    expect(events.some((e) => e.event_type === 'deadline_reached')).toBe(true);
    // Even a truncated run closes explicitly rather than just stopping.
    expect(getTransitions(db, runner.id).map((t) => t.to_state)).toContain('CLOSING');
    expect(getRun(db, runner.id)?.termination_reason).toBe('deadline_reached');
  }, 20000);

  it('bounds retries at max_retries + 1 attempts', async () => {
    const db = tempDb();
    let attempts = 0;
    const alwaysFails: AgentProvider = {
      name: 'broken',
      invoke: async (request) => {
        attempts += 1;
        const ts = new Date().toISOString();
        return {
          ok: false,
          provider: 'broken',
          requestedModel: request.model.model,
          respondedModel: null,
          requestTs: ts,
          responseTs: ts,
          latencyMs: 0,
          finishReason: null,
          content: null,
          usage: { inputTokens: null, outputTokens: null },
          failure: { category: 'provider_error', message: 'always fails' },
          raw: {},
        };
      },
    };

    const runner = new WorkshopRunner({
      db,
      frozen: frozen({
        workshop: {
          topic: 'retries',
          max_duration_seconds: 60,
          rounds: {
            introduction: 1,
            public_discussion: 0,
            private_or_breakout: 0,
            final_discussion: 0,
          },
        },
        runtime: { timeout_seconds: 5, max_retries: 2, retry_backoff_ms: 0 },
      }),
      provider: alwaysFails,
    });
    await runner.execute();

    // 1 moderator + 5 participants + 1 closing moderator turn = 7 opportunities, each
    // capped at 3 attempts.
    expect(attempts).toBe(7 * 3);
    const events = readEvents(db, runner.id);
    expect(events.filter((e) => e.event_type === 'retry_exhausted').length).toBe(7);
  });
});
