import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { buildValidationSet } from '../src/acceptance/validationSet.js';
import { reconcileInterruptedRuns } from '../src/orchestrator/reconcile.js';
import { exportRun } from '../src/export/exporter.js';
import { freezeConfig } from '../src/config/load.js';
import { getRun } from '../src/db/queries.js';
import { validationPage } from '../src/server/validation.js';
import { computeAnalytics } from '../src/analytics/summary.js';
import { runConfig } from '../src/db/queries.js';
import { baseConfigObject, frozen, tempDb, tempDir } from './helpers.js';

const withFaults = () =>
  frozen({
    fault_injection: {
      enabled: true,
      faults: [
        {
          agent_id: 'agent_2',
          state: 'PUBLIC_DISCUSSION',
          occurrence: 1,
          kind: 'timeout',
          recover_after_attempts: 1,
        },
      ],
    },
  });

describe('Phase 0 validation set', () => {
  it('names a different run behind each gate', async () => {
    const db = tempDb();
    const baseline = new WorkshopRunner({ db, frozen: frozen() });
    await baseline.execute();
    exportRun({ db, runId: baseline.id, outDir: tempDir() });

    const row = getRun(db, baseline.id)!;
    const rerun = new WorkshopRunner({
      db,
      frozen: freezeConfig(JSON.parse(row.config_json), row.config_source_path),
      sourceRunId: baseline.id,
    });
    await rerun.execute();

    const fault = new WorkshopRunner({ db, frozen: withFaults() });
    await fault.execute();

    const set = buildValidationSet({ db, runId: baseline.id });

    expect(set.phase0_validated).toBe(true);
    expect(set.gates.map((g) => [g.key, g.status])).toEqual([
      ['infrastructure_validated', 'PASS'],
      ['failure_attribution_validated', 'PASS'],
      ['baseline_reproducible', 'PASS'],
    ]);
    const roles = Object.fromEntries(set.runs.map((r) => [r.role, r.run_id]));
    expect(roles['infrastructure']).toBe(baseline.id);
    expect(roles['reproducibility']).toBe(rerun.id);
    expect(roles['failure_attribution']).toBe(fault.id);
  });

  it('keeps the run-level result separate from what the run proves', async () => {
    const db = tempDb();
    const baseline = new WorkshopRunner({ db, frozen: frozen() });
    await baseline.execute();
    const fault = new WorkshopRunner({ db, frozen: withFaults() });
    await fault.execute();

    const set = buildValidationSet({ db, runId: baseline.id });
    const evidence = set.runs.find((r) => r.role === 'failure_attribution')!;

    // A run full of injected failures completed successfully. Those are two different
    // statements and the package must not collapse them into one.
    expect(evidence.run_level_result.status).toBe('COMPLETED');
    expect(evidence.note).toContain('failure');
  });

  it('reports NOT_EXERCISED and refuses to validate when nothing ever failed', async () => {
    const db = tempDb();
    const baseline = new WorkshopRunner({ db, frozen: frozen() });
    await baseline.execute();
    exportRun({ db, runId: baseline.id, outDir: tempDir() });

    const set = buildValidationSet({ db, runId: baseline.id });
    const gate = set.gates.find((g) => g.key === 'failure_attribution_validated')!;

    expect(gate.status).toBe('NOT_EXERCISED');
    expect(gate.failures).toEqual([]);
    expect(set.phase0_validated).toBe(false);
    expect(set.outstanding.join(' ')).toContain('Failure attribution');
  });

  it('does not accept an interrupted run as failure-attribution evidence', async () => {
    const db = tempDb();
    const baseline = new WorkshopRunner({ db, frozen: frozen() });
    await baseline.execute();
    exportRun({ db, runId: baseline.id, outDir: tempDir() });

    // An interrupted run carries an infrastructure failure category, but being killed
    // by a restart demonstrates nothing about telling failure apart from behaviour.
    const stale = new WorkshopRunner({ db, frozen: frozen() });
    db.prepare(`UPDATE runs SET status = 'RUNNING' WHERE run_id = ?`).run(stale.id);
    reconcileInterruptedRuns(db);

    const set = buildValidationSet({ db, runId: baseline.id });
    expect(set.gates.find((g) => g.key === 'failure_attribution_validated')!.status).toBe(
      'NOT_EXERCISED',
    );
    expect(set.runs.some((r) => r.run_id === stale.id)).toBe(false);
  });

  it('does not treat an unrelated run as a rerun of this config', async () => {
    const db = tempDb();
    const baseline = new WorkshopRunner({ db, frozen: frozen() });
    await baseline.execute();
    const other = new WorkshopRunner({
      db,
      frozen: freezeConfig(baseConfigObject({ experiment_id: 'agora_other' })),
    });
    await other.execute();

    const set = buildValidationSet({ db, runId: baseline.id });
    expect(set.runs.some((r) => r.run_id === other.id)).toBe(false);
    expect(set.gates.find((g) => g.key === 'baseline_reproducible')!.status).toBe('FAIL');
  });
});

describe('validation package view', () => {
  it('renders every gate verdict with its evidence and leaves no template placeholders', async () => {
    const db = tempDb();
    const baseline = new WorkshopRunner({ db, frozen: frozen() });
    await baseline.execute();
    exportRun({ db, runId: baseline.id, outDir: tempDir() });
    const run = getRun(db, baseline.id)!;

    const html = validationPage({
      set: buildValidationSet({ db, runId: baseline.id }),
      run,
      config: runConfig(run),
      analytics: computeAnalytics(db, baseline.id),
      comparableRunIds: [],
      sampleInvocationId: null,
      exportedFiles: 16,
    });

    expect(html).toContain('NOT EXERCISED');
    expect(html).toContain('NOT YET VALIDATED');
    expect(html).toContain('Show the evidence');
    expect(html).toContain(run.config_hash);
    // A rendered page must never leak an unsubstituted template expression.
    expect(html).not.toContain('${');
    // No scientific overclaim on a page a reviewer will read as a verdict.
    expect(html).toContain('Nothing on this page supports a claim');
  });
});
