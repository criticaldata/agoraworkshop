import { describe, expect, it } from 'vitest';
import { evaluatePhase01 } from '../src/acceptance/phase01.js';
import { readEvents } from '../src/events/recorder.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { frozen, tempDb } from './helpers.js';

describe('end-to-end trace completeness', () => {
  it('rejects a delivery event with no trace even when the message itself is valid', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();
    const message = db.prepare(`SELECT message_id, sender_agent_id FROM messages WHERE run_id = ? LIMIT 1`).get(runner.id) as { message_id: string; sender_agent_id: string };
    const run = db.prepare(`SELECT experiment_id, config_hash FROM runs WHERE run_id = ?`).get(runner.id) as { experiment_id: string; config_hash: string };
    const last = readEvents(db, runner.id).at(-1)!;

    db.prepare(
      `INSERT INTO events (event_id, run_id, experiment_id, config_hash, sequence, timestamp,
         elapsed_ms, event_type, workshop_state, agent_id, channel, trace_id, parent_event_id,
         causal_event_ids, payload)
       VALUES ('orphan_delivery', ?, ?, ?, ?, ?, 0, 'message_delivered', 'COMPLETED', ?, 'public', NULL, NULL, '[]', ?)`,
    ).run(
      runner.id, run.experiment_id, run.config_hash, last.sequence + 1, new Date().toISOString(),
      message.sender_agent_id, JSON.stringify({ message_id: message.message_id, sender_agent_id: message.sender_agent_id }),
    );

    expect(evaluatePhase01(db, runner.id).find((metric) => metric.id === 'M25')?.status).toBe('FAIL');
  });

  it('rejects a retry event whose opportunity trace is missing or inconsistent', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();
    const run = db.prepare(`SELECT experiment_id, config_hash FROM runs WHERE run_id = ?`).get(runner.id) as { experiment_id: string; config_hash: string };
    const last = readEvents(db, runner.id).at(-1)!;
    db.prepare(
      `INSERT INTO events (event_id, run_id, experiment_id, config_hash, sequence, timestamp,
         elapsed_ms, event_type, workshop_state, agent_id, channel, trace_id, parent_event_id,
         causal_event_ids, payload)
       VALUES ('orphan_retry', ?, ?, ?, ?, ?, 0, 'retry_scheduled', 'COMPLETED', 'agent_1', 'public', 'trace_missing', NULL, '[]', ?)`,
    ).run(
      runner.id, run.experiment_id, run.config_hash, last.sequence + 1, new Date().toISOString(),
      JSON.stringify({ opportunity_id: 'not-an-opportunity', next_attempt: 2 }),
    );

    expect(evaluatePhase01(db, runner.id).find((metric) => metric.id === 'M25')?.status).toBe('FAIL');
  });
});
