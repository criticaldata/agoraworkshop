import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { evaluatePhase01 } from '../src/acceptance/phase01.js';
import { frozen, tempDb } from './helpers.js';

describe('Phase 0.1 checkpoints', () => {
  it('writes an immutable checkpoint after every resolved opportunity when recovery is enabled', async () => {
    const db = tempDb();
    const config = frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } });
    const runner = new WorkshopRunner({ db, frozen: config });
    await runner.execute();

    const checkpoints = db
      .prepare('SELECT opportunity_id, event_sequence, state_json FROM run_checkpoints WHERE run_id = ? ORDER BY sequence')
      .all(runner.id) as Array<{ opportunity_id: string; event_sequence: number; state_json: string }>;
    expect(checkpoints.length).toBeGreaterThan(0);
    expect(checkpoints.every((checkpoint) => checkpoint.event_sequence > 0)).toBe(true);
    expect(JSON.parse(checkpoints[0]!.state_json)).toMatchObject({ config_hash: config.hash });
  });

  it('rejects a status-only interruption of a run that already recorded completion', async () => {
    const db = tempDb();
    const config = frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } });
    const first = new WorkshopRunner({ db, frozen: config });
    await first.execute();
    db.prepare(`UPDATE runs SET status = 'INTERRUPTED' WHERE run_id = ?`).run(first.id);
    expect(() => new WorkshopRunner({ db, frozen: config, resumeRunId: first.id })).toThrow(
      'resume cannot reopen a run that already recorded a terminal event',
    );
  });

  it('reuses a dangling opportunity after interruption instead of creating a replacement', async () => {
    const db = tempDb();
    const config = frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } });
    const first = new WorkshopRunner({ db, frozen: config });
    await first.execute();

    const opportunities = db.prepare(
      `SELECT opportunity_id, sequence FROM opportunities WHERE run_id = ? ORDER BY sequence`,
    ).all(first.id) as Array<{ opportunity_id: string; sequence: number }>;
    const target = opportunities[6]!;
    const targetEvent = db.prepare(
      `SELECT sequence FROM events WHERE run_id = ? AND event_type = 'response_opportunity_created'
       AND json_extract(payload, '$.opportunity_id') = ?`,
    ).get(first.id, target.opportunity_id) as { sequence: number };

    db.exec('PRAGMA foreign_keys = OFF');
    db.prepare(`DELETE FROM events WHERE run_id = ? AND sequence > ?`).run(first.id, targetEvent.sequence);
    db.prepare(`DELETE FROM invocations WHERE run_id = ? AND opportunity_id IN
      (SELECT opportunity_id FROM opportunities WHERE run_id = ? AND sequence >= ?)`).run(first.id, first.id, target.sequence);
    db.prepare(`DELETE FROM context_summaries WHERE run_id = ? AND opportunity_id IN
      (SELECT opportunity_id FROM opportunities WHERE run_id = ? AND sequence >= ?)`).run(first.id, first.id, target.sequence);
    db.prepare(`DELETE FROM tool_calls WHERE run_id = ? AND opportunity_id IN
      (SELECT opportunity_id FROM opportunities WHERE run_id = ? AND sequence >= ?)`).run(first.id, first.id, target.sequence);
    db.prepare(`DELETE FROM run_checkpoints WHERE run_id = ? AND sequence >= ?`).run(first.id, target.sequence);
    db.prepare(`DELETE FROM opportunities WHERE run_id = ? AND sequence > ?`).run(first.id, target.sequence);
    db.prepare(`UPDATE opportunities SET resolved_at = NULL, resolution = NULL, failure_category = NULL,
      behaviourally_available = 0, message_id = NULL, attempts = 0 WHERE opportunity_id = ?`).run(target.opportunity_id);
    db.prepare(`DELETE FROM messages WHERE run_id = ? AND source_event_id NOT IN
      (SELECT event_id FROM events WHERE run_id = ?)`).run(first.id, first.id);
    const originalStartedAt = new Date(Date.now() - 1000).toISOString();
    db.prepare(`UPDATE runs SET status = 'INTERRUPTED', termination_reason = 'interrupted',
      started_at = ?, ended_at = NULL, failure_reason = 'test interruption' WHERE run_id = ?`).run(originalStartedAt, first.id);
    db.exec('PRAGMA foreign_keys = ON');

    const resumed = new WorkshopRunner({ db, frozen: config, resumeRunId: first.id });
    const result = await resumed.execute();
    const after = db.prepare(
      `SELECT opportunity_id, sequence, resolution FROM opportunities WHERE run_id = ? ORDER BY sequence`,
    ).all(first.id) as Array<{ opportunity_id: string; sequence: number; resolution: string | null }>;

    expect(result.status).toBe('COMPLETED');
    expect(after).toHaveLength(opportunities.length);
    expect(after.map((row) => row.opportunity_id)).toContain(target.opportunity_id);
    expect(after.every((row) => row.resolution !== null)).toBe(true);
    expect(new Set(after.map((row) => row.sequence)).size).toBe(after.length);
    expect((db.prepare(`SELECT started_at FROM runs WHERE run_id = ?`).get(first.id) as { started_at: string }).started_at)
      .toBe(originalStartedAt);
    expect(evaluatePhase01(db, first.id).find((metric) => metric.id === 'M27')?.status).toBe('PASS');
  });

  it('repairs missing deliveries without invoking again when a message was already persisted', async () => {
    const db = tempDb();
    const config = frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } });
    const first = new WorkshopRunner({ db, frozen: config });
    await first.execute();

    const closing = db.prepare(
      `SELECT opportunity_id, message_id FROM opportunities WHERE run_id = ?
       ORDER BY sequence DESC LIMIT 1`,
    ).get(first.id) as { opportunity_id: string; message_id: string };
    const message = db.prepare(
      `SELECT source_event_id FROM messages WHERE message_id = ?`,
    ).get(closing.message_id) as { source_event_id: string };
    const delivery = db.prepare(
      `SELECT MAX(sequence) AS sequence FROM events WHERE run_id = ?
       AND event_type IN ('message_delivered', 'private_message_delivered')
       AND json_extract(payload, '$.message_id') = ?`,
    ).get(first.id, closing.message_id) as { sequence: number };

    // Model a crash after the message and its deliveries were durable but before the
    // opportunity update and terminal run events were committed.
    db.prepare(`DELETE FROM events WHERE run_id = ? AND sequence > ?`).run(first.id, delivery.sequence);
    db.prepare(`DELETE FROM run_checkpoints WHERE run_id = ? AND opportunity_id = ?`).run(first.id, closing.opportunity_id);
    db.prepare(`UPDATE opportunities SET resolved_at = NULL, resolution = NULL,
      failure_category = NULL, behaviourally_available = 0 WHERE opportunity_id = ?`).run(closing.opportunity_id);
    db.prepare(`UPDATE runs SET status = 'INTERRUPTED', termination_reason = 'interrupted',
      ended_at = NULL, failure_reason = 'test interruption' WHERE run_id = ?`).run(first.id);

    const invocationCountBefore = (db.prepare(
      `SELECT COUNT(*) AS count FROM invocations WHERE run_id = ? AND opportunity_id = ?`,
    ).get(first.id, closing.opportunity_id) as { count: number }).count;
    const messageCountBefore = (db.prepare(
      `SELECT COUNT(*) AS count FROM messages WHERE run_id = ?`,
    ).get(first.id) as { count: number }).count;

    const resumed = new WorkshopRunner({ db, frozen: config, resumeRunId: first.id });
    const result = await resumed.execute();

    expect(result.status, JSON.stringify(db.prepare(`SELECT event_type, payload FROM events WHERE run_id = ? ORDER BY sequence DESC LIMIT 3`).all(first.id))).toBe('COMPLETED');
    expect((db.prepare(
      `SELECT resolution, message_id FROM opportunities WHERE opportunity_id = ?`,
    ).get(closing.opportunity_id) as { resolution: string; message_id: string }).resolution).toBe('success');
    expect((db.prepare(
      `SELECT message_id FROM opportunities WHERE opportunity_id = ?`,
    ).get(closing.opportunity_id) as { message_id: string }).message_id).toBe(closing.message_id);
    expect((db.prepare(
      `SELECT COUNT(*) AS count FROM invocations WHERE run_id = ? AND opportunity_id = ?`,
    ).get(first.id, closing.opportunity_id) as { count: number }).count).toBe(invocationCountBefore);
    expect((db.prepare(
      `SELECT COUNT(*) AS count FROM messages WHERE run_id = ?`,
    ).get(first.id) as { count: number }).count).toBe(messageCountBefore);
    expect((db.prepare(
      `SELECT COUNT(*) AS count FROM events WHERE run_id = ? AND event_type IN ('message_delivered', 'private_message_delivered')
       AND json_extract(payload, '$.message_id') = ?`,
    ).get(first.id, closing.message_id) as { count: number }).count).toBeGreaterThan(0);
    expect((db.prepare(
      `SELECT source_event_id FROM messages WHERE message_id = ?`,
    ).get(closing.message_id) as { source_event_id: string }).source_event_id).toBe(message.source_event_id);
  });

  it('refuses to mark a resumed run complete while any opportunity remains unresolved', async () => {
    const db = tempDb();
    const config = frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } });
    const first = new WorkshopRunner({ db, frozen: config });
    await first.execute();

    const closing = db.prepare(
      `SELECT message_id FROM opportunities WHERE run_id = ? ORDER BY sequence DESC LIMIT 1`,
    ).get(first.id) as { message_id: string };
    const delivery = db.prepare(
      `SELECT MAX(sequence) AS sequence FROM events WHERE run_id = ?
       AND event_type IN ('message_delivered', 'private_message_delivered')
       AND json_extract(payload, '$.message_id') = ?`,
    ).get(first.id, closing.message_id) as { sequence: number };
    const lastOpportunity = db.prepare(
      `SELECT MAX(sequence) AS sequence FROM opportunities WHERE run_id = ?`,
    ).get(first.id) as { sequence: number };
    db.prepare(
      `INSERT INTO opportunities (opportunity_id, run_id, trace_id, sequence, agent_id,
         workshop_state, channel, round_index, created_at, behaviourally_available, attempts)
       VALUES ('opp_unresolved_after_schedule', ?, 'trace_unresolved_after_schedule', ?,
         'agent_1', 'CLOSING', 'public', 0, ?, 0, 0)`,
    ).run(first.id, lastOpportunity.sequence + 1, new Date().toISOString());
    db.prepare(`DELETE FROM events WHERE run_id = ? AND sequence > ?`).run(first.id, delivery.sequence);
    db.prepare(`UPDATE runs SET status = 'INTERRUPTED', termination_reason = 'interrupted',
      ended_at = NULL, failure_reason = 'test interruption' WHERE run_id = ?`).run(first.id);

    const resumed = new WorkshopRunner({ db, frozen: config, resumeRunId: first.id });
    const result = await resumed.execute();

    expect(result.status).toBe('FAILED');
    expect((db.prepare(
      `SELECT resolution FROM opportunities WHERE opportunity_id = 'opp_unresolved_after_schedule'`,
    ).get() as { resolution: string | null }).resolution).toBeNull();
  });
});
