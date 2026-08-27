import { describe, expect, it } from 'vitest';
import { evaluatePhase01 } from '../src/acceptance/phase01.js';
import { loadConfigFile } from '../src/config/load.js';
import { getToolCalls } from '../src/db/queries.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { tempDb } from './helpers.js';

describe('deterministic tool-fault matrix', () => {
  it('records timeout, unavailable, invalid response and permission denial independently', async () => {
    const db = tempDb();
    const frozen = loadConfigFile('configs/agora_phase0_1_tool_fault_matrix.yaml');
    const runner = new WorkshopRunner({ db, frozen });
    const result = await runner.execute();
    const calls = getToolCalls(db, runner.id);
    const categories = new Set(calls.map((call) => call.failure_category).filter(Boolean));
    const m26 = evaluatePhase01(db, runner.id).find((metric) => metric.id === 'M26')!;

    expect(result.status).toBe('COMPLETED');
    expect(categories).toEqual(new Set(['tool_timeout', 'tool_unavailable', 'tool_invalid_response', 'permission_denied']));
    expect(calls.filter((call) => call.outcome === 'success')).toHaveLength(3);
    expect(m26.status).toBe('PASS');
  });
});
