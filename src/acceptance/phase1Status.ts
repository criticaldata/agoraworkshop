import type { Db } from '../db/index.js';
import { campaignAnalysis } from '../phase1/analysis.js';

export const PHASE1_M01_STATUSES = ['NOT_EXERCISED', 'EXECUTED_BUT_INVALID', 'EXECUTED_BUT_MISSING', 'VALID'] as const;
export type Phase1M01Status = typeof PHASE1_M01_STATUSES[number];
export const PHASE1A_CLOSURE_STATES = ['PENDING_HUMAN_VALIDATION', 'CONFIRMATORY_READY', 'CLOSED', 'HUMAN_VALIDATION_FAILED_RECALIBRATION_REQUIRED'] as const;
export type Phase1AClosureState = typeof PHASE1A_CLOSURE_STATES[number];

export function classifyPhase1M01(input: { executed: boolean; valid: boolean; requiredEvidenceMissing: boolean }): Phase1M01Status {
  if (!input.executed) return 'NOT_EXERCISED';
  if (!input.valid) return 'EXECUTED_BUT_INVALID';
  if (input.requiredEvidenceMissing) return 'EXECUTED_BUT_MISSING';
  return 'VALID';
}

export function classifyHumanValidationState(input: { coverageComplete: boolean; reliabilityPass: boolean; adjudicationComplete: boolean; failed?: boolean }): Phase1AClosureState {
  if (input.failed) return 'HUMAN_VALIDATION_FAILED_RECALIBRATION_REQUIRED';
  return input.coverageComplete && input.reliabilityPass && input.adjudicationComplete ? 'CONFIRMATORY_READY' : 'PENDING_HUMAN_VALIDATION';
}

export function phase1BEligibility(input: {
  p1a: string; p1b: string; p1c: string; p1d: string; phase1aState: Phase1AClosureState;
}): { eligible: boolean; status: 'ELIGIBLE' | 'INACTIVE'; reason: string } {
  const eligible = input.p1a === 'PASS' && input.p1b === 'PASS' && input.p1c === 'PASS' && input.p1d === 'PASS' && input.phase1aState === 'CLOSED';
  return eligible
    ? { eligible: true, status: 'ELIGIBLE', reason: 'All four gates pass and Phase 1A is explicitly CLOSED.' }
    : { eligible: false, status: 'INACTIVE', reason: 'Phase 1B requires P1-A/P1-B/P1-C/P1-D PASS and an explicit Phase 1A CLOSED state.' };
}

export function phase1GateStatus(db: Db, campaignId: string) {
  const report = campaignAnalysis(db, campaignId);
  const gates = new Map(report.closure.gates.map(gate => [gate.id, gate]));
  const p1d = gates.get('P1-D')?.status ?? 'PENDING_HUMAN_VALIDATION';
  return {
    P1A: gates.get('P1-A')?.status ?? 'BLOCKED',
    P1B: gates.get('P1-B')?.status ?? 'BLOCKED',
    P1C: gates.get('P1-C')?.status ?? 'BLOCKED',
    P1D: p1d === 'PASS' ? 'CONFIRMATORY_READY' : 'PENDING_HUMAN_VALIDATION',
    blockers: report.closure.gates.filter(gate => gate.status !== 'PASS').map(gate => ({ id: gate.id, reason: gate.reason })),
    phase1a_state: 'PENDING_HUMAN_VALIDATION' as const,
    phase1b: 'INACTIVE' as const,
    phase1b_eligible: false,
  };
}
