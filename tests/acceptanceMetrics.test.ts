import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { exportRun } from '../src/export/exporter.js';
import {
  computeMetrics,
  deriveDeliveries,
  statusFromMetrics,
  metricsForGate,
  REQUIRED_INJECTED_FAULTS,
  type MetricId,
  type MetricResult,
} from '../src/acceptance/metrics.js';
import { evaluateGates, finalizeReport } from '../src/acceptance/gates.js';
import type { Db } from '../src/db/index.js';
import { frozen, tempDb, tempDir } from './helpers.js';

/**
 * Every hard metric is tested twice: once on a run that satisfies it, and once on the
 * same run after a single stored record has been damaged. The second half is the half
 * that matters. A check that cannot be made to fail is not evidence that anything holds,
 * and several of these metrics replaced prose that had exactly that problem.
 */

const faults = () =>
  frozen({
    fault_injection: {
      enabled: true,
      faults: [
        { agent_id: 'agent_2', state: 'PUBLIC_DISCUSSION', occurrence: 1, kind: 'timeout', recover_after_attempts: 1 },
        // Never recovers, so one opportunity ends in retry exhaustion. Without a turn
        // that actually failed for good, the separation metrics would have nothing to
        // judge and would pass vacuously.
        { agent_id: 'agent_3', state: 'PUBLIC_DISCUSSION', occurrence: 1, kind: 'provider_error', recover_after_attempts: null },
        { agent_id: 'agent_4', state: 'FINAL_DISCUSSION', occurrence: 1, kind: 'malformed_response', recover_after_attempts: 1 },
      ],
    },
  });

async function cleanRun(): Promise<{ db: Db; runId: string }> {
  const db = tempDb();
  const runner = new WorkshopRunner({ db, frozen: frozen() });
  await runner.execute();
  exportRun({ db, runId: runner.id, outDir: tempDir() });
  return { db, runId: runner.id };
}

async function faultRun(): Promise<{ db: Db; runId: string }> {
  const db = tempDb();
  const runner = new WorkshopRunner({ db, frozen: faults() });
  await runner.execute();
  exportRun({ db, runId: runner.id, outDir: tempDir() });
  return { db, runId: runner.id };
}

function find(metrics: MetricResult[], id: MetricId): MetricResult {
  const found = metrics.find((m) => m.id === id);
  if (!found) throw new Error(`metric ${id} was not computed`);
  return found;
}

/** Reads one metric off a run, with the run standing as its own failure evidence. */
function measure(db: Db, runId: string, id: MetricId): MetricResult {
  return find(computeMetrics({ db, runId, failureEvidenceRunId: runId }), id);
}

describe('acceptance metrics: shape', () => {
  it('computes all eighteen, each assigned to the gate the specification puts it in', async () => {
    const { db, runId } = await cleanRun();
    const metrics = computeMetrics({ db, runId });

    expect(metrics.map((m) => m.id)).toEqual([
      'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8',
      'M9', 'M10', 'M11', 'M12',
      'M13', 'M14', 'M15', 'M16', 'M17', 'M18',
    ]);
    expect(metricsForGate(metrics, 1).map((m) => m.id)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8']);
    expect(metricsForGate(metrics, 2).map((m) => m.id)).toEqual(['M9', 'M10', 'M11', 'M12']);
    expect(metricsForGate(metrics, 3).map((m) => m.id)).toEqual(['M13', 'M14', 'M15', 'M16', 'M17', 'M18']);

    // Every metric states the threshold it was measured against, so a reader never has
    // to infer what "PASS" was measured against.
    for (const metric of metrics) {
      expect(metric.threshold.length).toBeGreaterThan(0);
      expect(metric.observed.length).toBeGreaterThan(0);
    }
  });

  it('never reports PASS for a condition that never arose', async () => {
    const { db, runId } = await cleanRun();
    const metrics = computeMetrics({ db, runId });

    // Nothing failed and nothing was retried in a clean run, so these are unproven
    // rather than passed. This is the distinction the whole report rests on.
    expect(find(metrics, 'M9').status).toBe('NOT_EXERCISED');
    expect(find(metrics, 'M11').status).toBe('NOT_EXERCISED');
    expect(find(metrics, 'M12').status).toBe('NOT_EXERCISED');
  });

  it('passes every gate-1 and gate-3 metric on an ordinary completed run', async () => {
    const { db, runId } = await cleanRun();
    const metrics = computeMetrics({ db, runId });
    const exercised = metrics.filter((m) => m.gate !== 2 && m.id !== 'M18');
    for (const metric of exercised) {
      expect(`${metric.id} ${metric.status}: ${metric.observed}`).toBe(`${metric.id} PASS: ${metric.observed}`);
    }
  });
});

describe('M1 response opportunity coverage', () => {
  it('fails when an opportunity was left without a terminal outcome', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M1').status).toBe('PASS');

    db.prepare(
      `UPDATE opportunities SET resolution = NULL, resolved_at = NULL
       WHERE opportunity_id = (SELECT opportunity_id FROM opportunities WHERE run_id = ? LIMIT 1)`,
    ).run(runId);

    const after = measure(db, runId, 'M1');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('no terminal outcome');
  });

  it('fails when a turn ended in infrastructure failure with no category naming it', async () => {
    const { db, runId } = await cleanRun();
    db.prepare(
      `UPDATE opportunities SET resolution = 'infrastructure_failure', failure_category = NULL
       WHERE opportunity_id = (SELECT opportunity_id FROM opportunities WHERE run_id = ? LIMIT 1)`,
    ).run(runId);

    expect(measure(db, runId, 'M1').status).toBe('FAIL');
  });
});

describe('M2 event sequence integrity', () => {
  it('fails when the sequence is no longer contiguous', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M2').status).toBe('PASS');

    db.prepare(`DELETE FROM events WHERE run_id = ? AND sequence = 5`).run(runId);

    expect(measure(db, runId, 'M2').status).toBe('FAIL');
  });

  it('fails when a message can no longer be joined to its source event', async () => {
    const { db, runId } = await cleanRun();
    db.prepare(
      `UPDATE messages SET source_event_id = 'evt_does_not_exist'
       WHERE message_id = (SELECT message_id FROM messages WHERE run_id = ? LIMIT 1)`,
    ).run(runId);

    const after = measure(db, runId, 'M2');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('source event');
  });
});

describe('M3 public routing integrity', () => {
  it('re-derives the recipient set rather than trusting the router', async () => {
    const { db, runId } = await cleanRun();
    const before = measure(db, runId, 'M3');
    expect(before.status).toBe('PASS');
    expect(before.observed).toContain('re-derived');
  });

  it('fails when a public message reached fewer agents than the config requires', async () => {
    const { db, runId } = await cleanRun();
    const target = db
      .prepare(`SELECT message_id FROM messages WHERE run_id = ? AND channel = 'public' LIMIT 1`)
      .get(runId) as { message_id: string };

    // Drop one delivery. `actual_recipients` on the message is deliberately left intact,
    // so a metric that read it back instead of re-deriving would still report success.
    db.prepare(
      `DELETE FROM events WHERE run_id = ? AND event_type = 'message_delivered'
       AND json_extract(payload, '$.message_id') = ? LIMIT 1`,
    ).run(runId, target.message_id);

    const after = measure(db, runId, 'M3');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('differs from the one the config requires');
  });
});

describe('M4 private-channel isolation', () => {
  it('fails when a private message was delivered to an agent outside the breakout group', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M4').status).toBe('PASS');

    const delivery = db
      .prepare(
        `SELECT event_id FROM events WHERE run_id = ? AND event_type = 'private_message_delivered' LIMIT 1`,
      )
      .get(runId) as { event_id: string };

    // agent_1 is in breakout_a; re-point one breakout_b delivery at it.
    db.prepare(`UPDATE events SET agent_id = 'agent_1' WHERE event_id = ?`).run(delivery.event_id);

    const after = measure(db, runId, 'M4');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('unauthorised exposures');
  });

  it('fails when a private message reached an unauthorised context', async () => {
    const { db, runId } = await cleanRun();
    const privateMessage = db
      .prepare(`SELECT message_id, sender_agent_id FROM messages WHERE run_id = ? AND channel = 'private' LIMIT 1`)
      .get(runId) as { message_id: string; sender_agent_id: string };

    const outsider = db
      .prepare(
        `SELECT invocation_id FROM invocations WHERE run_id = ? AND agent_id NOT IN ('agent_1','agent_2') LIMIT 1`,
      )
      .get(runId) as { invocation_id: string } | undefined;
    if (!outsider) return;

    db.prepare(`UPDATE invocations SET context_message_ids = ? WHERE invocation_id = ?`).run(
      JSON.stringify([privateMessage.message_id]),
      outsider.invocation_id,
    );

    expect(measure(db, runId, 'M4').status).toBe('FAIL');
  });
});

describe('M5 state-machine integrity', () => {
  it('fails when a transition did not complete', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M5').status).toBe('PASS');

    db.prepare(
      `UPDATE state_transitions SET status = 'rejected'
       WHERE id = (SELECT id FROM state_transitions WHERE run_id = ? LIMIT 1)`,
    ).run(runId);

    expect(measure(db, runId, 'M5').status).toBe('FAIL');
  });

  it('fails when a state was skipped, leaving a break in the chain', async () => {
    const { db, runId } = await cleanRun();
    const second = db
      .prepare(`SELECT id FROM state_transitions WHERE run_id = ? ORDER BY sequence LIMIT 1 OFFSET 1`)
      .get(runId) as { id: number };
    db.prepare(`DELETE FROM state_transitions WHERE id = ?`).run(second.id);

    const after = measure(db, runId, 'M5');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('without a transition');
  });
});

describe('M6 bounded execution', () => {
  it('fails a run that never recorded reaching a terminal state', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M6').status).toBe('PASS');

    db.prepare(`UPDATE runs SET status = 'RUNNING' WHERE run_id = ?`).run(runId);

    const after = measure(db, runId, 'M6');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('no terminal state');
  });
});

describe('M7 persistence integrity', () => {
  it('fails when a required object is absent from the record', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M7').status).toBe('PASS');

    db.prepare(`DELETE FROM messages WHERE run_id = ?`).run(runId);

    const after = measure(db, runId, 'M7');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('messages');
  });

  it('accepts provenance that is genuinely unavailable, and rejects a revision with no source', async () => {
    const { db, runId } = await cleanRun();

    db.prepare(`UPDATE runs SET code_commit_sha = NULL, commit_source = NULL WHERE run_id = ?`).run(runId);
    expect(measure(db, runId, 'M7').status).toBe('PASS');

    db.prepare(`UPDATE runs SET code_commit_sha = 'deadbeef', commit_source = NULL WHERE run_id = ?`).run(runId);
    expect(measure(db, runId, 'M7').status).toBe('FAIL');
  });
});

describe('M8 export integrity', () => {
  it('fails when the bundle is missing a required artifact', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M8').status).toBe('PASS');

    db.prepare(`DELETE FROM artifacts WHERE run_id = ? AND name = 'acceptance_report.json'`).run(runId);

    const after = measure(db, runId, 'M8');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('acceptance_report.json');
  });

  it('fails a run that was never exported at all', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    expect(measure(db, runner.id, 'M8').status).toBe('FAIL');
  });
});

describe('M9 failure classification coverage', () => {
  it('passes on a fault run where every failure carries a class', async () => {
    const { db, runId } = await faultRun();
    expect(measure(db, runId, 'M9').status).toBe('PASS');
  });

  it('fails when an unsuccessful invocation carries no explicit class', async () => {
    const { db, runId } = await faultRun();
    db.prepare(
      `UPDATE invocations SET failure_category = 'unknown'
       WHERE invocation_id = (SELECT invocation_id FROM invocations WHERE run_id = ? AND outcome = 'infra_failure' LIMIT 1)`,
    ).run(runId);

    const after = measure(db, runId, 'M9');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('no explicit failure class');
  });
});

describe('M10 behavioural/infrastructure separation', () => {
  it('fails when an infrastructure failure is recorded as an agent abstaining', async () => {
    const { db, runId } = await faultRun();
    expect(measure(db, runId, 'M10').status).toBe('PASS');

    db.prepare(
      `UPDATE opportunities SET resolution = 'explicit_abstention'
       WHERE opportunity_id = (
         SELECT opportunity_id FROM opportunities
         WHERE run_id = ? AND failure_category IS NOT NULL LIMIT 1)`,
    ).run(runId);

    const after = measure(db, runId, 'M10');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('as agent behaviour');
  });

  it('fails when a failed turn is counted as behaviourally available', async () => {
    const { db, runId } = await faultRun();
    db.prepare(
      `UPDATE opportunities SET behaviourally_available = 1
       WHERE resolution = 'infrastructure_failure' AND run_id = ?`,
    ).run(runId);

    expect(measure(db, runId, 'M10').status).toBe('FAIL');
  });
});

describe('M11 retry traceability', () => {
  it('passes when every retry names the attempt it followed', async () => {
    const { db, runId } = await faultRun();
    const metric = measure(db, runId, 'M11');
    expect(metric.status).toBe('PASS');
    expect(metric.observed).toContain('parent attempt');
  });

  it('fails when a retry has no parent attempt on record', async () => {
    const { db, runId } = await faultRun();
    db.prepare(
      `DELETE FROM invocations WHERE invocation_id = (
         SELECT i.invocation_id FROM invocations i
         WHERE i.run_id = ? AND i.attempt = 1
           AND EXISTS (SELECT 1 FROM invocations r WHERE r.opportunity_id = i.opportunity_id AND r.attempt = 2)
         LIMIT 1)`,
    ).run(runId);

    const after = measure(db, runId, 'M11');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('cannot be traced');
  });
});

describe('M12 controlled failure validation', () => {
  it('passes when every injected fault was classified as the condition injected', async () => {
    const { db, runId } = await faultRun();
    expect(measure(db, runId, 'M12').status).toBe('PASS');
  });

  it('reports an undemonstrated failure mode as unproven, not as a failure', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({
      db,
      frozen: frozen({
        fault_injection: {
          enabled: true,
          faults: [
            { agent_id: 'agent_2', state: 'PUBLIC_DISCUSSION', occurrence: 1, kind: 'timeout', recover_after_attempts: 1 },
          ],
        },
      }),
    });
    await runner.execute();

    const metric = measure(db, runner.id, 'M12');
    // Nothing was measured wrongly here — two required modes were simply never put
    // under test, which is missing evidence rather than a defect.
    expect(metric.status).toBe('NOT_EXERCISED');
    expect(metric.observed).toContain('provider_error');
    expect(metric.observed).toContain('malformed_response');
  });

  it('fails when an injected fault was recorded as something else', async () => {
    const { db, runId } = await faultRun();
    db.prepare(
      `UPDATE invocations SET failure_category = 'rate_limit'
       WHERE run_id = ? AND failure_category = 'timeout'`,
    ).run(runId);

    const after = measure(db, runId, 'M12');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('timeout was injected');
  });

  it('requires exactly the three failure modes the specification names', () => {
    expect([...REQUIRED_INJECTED_FAULTS]).toEqual(['timeout', 'provider_error', 'malformed_response']);
  });
});

describe('M13 immutable configuration snapshot', () => {
  it('fails when a required field is absent from the frozen snapshot', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M13').status).toBe('PASS');

    const row = db.prepare(`SELECT config_json FROM runs WHERE run_id = ?`).get(runId) as {
      config_json: string;
    };
    const config = JSON.parse(row.config_json) as Record<string, unknown>;
    delete (config['prompts'] as Record<string, unknown>)['participant_prompt_version'];
    db.prepare(`UPDATE runs SET config_json = ? WHERE run_id = ?`).run(JSON.stringify(config), runId);

    const after = measure(db, runId, 'M13');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('prompt versions');
  });
});

describe('M14 deterministic configuration fingerprint', () => {
  it('fails when the stored fingerprint no longer describes the stored config', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M14').status).toBe('PASS');

    const row = db.prepare(`SELECT config_json FROM runs WHERE run_id = ?`).get(runId) as {
      config_json: string;
    };
    const config = JSON.parse(row.config_json) as Record<string, unknown>;
    (config['model'] as Record<string, unknown>)['max_output_tokens'] = 999;
    db.prepare(`UPDATE runs SET config_json = ? WHERE run_id = ?`).run(JSON.stringify(config), runId);

    const after = measure(db, runId, 'M14');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('does not match');
  });
});

describe('M15 code/deployment provenance', () => {
  it('treats an unavailable value as recorded, and an unaccountable one as a defect', async () => {
    const { db, runId } = await cleanRun();

    db.prepare(`UPDATE runs SET code_commit_sha = NULL, commit_source = NULL, app_version = NULL WHERE run_id = ?`).run(runId);
    const absent = measure(db, runId, 'M15');
    expect(absent.status).toBe('PASS');
    expect(absent.observed).toContain('unavailable');

    db.prepare(`UPDATE runs SET code_commit_sha = 'abc123' WHERE run_id = ?`).run(runId);
    const unaccountable = measure(db, runId, 'M15');
    expect(unaccountable.status).toBe('FAIL');
    expect(unaccountable.observed).toContain('no source');
  });
});

describe('M16 invocation provenance completeness', () => {
  it('fails when an invocation cannot say what context it was given', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M16').status).toBe('PASS');

    db.prepare(
      `UPDATE invocations SET rendered_messages = ''
       WHERE invocation_id = (SELECT invocation_id FROM invocations WHERE run_id = ? LIMIT 1)`,
    ).run(runId);

    const after = measure(db, runId, 'M16');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('rendered context');
  });
});

describe('M17 context integrity', () => {
  it('fails when context ids are not partitioned by channel', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M17').status).toBe('PASS');

    const invocation = db
      .prepare(`SELECT invocation_id, context_message_ids FROM invocations WHERE run_id = ? AND context_message_ids != '[]' LIMIT 1`)
      .get(runId) as { invocation_id: string; context_message_ids: string };

    db.prepare(`UPDATE invocations SET context_public_ids = '[]', context_private_ids = '[]' WHERE invocation_id = ?`)
      .run(invocation.invocation_id);

    const after = measure(db, runId, 'M17');
    expect(after.status).toBe('FAIL');
    expect(after.observed).toContain('not partitioned');
  });

  it('fails when context references a message that is no longer stored', async () => {
    const { db, runId } = await cleanRun();
    const invocation = db
      .prepare(`SELECT invocation_id FROM invocations WHERE run_id = ? AND context_message_ids != '[]' LIMIT 1`)
      .get(runId) as { invocation_id: string };

    db.prepare(
      `UPDATE invocations SET context_message_ids = '["msg_missing"]', context_public_ids = '["msg_missing"]',
       context_private_ids = '[]' WHERE invocation_id = ?`,
    ).run(invocation.invocation_id);

    expect(measure(db, runId, 'M17').status).toBe('FAIL');
  });
});

describe('M18 repeated-run evidence', () => {
  it('fails on a single run and passes once a second run of the same config exists', async () => {
    const db = tempDb();
    const config = frozen();
    const first = new WorkshopRunner({ db, frozen: config });
    await first.execute();

    expect(find(computeMetrics({ db, runId: first.id }), 'M18').status).toBe('FAIL');

    const second = new WorkshopRunner({ db, frozen: config, sourceRunId: first.id });
    await second.execute();

    expect(find(computeMetrics({ db, runId: first.id }), 'M18').status).toBe('PASS');
  });

  it('fails when the nominated rerun was run under different conditions', async () => {
    const db = tempDb();
    const first = new WorkshopRunner({ db, frozen: frozen() });
    await first.execute();
    const other = new WorkshopRunner({ db, frozen: frozen({ config_version: 2 }) });
    await other.execute();

    const metric = find(
      computeMetrics({ db, runId: first.id, reproducibilityRunId: other.id }),
      'M18',
    );
    expect(metric.status).toBe('FAIL');
    expect(metric.observed).toContain('different config fingerprint');
  });
});

describe('deliveries as a first-class record', () => {
  it('reconstructs one delivery per recipient, carrying every contract field', async () => {
    const { db, runId } = await cleanRun();
    const deliveries = deriveDeliveries(db, runId);

    expect(deliveries.length).toBeGreaterThan(0);
    for (const delivery of deliveries) {
      expect(delivery.delivery_id).toBeTruthy();
      expect(delivery.run_id).toBe(runId);
      expect(delivery.message_id).toBeTruthy();
      expect(delivery.recipient_agent_id).toBeTruthy();
      expect(delivery.sender_agent_id).toBeTruthy();
      expect(['public', 'private']).toContain(delivery.channel);
      expect(delivery.delivered_at).toBeTruthy();
    }

    // A delivery is a separate record from the message, so one message yields many.
    const perMessage = new Map<string, number>();
    for (const d of deliveries) perMessage.set(d.message_id, (perMessage.get(d.message_id) ?? 0) + 1);
    expect(Math.max(...perMessage.values())).toBeGreaterThan(1);

    // Sender and recipient are never the same agent: nobody is delivered their own message.
    expect(deliveries.filter((d) => d.sender_agent_id === d.recipient_agent_id)).toEqual([]);
  });
});

describe('metrics compose into gates without ever loosening them', () => {
  it('fails the gate whenever one of its metrics fails', async () => {
    const { db, runId } = await cleanRun();
    db.prepare(
      `UPDATE opportunities SET resolution = NULL, resolved_at = NULL
       WHERE opportunity_id = (SELECT opportunity_id FROM opportunities WHERE run_id = ? LIMIT 1)`,
    ).run(runId);

    const report = finalizeReport(evaluateGates({ db, runId }));
    const gate = report.gates.infrastructure_validated;

    expect(find(gate.metrics, 'M1').status).toBe('FAIL');
    expect(gate.status).toBe('FAIL');
    expect(gate.failures.some((f) => f.startsWith('M1 '))).toBe(true);
    expect(report.ready_for_controlled_behavioral_experiment).toBe(false);
  });

  it('carries its metrics on every gate, and never contradicts them', async () => {
    const { db, runId } = await faultRun();
    const report = finalizeReport(
      evaluateGates({ db, runId, failureEvidenceRunId: runId }),
    );

    for (const gate of Object.values(report.gates)) {
      expect(gate.metrics.length).toBeGreaterThan(0);
      // A gate may be worse than its metrics, because prose checks can fail too. It may
      // never be better than them.
      if (gate.metrics.some((m) => m.status === 'FAIL')) expect(gate.status).toBe('FAIL');
      if (gate.status === 'PASS') expect(statusFromMetrics(gate.metrics)).toBe('PASS');
    }
  });

  it('judges gate 2 on the run that actually recorded failures', async () => {
    const db = tempDb();
    const baseline = new WorkshopRunner({ db, frozen: frozen() });
    await baseline.execute();
    exportRun({ db, runId: baseline.id, outDir: tempDir() });

    const fault = new WorkshopRunner({ db, frozen: faults() });
    await fault.execute();

    // Asked about the baseline alone, gate 2 is unproven: nothing failed there.
    const alone = finalizeReport(evaluateGates({ db, runId: baseline.id, failureEvidenceRunId: null }));
    expect(alone.gates.failure_attribution_validated.status).toBe('NOT_EXERCISED');

    // Given the fault run as evidence, the same metrics are answered by it.
    const withEvidence = finalizeReport(
      evaluateGates({ db, runId: baseline.id, failureEvidenceRunId: fault.id }),
    );
    const gate = withEvidence.gates.failure_attribution_validated;
    expect(find(gate.metrics, 'M9').status).toBe('PASS');
    expect(find(gate.metrics, 'M11').status).toBe('PASS');
    expect(find(gate.metrics, 'M12').status).toBe('PASS');
  });
});
