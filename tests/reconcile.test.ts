import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { reconcileInterruptedRuns } from '../src/orchestrator/reconcile.js';
import { getOpportunities, getRun } from '../src/db/queries.js';
import { readEvents } from '../src/events/recorder.js';
import { frozen, tempDb } from './helpers.js';

/**
 * A run executes inside the web process, so a deploy or a crash leaves it in RUNNING
 * with a complete log up to the moment it stopped. These tests pin down that the
 * apparatus says so rather than quietly rounding the run to something tidier.
 */
describe('startup reconciliation', () => {
  it('marks a run left RUNNING as INTERRUPTED without inventing an outcome', () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    // Simulate the process dying between "started" and any terminal write.
    db.prepare(`UPDATE runs SET status = 'RUNNING' WHERE run_id = ?`).run(runner.id);

    const result = reconcileInterruptedRuns(db);

    expect(result.interrupted.map((r) => r.run_id)).toEqual([runner.id]);
    const run = getRun(db, runner.id)!;
    expect(run.status).toBe('INTERRUPTED');
    expect(run.termination_reason).toBe('interrupted');
    // Never COMPLETED, never FAILED: the experiment did not fail, it was cut off.
    expect(run.status).not.toBe('COMPLETED');
    expect(run.failure_reason).toContain('stopped before the workshop reached a terminal state');
  });

  it('records a run_interrupted event after the last event the run wrote', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();
    const beforeCount = readEvents(db, runner.id).length;
    const lastSequence = readEvents(db, runner.id).at(-1)!.sequence;
    db.prepare(`UPDATE runs SET status = 'RUNNING' WHERE run_id = ?`).run(runner.id);

    reconcileInterruptedRuns(db);

    const events = readEvents(db, runner.id);
    expect(events.length).toBe(beforeCount + 1);
    const last = events.at(-1)!;
    expect(last.event_type).toBe('run_interrupted');
    expect(last.sequence).toBe(lastSequence + 1);
    expect(last.payload['previous_status']).toBe('RUNNING');
  });

  it('resolves dangling turns as infrastructure failure, never as abstention', () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    db.prepare(`UPDATE runs SET status = 'RUNNING' WHERE run_id = ?`).run(runner.id);
    db.prepare(
      `INSERT INTO opportunities (opportunity_id, run_id, sequence, agent_id, workshop_state,
         channel, round_index, created_at, behaviourally_available, attempts)
       VALUES ('opp_dangling', ?, 1, 'agent_1', 'PUBLIC_DISCUSSION', 'public', 0, ?, 1, 1)`,
    ).run(runner.id, new Date().toISOString());

    reconcileInterruptedRuns(db);

    const opportunity = getOpportunities(db, runner.id).find(
      (o) => o.opportunity_id === 'opp_dangling',
    )!;
    expect(opportunity.resolution).toBe('infrastructure_failure');
    expect(opportunity.failure_category).toBe('interrupted');
    // The agent was never given the chance to stay silent, so its silence here is not
    // behavioural data and must not be counted as availability.
    expect(opportunity.behaviourally_available).toBe(0);
  });

  it('preserves partial data and leaves already-resolved turns alone', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();
    const messagesBefore = db
      .prepare(`SELECT COUNT(*) AS c FROM messages WHERE run_id = ?`)
      .get(runner.id) as { c: number };
    const resolvedBefore = getOpportunities(db, runner.id).map((o) => [
      o.opportunity_id,
      o.resolution,
    ]);
    db.prepare(`UPDATE runs SET status = 'RUNNING' WHERE run_id = ?`).run(runner.id);

    reconcileInterruptedRuns(db);

    const messagesAfter = db
      .prepare(`SELECT COUNT(*) AS c FROM messages WHERE run_id = ?`)
      .get(runner.id) as { c: number };
    expect(messagesAfter.c).toBe(messagesBefore.c);
    expect(
      getOpportunities(db, runner.id).map((o) => [o.opportunity_id, o.resolution]),
    ).toEqual(resolvedBefore);
  });

  it('does nothing on a second startup, and never touches a terminal run', async () => {
    const db = tempDb();
    const completed = new WorkshopRunner({ db, frozen: frozen() });
    await completed.execute();
    const stale = new WorkshopRunner({ db, frozen: frozen() });
    db.prepare(`UPDATE runs SET status = 'RUNNING' WHERE run_id = ?`).run(stale.id);

    const first = reconcileInterruptedRuns(db);
    const second = reconcileInterruptedRuns(db);

    expect(first.interrupted).toHaveLength(1);
    expect(second.interrupted).toHaveLength(0);
    expect(getRun(db, completed.id)!.status).toBe('COMPLETED');
    expect(readEvents(db, stale.id).filter((e) => e.event_type === 'run_interrupted')).toHaveLength(
      1,
    );
  });
});
