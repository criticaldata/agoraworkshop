import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
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

  it('resumes an interrupted recovery run without duplicating messages', async () => {
    const db = tempDb();
    const config = frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } });
    const first = new WorkshopRunner({ db, frozen: config });
    await first.execute();
    const messages = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE run_id = ?').get(first.id) as { count: number };
    db.prepare(`UPDATE runs SET status = 'INTERRUPTED' WHERE run_id = ?`).run(first.id);
    const resumed = new WorkshopRunner({ db, frozen: config, resumeRunId: first.id });
    const result = await resumed.execute();
    const after = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE run_id = ?').get(first.id) as { count: number };
    expect(result.status).toBe('COMPLETED');
    expect(after.count).toBe(messages.count);
  });
});
