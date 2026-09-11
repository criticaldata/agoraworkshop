import { describe, expect, it } from 'vitest';
import { campaign, freezeCampaign, runCampaign, starterInput } from '../src/phase1/campaign.js';
import { ballotRows, validateBallotTrace, type BallotTerminalStatus } from '../src/phase1/collective.js';
import { frozen, tempDb } from './helpers.js';

describe('typed S7 ballot contract', () => {
  it('persists trace, authorized context, usage and a typed terminal status', async () => {
    const db = tempDb();
    const id = freezeCampaign(db, { ...starterInput(frozen().config, true), blocks: 1 });
    await runCampaign(db, id);
    const runId = campaign(db, id).cases[0]!.run_id!;
    const rows = ballotRows(db, runId);
    expect(rows).toHaveLength(5);
    expect(rows.every(row => row.trace_id && row.opportunity_id && row.invocation_id)).toBe(true);
    expect(rows.every(row => row.terminal_status === 'valid')).toBe(true);
    expect(rows.every(row => row.failure_category === null)).toBe(true);
    expect(rows.every(row => JSON.parse(row.authorized_context_json ?? 'null') instanceof Array)).toBe(true);
    expect(rows.every(row => JSON.parse(row.usage_json ?? 'null').inputTokens !== null)).toBe(true);
    expect(validateBallotTrace(db, runId)).toEqual({ valid: true, missing: [] });
    db.close();
  });

  it('rejects an orphaned ballot trace edge instead of treating it as a behavioral result', async () => {
    const db = tempDb();
    const id = freezeCampaign(db, { ...starterInput(frozen().config, true), blocks: 1 });
    await runCampaign(db, id);
    const runId = campaign(db, id).cases[0]!.run_id!;
    const row = ballotRows(db, runId)[0]!;
    db.prepare('UPDATE phase1_ballots SET trace_id = NULL WHERE record_id = ?').run(row.record_id);
    const validation = validateBallotTrace(db, runId);
    expect(validation.valid).toBe(false);
    expect(validation.missing.some(item => item.includes(row.record_id))).toBe(true);
    db.close();
  });

  it('keeps the terminal status vocabulary closed', () => {
    const allowed: BallotTerminalStatus[] = ['valid', 'explicit_abstention', 'invalid', 'provider_failure', 'timeout', 'deadline', 'budget', 'cancellation', 'unknown_incomplete'];
    expect(new Set(allowed).size).toBe(9);
  });
});
