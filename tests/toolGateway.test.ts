import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { frozen, tempDb } from './helpers.js';

describe('deterministic Phase 0.1 tool gateway', () => {
  it('retries a controlled tool timeout without duplicating the successful action', async () => {
    const db = tempDb();
    const config = frozen({
      capabilities: {
        tools_enabled: true,
        manifest: [
          {
            id: 'echo',
            allowed_agents: ['agent_1'],
            result_scope: 'private',
            max_calls_per_opportunity: 1,
          },
        ],
      },
      tool_probe: {
        enabled: true,
        probes: [
          {
            agent_id: 'agent_1',
            state: 'INTRODUCTION',
            occurrence: 1,
            tool_id: 'echo',
            input: { value: 'retry' },
          },
        ],
      },
      fault_injection: {
        enabled: true,
        faults: [
          {
            agent_id: 'agent_1',
            state: 'INTRODUCTION',
            occurrence: 1,
            kind: 'tool_timeout',
            recover_after_attempts: 1,
          },
        ],
      },
    });
    const runner = new WorkshopRunner({ db, frozen: config });
    await runner.execute();

    const calls = db
      .prepare(
        `SELECT attempt, outcome, failure_category FROM tool_calls WHERE run_id = ? ORDER BY sequence`,
      )
      .all(runner.id) as Array<{ attempt: number; outcome: string; failure_category: string | null }>;
    expect(calls).toEqual([
      { attempt: 1, outcome: 'infra_failure', failure_category: 'tool_timeout' },
      { attempt: 2, outcome: 'success', failure_category: null },
    ]);
  });

  it('records an authorized echo probe under the response opportunity trace', async () => {
    const db = tempDb();
    const config = frozen({
      capabilities: {
        tools_enabled: true,
        manifest: [
          {
            id: 'echo',
            allowed_agents: ['agent_1'],
            result_scope: 'private',
            max_calls_per_opportunity: 1,
          },
        ],
      },
      tool_probe: {
        enabled: true,
        probes: [
          {
            agent_id: 'agent_1',
            state: 'INTRODUCTION',
            occurrence: 1,
            tool_id: 'echo',
            input: { value: 'deterministic' },
          },
        ],
      },
    });
    const runner = new WorkshopRunner({ db, frozen: config });
    await runner.execute();

    const calls = db
      .prepare(
        `SELECT tool_id, trace_id, opportunity_id, outcome, result_scope, result_json
         FROM tool_calls WHERE run_id = ? ORDER BY sequence`,
      )
      .all(runner.id) as Array<Record<string, string>>;

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      tool_id: 'echo',
      outcome: 'success',
      result_scope: 'private',
    });
    expect(calls[0]?.trace_id).toMatch(/^trace_/);
    expect(JSON.parse(calls[0]?.result_json ?? '{}')).toEqual({ value: 'deterministic' });
  });
});
