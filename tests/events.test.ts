import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { readEvents } from '../src/events/recorder.js';
import { EVENT_TYPES } from '../src/events/types.js';
import { WORKSHOP_STATES } from '../src/config/schema.js';
import { evaluateGates, finalizeReport } from '../src/acceptance/gates.js';
import { exportRun } from '../src/export/exporter.js';
import { freezeConfig } from '../src/config/load.js';
import { getMessages, getRun } from '../src/db/queries.js';
import { frozen, tempDb, tempDir } from './helpers.js';

describe('event log', () => {
  it('assigns a contiguous, strictly increasing sequence', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const events = readEvents(db, runner.id);
    expect(events.length).toBeGreaterThan(0);
    expect(events.map((e) => e.sequence)).toEqual(
      Array.from({ length: events.length }, (_, i) => i + 1),
    );
  });

  it('stamps every event with the run, experiment, config hash and workshop state', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();
    const run = getRun(db, runner.id)!;

    for (const event of readEvents(db, runner.id)) {
      expect(event.run_id).toBe(run.run_id);
      expect(event.experiment_id).toBe(run.experiment_id);
      // The hash travels on every event, so a log line is interpretable on its own.
      expect(event.config_hash).toBe(run.config_hash);
      expect(WORKSHOP_STATES).toContain(event.workshop_state);
      expect(EVENT_TYPES).toContain(event.event_type);
    }
  });

  it('never runs the clock backwards', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const elapsed = readEvents(db, runner.id).map((e) => e.elapsed_ms);
    for (let i = 1; i < elapsed.length; i += 1) {
      expect(elapsed[i]!).toBeGreaterThanOrEqual(elapsed[i - 1]!);
    }
  });

  it('links a delivered message back to the event that produced it', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const events = readEvents(db, runner.id);
    const byId = new Map(events.map((e) => [e.event_id, e]));
    for (const message of getMessages(db, runner.id)) {
      expect(message.source_event_id).not.toBeNull();
      expect(byId.has(message.source_event_id!)).toBe(true);
    }
  });
});

describe('reproducibility is a property of conditions, not of text', () => {
  it('passes gate 3 even when the two runs said completely different things', async () => {
    const db = tempDb();
    const baseline = new WorkshopRunner({ db, frozen: frozen() });
    await baseline.execute();
    const row = getRun(db, baseline.id)!;
    const rerun = new WorkshopRunner({
      db,
      frozen: freezeConfig(JSON.parse(row.config_json), row.config_source_path),
      sourceRunId: baseline.id,
    });
    await rerun.execute();
    exportRun({ db, runId: baseline.id, outDir: tempDir() });

    // Model output is stochastic by design. Rewrite the rerun's text entirely: if the
    // gate depended on identical generations, this would break it.
    db.prepare(`UPDATE messages SET content = 'entirely different text' WHERE run_id = ?`).run(
      rerun.id,
    );

    const report = finalizeReport(
      evaluateGates({ db, runId: baseline.id, reproducibilityRunId: rerun.id }),
    );
    expect(report.gates.baseline_reproducible.status).toBe('PASS');
    expect(getRun(db, rerun.id)!.config_hash).toBe(row.config_hash);
  });
});
