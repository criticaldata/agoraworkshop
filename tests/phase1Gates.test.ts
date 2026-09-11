import { describe, expect, it } from 'vitest';
import { classifyPhase1M01, phase1GateStatus } from '../src/acceptance/phase1Status.js';
import { freezeCampaign, starterInput } from '../src/phase1/campaign.js';
import { frozen, tempDb } from './helpers.js';

describe('Phase 1A gate vocabulary', () => {
  it('keeps executed-invalid, executed-missing and not-exercised distinct', () => {
    expect(classifyPhase1M01({ executed: false, valid: false, requiredEvidenceMissing: true })).toBe('NOT_EXERCISED');
    expect(classifyPhase1M01({ executed: true, valid: false, requiredEvidenceMissing: true })).toBe('EXECUTED_BUT_INVALID');
    expect(classifyPhase1M01({ executed: true, valid: true, requiredEvidenceMissing: true })).toBe('EXECUTED_BUT_MISSING');
    expect(classifyPhase1M01({ executed: true, valid: true, requiredEvidenceMissing: false })).toBe('VALID');
  });

  it('reports P1-D as pending human validation and keeps Phase 1B inactive', () => {
    const db = tempDb();
    const id = freezeCampaign(db, { ...starterInput(frozen().config, true), blocks: 10 });
    const status = phase1GateStatus(db, id);
    expect(status.P1D).toBe('PENDING_HUMAN_VALIDATION');
    expect(status.phase1b).toBe('INACTIVE');
    db.close();
  });
});
