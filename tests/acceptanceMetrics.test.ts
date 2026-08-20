import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { exportRun } from '../src/export/exporter.js';
import {
  computeMetrics,
  deriveDeliveries,
  statusFromMetrics,
  metricsForGate,
  REQUIRED_INJECTED_FAULTS,
  STRENGTHENS,
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
  it('computes the specification eighteen plus the four strengthened checks', async () => {
    const { db, runId } = await cleanRun();
    const metrics = computeMetrics({ db, runId });

    expect(metrics.map((m) => m.id)).toEqual([
      'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8',
      'M9', 'M10', 'M11', 'M12',
      'M13', 'M14', 'M15', 'M16', 'M17', 'M18',
      'M19', 'M20', 'M21', 'M22',
    ]);
    // The eighteen are exactly those that claim no parent metric; the four that do are
    // additions, and the distinction is checkable rather than a matter of comment.
    expect(metrics.filter((m) => !STRENGTHENS[m.id])).toHaveLength(18);

    expect(metricsForGate(metrics, 1).map((m) => m.id)).toEqual([
      'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M19', 'M21',
    ]);
    expect(metricsForGate(metrics, 2).map((m) => m.id)).toEqual(['M9', 'M10', 'M11', 'M12', 'M20', 'M22']);
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
  it('does not misclassify a tool fault as an unrecorded provider fault', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({
      db,
      frozen: frozen({
        capabilities: {
          tools_enabled: true,
          manifest: [{ id: 'echo', allowed_agents: ['agent_1'], result_scope: 'private', max_calls_per_opportunity: 1 }],
        },
        tool_probe: {
          enabled: true,
          probes: [{ agent_id: 'agent_1', state: 'INTRODUCTION', occurrence: 1, tool_id: 'echo', input: { value: 'fault' } }],
        },
        fault_injection: {
          enabled: true,
          faults: [{ agent_id: 'agent_1', state: 'INTRODUCTION', occurrence: 1, kind: 'tool_timeout', recover_after_attempts: null }],
        },
      }),
    });
    await runner.execute();

    const metric = measure(db, runner.id, 'M12');
    expect(metric.status).toBe('NOT_EXERCISED');
    expect(metric.observed).not.toContain('tool_timeout was injected but never recorded');
  });

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

/**
 * The two strengthened claims, checked directly rather than inferred from M4 and M11.
 *
 * Each is verified in both directions: that it holds on a real run, and that damaging
 * exactly the thing it protects makes it fail. Where a weaker metric already existed,
 * the test also shows what that weaker metric misses.
 */

describe('M19 authorized-context equality', () => {
  it('counts authorized summary source ids as context material', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({
      db,
      frozen: frozen({
        context_policy: {
          version: 'phase0_1', include_public_history: true, include_own_private: true, max_messages: 1,
          summarization: { enabled: true, version: 'rolling-v1', max_source_messages: 4, scopes: ['public'], fidelity_audit: true },
        },
      }),
    });
    await runner.execute();
    expect(measure(db, runner.id, 'M19').status).toBe('PASS');
  });

  it('holds on a real run, re-derived from the config rather than the router', async () => {
    const { db, runId } = await cleanRun();
    const metric = measure(db, runId, 'M19');
    expect(metric.status).toBe('PASS');
    expect(metric.observed).toContain('no omission and no surplus');
  });

  it('fails on an omission that a leak check cannot see', async () => {
    const { db, runId } = await cleanRun();

    // Find a context holding more than one message and quietly remove one. Nothing
    // unauthorised has been added, so no leak exists and nothing looks wrong.
    const target = db
      .prepare(
        `SELECT invocation_id, context_message_ids, context_public_ids, context_private_ids
         FROM invocations WHERE run_id = ? AND json_array_length(context_message_ids) > 1 LIMIT 1`,
      )
      .get(runId) as {
      invocation_id: string;
      context_message_ids: string;
      context_public_ids: string;
      context_private_ids: string;
    };

    const all = JSON.parse(target.context_message_ids) as string[];
    const dropped = all[0]!;
    const keep = (list: string) =>
      JSON.stringify((JSON.parse(list) as string[]).filter((id) => id !== dropped));

    db.prepare(
      `UPDATE invocations SET context_message_ids = ?, context_public_ids = ?,
       context_private_ids = ? WHERE invocation_id = ?`,
    ).run(
      JSON.stringify(all.filter((id) => id !== dropped)),
      keep(target.context_public_ids),
      keep(target.context_private_ids),
      target.invocation_id,
    );

    const equality = measure(db, runId, 'M19');
    expect(equality.status).toBe('FAIL');
    expect(equality.observed).toContain('was denied');

    // This is the gap the strengthening closes. The agent answered without something it
    // was entitled to, and the privacy metric is entirely satisfied.
    expect(measure(db, runId, 'M4').status).toBe('PASS');
  });

  it('fails on a surplus message the config never authorised', async () => {
    const { db, runId } = await cleanRun();

    const priv = db
      .prepare(
        `SELECT message_id FROM messages WHERE run_id = ? AND channel = 'private'
         AND breakout_group_id = 'breakout_a' LIMIT 1`,
      )
      .get(runId) as { message_id: string };

    // agent_5 is in breakout_b, so a breakout_a message is not its to see.
    const outsider = db
      .prepare(`SELECT invocation_id, context_message_ids, context_private_ids FROM invocations
                WHERE run_id = ? AND agent_id = 'agent_5' LIMIT 1`)
      .get(runId) as { invocation_id: string; context_message_ids: string; context_private_ids: string };

    const withExtra = (list: string) =>
      JSON.stringify([...(JSON.parse(list) as string[]), priv.message_id]);

    db.prepare(
      `UPDATE invocations SET context_message_ids = ?, context_private_ids = ? WHERE invocation_id = ?`,
    ).run(withExtra(outsider.context_message_ids), withExtra(outsider.context_private_ids), outsider.invocation_id);

    const equality = measure(db, runId, 'M19');
    expect(equality.status).toBe('FAIL');
    expect(equality.observed).toContain('not authorised');
  });

  it('does not consult the recipients the router recorded', async () => {
    const { db, runId } = await cleanRun();

    // Corrupting the router's own record of who received a private message must not
    // change the verdict: authority comes from the frozen config's group membership.
    db.prepare(
      `UPDATE messages SET actual_recipients = '["agent_5"]', intended_recipients = '["agent_5"]'
       WHERE run_id = ? AND channel = 'private'`,
    ).run(runId);

    expect(measure(db, runId, 'M19').status).toBe('PASS');
  });
});

describe('M20 retry action idempotency', () => {
  it('is unproven on a run where nothing was ever retried', async () => {
    const { db, runId } = await cleanRun();
    const metric = measure(db, runId, 'M20');
    expect(metric.status).toBe('NOT_EXERCISED');
    expect(metric.observed).toContain('never put under load');
  });

  it('passes on a run where turns were retried and still spoke once', async () => {
    const { db, runId } = await faultRun();
    const metric = measure(db, runId, 'M20');
    expect(metric.status).toBe('PASS');
    expect(metric.observed).toContain('at most one message');
  });

  it('fails when two attempts at one turn both produced a message', async () => {
    const { db, runId } = await faultRun();

    // A retry that repeats the parent's effect: the failed first attempt is made to
    // claim the message the successful second attempt produced.
    const pair = db
      .prepare(
        `SELECT a.invocation_id AS failed, b.output_message_id AS msg
         FROM invocations a JOIN invocations b ON a.opportunity_id = b.opportunity_id
         WHERE a.run_id = ? AND a.attempt < b.attempt AND b.output_message_id IS NOT NULL LIMIT 1`,
      )
      .get(runId) as { failed: string; msg: string };

    db.prepare(`UPDATE invocations SET output_message_id = ? WHERE invocation_id = ?`).run(
      pair.msg,
      pair.failed,
    );

    const metric = measure(db, runId, 'M20');
    expect(metric.status).toBe('FAIL');
    expect(metric.observed).toContain('each produced a message');
  });

  it('fails when one turn is credited with two messages', async () => {
    const { db, runId } = await faultRun();
    const source = db
      .prepare(`SELECT source_invocation_id FROM messages WHERE run_id = ?
                AND source_invocation_id IS NOT NULL LIMIT 1`)
      .get(runId) as { source_invocation_id: string };

    db.prepare(
      `UPDATE messages SET source_invocation_id = ? WHERE message_id = (
         SELECT message_id FROM messages WHERE run_id = ? AND source_invocation_id != ? LIMIT 1)`,
    ).run(source.source_invocation_id, runId, source.source_invocation_id);

    const metric = measure(db, runId, 'M20');
    expect(metric.status).toBe('FAIL');
    expect(metric.observed).toContain('messages attributed to one turn');
  });
});

describe('M21 delivery uniqueness', () => {
  it('fails when the same message is delivered to the same agent twice', async () => {
    const { db, runId } = await cleanRun();
    expect(measure(db, runId, 'M21').status).toBe('PASS');

    const original = db
      .prepare(`SELECT * FROM events WHERE run_id = ? AND event_type = 'message_delivered' LIMIT 1`)
      .get(runId) as Record<string, unknown>;
    const next = db.prepare(`SELECT MAX(sequence) AS s FROM events WHERE run_id = ?`).get(runId) as {
      s: number;
    };

    db.prepare(
      `INSERT INTO events (event_id, run_id, experiment_id, config_hash, sequence, timestamp,
        elapsed_ms, event_type, workshop_state, agent_id, channel, parent_event_id,
        causal_event_ids, payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'evt_duplicate_delivery',
      runId,
      original['experiment_id'],
      original['config_hash'],
      next.s + 1,
      original['timestamp'],
      original['elapsed_ms'],
      'message_delivered',
      original['workshop_state'],
      original['agent_id'],
      original['channel'],
      original['parent_event_id'],
      original['causal_event_ids'],
      original['payload'],
    );

    const metric = measure(db, runId, 'M21');
    expect(metric.status).toBe('FAIL');
    expect(metric.observed).toContain('delivered more than once');
  });
});

describe('M22 budget accounting under retry', () => {
  it('is unproven when no attempt ever failed', async () => {
    const { db, runId } = await cleanRun();
    const metric = measure(db, runId, 'M22');
    expect(metric.status).toBe('NOT_EXERCISED');
    expect(metric.observed).toContain('never put under load');
  });

  it('confirms a failed attempt costs the same as a successful one', async () => {
    const { db, runId } = await faultRun();
    const metric = measure(db, runId, 'M22');
    expect(metric.status).toBe('PASS');
    expect(metric.observed).toContain('retried attempts');

    // Stated independently of the metric: every attempt on record advanced the ledger,
    // so the number of attempts an agent made equals the calls it was charged for.
    const rows = db
      .prepare(
        `SELECT agent_id, COUNT(*) AS attempts, MAX(budget_calls_used_before) AS last_watermark
         FROM invocations WHERE run_id = ? GROUP BY agent_id`,
      )
      .all(runId) as Array<{ agent_id: string; attempts: number; last_watermark: number }>;
    for (const row of rows) expect(row.last_watermark).toBe(row.attempts - 1);
  });

  it('fails when a retry was not charged', async () => {
    const { db, runId } = await faultRun();

    // Make one retry free: it reuses the watermark its parent attempt was charged at.
    const retry = db
      .prepare(
        `SELECT invocation_id, budget_calls_used_before FROM invocations
         WHERE run_id = ? AND attempt > 1 ORDER BY sequence LIMIT 1`,
      )
      .get(runId) as { invocation_id: string; budget_calls_used_before: number };

    db.prepare(`UPDATE invocations SET budget_calls_used_before = ? WHERE invocation_id = ?`).run(
      retry.budget_calls_used_before - 1,
      retry.invocation_id,
    );

    const metric = measure(db, runId, 'M22');
    expect(metric.status).toBe('FAIL');
    expect(metric.observed).toContain('prior calls, expected');
  });

  it('fails when an attempt is charged twice', async () => {
    const { db, runId } = await faultRun();
    const row = db
      .prepare(`SELECT invocation_id, budget_calls_used_before FROM invocations
                WHERE run_id = ? ORDER BY sequence DESC LIMIT 1`)
      .get(runId) as { invocation_id: string; budget_calls_used_before: number };

    db.prepare(`UPDATE invocations SET budget_calls_used_before = ? WHERE invocation_id = ?`).run(
      row.budget_calls_used_before + 1,
      row.invocation_id,
    );

    expect(measure(db, runId, 'M22').status).toBe('FAIL');
  });

  it('fails when the token watermark does not match what earlier attempts used', async () => {
    const { db, runId } = await faultRun();
    const row = db
      .prepare(`SELECT invocation_id FROM invocations WHERE run_id = ? ORDER BY sequence DESC LIMIT 1`)
      .get(runId) as { invocation_id: string };

    db.prepare(`UPDATE invocations SET budget_tokens_used_before = 999999 WHERE invocation_id = ?`)
      .run(row.invocation_id);

    const metric = measure(db, runId, 'M22');
    expect(metric.status).toBe('FAIL');
    expect(metric.observed).toContain('prior tokens, expected');
  });
});

describe('the strengthened metrics are accounted for', () => {
  it('records which of the eighteen each one strengthens', () => {
    for (const id of ['M19', 'M20', 'M21', 'M22'] as const) {
      expect(STRENGTHENS[id]).toBeTruthy();
    }
    // The original eighteen stand on the specification alone and claim no parent.
    expect(STRENGTHENS['M4']).toBeUndefined();
  });
});
