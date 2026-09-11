import type { Db } from '../db/index.js';
import { campaignAnalysis } from '../phase1/analysis.js';

export const PHASE1_M01_STATUSES = ['NOT_EXERCISED', 'EXECUTED_BUT_INVALID', 'EXECUTED_BUT_MISSING', 'VALID'] as const;
export type Phase1M01Status = typeof PHASE1_M01_STATUSES[number];

export function classifyPhase1M01(input: { executed: boolean; valid: boolean; requiredEvidenceMissing: boolean }): Phase1M01Status {
  if (!input.executed) return 'NOT_EXERCISED';
  if (!input.valid) return 'EXECUTED_BUT_INVALID';
  if (input.requiredEvidenceMissing) return 'EXECUTED_BUT_MISSING';
  return 'VALID';
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
    phase1b: 'INACTIVE' as const,
  };
}
