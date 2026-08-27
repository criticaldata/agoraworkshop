import { describe, expect, it } from 'vitest';
import { evaluatePhase01 } from '../src/acceptance/phase01.js';
import { evaluateGates, finalizeReport } from '../src/acceptance/gates.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { MockProvider } from '../src/providers/mock.js';
import { frozen, tempDb } from './helpers.js';

function metric(db: ReturnType<typeof tempDb>, runId: string, id: string) {
  return evaluatePhase01(db, runId).find((item) => item.id === id)!;
}

describe('Phase 0.1 acceptance metrics', () => {
  it('does not pass trace completeness on an empty run', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();
    db.prepare(`DELETE FROM invocations WHERE run_id = ?`).run(runner.id);
    db.prepare(`DELETE FROM opportunities WHERE run_id = ?`).run(runner.id);

    expect(metric(db, runner.id, 'M25').status).toBe('NOT_EXERCISED');
  });

  it('fails trace completeness when opportunities have no downstream records', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();
    db.prepare(`DELETE FROM invocations WHERE run_id = ?`).run(runner.id);
    db.prepare(`DELETE FROM messages WHERE run_id = ?`).run(runner.id);

    expect(metric(db, runner.id, 'M25').status).toBe('FAIL');
  });

  it('reports damaged summary provenance as FAIL instead of throwing', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({
      db,
      frozen: frozen({
        model: { ...frozen().config.model, provider: 'mock_context_contract', model: 'mock-context-contract-v1' },
        context_policy: {
          version: 'phase0_1', include_public_history: true, include_own_private: true, max_messages: 1,
          summarization: { enabled: true, version: 'rolling-v1', max_source_messages: 4, scopes: ['public'], fidelity_audit: true },
        },
      }),
    });
    await runner.execute();
    db.prepare(`UPDATE context_summaries SET source_message_ids = 'not-json' WHERE run_id = ? LIMIT 1`).run(runner.id);

    expect(metric(db, runner.id, 'M24').status).toBe('FAIL');
  });

  it('does not treat checkpoint existence as recovery idempotency evidence', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({
      db,
      frozen: frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } }),
    });
    await runner.execute();

    expect(metric(db, runner.id, 'M27').status).toBe('NOT_EXERCISED');
  });

  it('does not treat a resume marker without a reopened opportunity as idempotency evidence', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({
      db,
      frozen: frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } }),
    });
    await runner.execute();
    const last = db.prepare(`SELECT sequence FROM events WHERE run_id = ? ORDER BY sequence DESC LIMIT 1`).get(runner.id) as { sequence: number };
    const run = db.prepare(`SELECT experiment_id, config_hash FROM runs WHERE run_id = ?`).get(runner.id) as { experiment_id: string; config_hash: string };
    db.prepare(
      `INSERT INTO events (event_id, run_id, experiment_id, config_hash, sequence, timestamp,
         elapsed_ms, event_type, workshop_state, causal_event_ids, payload)
       VALUES ('forged_resume', ?, ?, ?, ?, ?, 0, 'run_resumed', 'COMPLETED', '[]', '{}')`,
    ).run(runner.id, run.experiment_id, run.config_hash, last.sequence + 1, new Date().toISOString());

    expect(metric(db, runner.id, 'M27').status).toBe('NOT_EXERCISED');
  });

  it('fails a linked backup verification whose restored identity is wrong', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();
    db.prepare(
      `INSERT INTO backup_verifications
       (backup_verification_id, run_id, backup_path, backup_sha256, backup_bytes, config_hash, event_count, verified_at)
       VALUES ('backup_bad', ?, 'bad.sqlite', 'sha256:bad', 1, 'sha256:wrong', 0, ?)`,
    ).run(runner.id, new Date().toISOString());

    expect(metric(db, runner.id, 'M28').status).toBe('FAIL');
  });

  it('does not pass tool-gateway attribution from successful probes alone', async () => {
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
          probes: [{ agent_id: 'agent_1', state: 'INTRODUCTION', occurrence: 1, tool_id: 'echo', input: { value: 'no-fault' } }],
        },
      }),
    });
    await runner.execute();

    expect(metric(db, runner.id, 'M26').status).toBe('NOT_EXERCISED');
  });

  it('reads moderator mode as structured config rather than a JSON substring', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen({ moderator: { id: 'moderator', display_name: 'Moderator', mode: 'scripted' } }) });
    await runner.execute();
    const row = db.prepare(`SELECT config_json FROM runs WHERE run_id = ?`).get(runner.id) as { config_json: string };
    db.prepare(`UPDATE runs SET config_json = ? WHERE run_id = ?`).run(JSON.stringify(JSON.parse(row.config_json), null, 2), runner.id);

    expect(metric(db, runner.id, 'M29').status).toBe('PASS');
  });

  it('fails moderator-boundary validation if a scripted turn is recorded as a model call', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({
      db,
      frozen: frozen({ moderator: { id: 'moderator', display_name: 'Moderator', mode: 'scripted' } }),
    });
    await runner.execute();
    db.prepare(`UPDATE invocations SET provider = 'mock' WHERE run_id = ? AND agent_id = 'moderator'`).run(runner.id);

    expect(metric(db, runner.id, 'M29').status).toBe('FAIL');
  });

  it('does not mark an incomplete declared live canary as NOT_EXERCISED', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({
      db,
      frozen: frozen({
        model: { ...frozen().config.model, provider: 'openai' },
        validation: { profile: 'live_canary' },
      }),
      provider: new MockProvider(),
    });
    await runner.execute();

    expect(metric(db, runner.id, 'M30').status).toBe('FAIL');
  });

  it('binds Phase 0.1 metrics into acceptance for an opted-in robustness run', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({
      db,
      frozen: frozen({
        model: { ...frozen().config.model, provider: 'mock_context_contract', model: 'mock-context-contract-v1' },
        context_policy: {
          version: 'phase0_1', include_public_history: true, include_own_private: true, max_messages: 2,
          summarization: { enabled: true, version: 'rolling-v1', max_source_messages: 4, scopes: ['public'], fidelity_audit: true },
        },
      }),
    });
    await runner.execute();

    const report = finalizeReport(evaluateGates({ db, runId: runner.id }));
    expect(report.phase01?.metrics.map((item) => item.id)).toEqual(['M23', 'M24', 'M25', 'M26', 'M27', 'M28', 'M29', 'M30']);
    expect(report.phase01?.status).toBe('NOT_EXERCISED');
    expect(report.ready_for_controlled_behavioral_experiment).toBe(false);
  });
});
