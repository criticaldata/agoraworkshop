import { describe, expect, it } from 'vitest';
import { classifyHumanValidationState, classifyPhase1M01, phase1BEligibility, phase1GateStatus } from '../src/acceptance/phase1Status.js';
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
    expect(status.phase1b_eligible).toBe(false);
    db.close();
  });

  it('keeps the human-failure recalibration state and Phase 1B boundary explicit', () => {
    expect(classifyHumanValidationState({ coverageComplete: false, reliabilityPass: false, adjudicationComplete: false })).toBe('PENDING_HUMAN_VALIDATION');
    expect(classifyHumanValidationState({ coverageComplete: false, reliabilityPass: false, adjudicationComplete: false, failed: true })).toBe('HUMAN_VALIDATION_FAILED_RECALIBRATION_REQUIRED');
    expect(classifyHumanValidationState({ coverageComplete: true, reliabilityPass: true, adjudicationComplete: true })).toBe('CONFIRMATORY_READY');
    expect(phase1BEligibility({ p1a: 'PASS', p1b: 'PASS', p1c: 'PASS', p1d: 'PASS', phase1aState: 'PENDING_HUMAN_VALIDATION' }).eligible).toBe(false);
    expect(phase1BEligibility({ p1a: 'PASS', p1b: 'PASS', p1c: 'PASS', p1d: 'PASS', phase1aState: 'CLOSED' }).eligible).toBe(true);
  });
});
