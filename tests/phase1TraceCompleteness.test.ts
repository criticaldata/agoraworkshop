import { describe, expect, it } from 'vitest';
import { evaluatePhase01 } from '../src/acceptance/phase01.js';
import { campaign, freezeCampaign, runCampaign, starterInput } from '../src/phase1/campaign.js';
import { frozen, tempDb } from './helpers.js';

describe('end-to-end Phase 1 trace validation', () => {
  it('fails M25 when a delivery trace is removed from the event log', async () => {
    const db = tempDb();
    const id = freezeCampaign(db, { ...starterInput(frozen().config, true), blocks: 1 });
    await runCampaign(db, id);
    const runId = campaign(db, id).cases[0]!.run_id!;
    expect(evaluatePhase01(db, runId).find(metric => metric.id === 'M25')!.status).toBe('PASS');
    db.prepare("UPDATE events SET trace_id = NULL WHERE rowid = (SELECT rowid FROM events WHERE run_id = ? AND event_type = 'message_delivered' LIMIT 1)").run(runId);
    expect(evaluatePhase01(db, runId).find(metric => metric.id === 'M25')!.status).toBe('FAIL');
    db.close();
  });
});
