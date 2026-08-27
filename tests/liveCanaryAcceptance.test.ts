import { describe, expect, it } from 'vitest';
import { evaluatePhase01, type LiveCanaryLink } from '../src/acceptance/phase01.js';
import { exportRun } from '../src/export/exporter.js';
import { FaultInjectingProvider } from '../src/providers/faultInjection.js';
import { MockProvider } from '../src/providers/mock.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { frozen, tempDb, tempDir } from './helpers.js';

async function liveRun(db: ReturnType<typeof tempDb>, fault = false) {
  const config = frozen({
    experiment_id: fault ? 'live_fault' : 'live_baseline',
    model: { ...frozen().config.model, provider: 'openai', model: 'test-live-model' },
    validation: { profile: 'live_canary' },
    fault_injection: fault
      ? { enabled: true, faults: [{ agent_id: 'agent_1', state: 'INTRODUCTION', occurrence: 1, kind: 'timeout', recover_after_attempts: 1 }] }
      : { enabled: false, faults: [] },
  });
  const faults = new FaultInjectingProvider(new MockProvider(), config.config);
  const runner = new WorkshopRunner({ db, frozen: config, provider: faults, faults });
  await runner.execute();
  return runner.id;
}

describe('linked live-canary acceptance', () => {
  it('fails when a live run is exported without the baseline/rerun/fault link', async () => {
    const db = tempDb();
    const runId = await liveRun(db);
    exportRun({ db, runId, outDir: tempDir() });

    const metric = evaluatePhase01(db, runId).find((item) => item.id === 'M30')!;

    expect(metric.status).toBe('FAIL');
    expect(metric.evidence).toMatch(/linked/i);
  });

  it('rejects a link whose rerun is not the same frozen condition', async () => {
    const db = tempDb();
    const baselineRunId = await liveRun(db);
    const rerunRunId = await liveRun(db);
    const faultRunId = await liveRun(db, true);
    for (const runId of [rerunRunId, faultRunId]) exportRun({ db, runId, outDir: tempDir() });

    const link: LiveCanaryLink = { baselineRunId, rerunRunId, faultRunId };
    const metric = evaluatePhase01(db, baselineRunId, { liveCanaryLink: link }).find((item) => item.id === 'M30')!;

    expect(metric.status).toBe('FAIL');
    expect(metric.evidence).toMatch(/config hash|core gate|export/i);
  });
});
