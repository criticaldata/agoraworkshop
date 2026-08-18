import type { Db } from '../db/index.js';
import { getCheckpoints, getContextSummaries, getInvocations, getOpportunities, getToolCalls, getRun } from '../db/queries.js';
import { auditSummaryFidelity } from '../orchestrator/summaries.js';

export type Phase01Status = 'PASS' | 'FAIL' | 'NOT_EXERCISED';
export interface Phase01Metric { id: string; status: Phase01Status; evidence: string; }

export function evaluatePhase01(db: Db, runId: string): Phase01Metric[] {
  const invocations = getInvocations(db, runId);
  const opportunities = getOpportunities(db, runId);
  const summaries = getContextSummaries(db, runId);
  const tools = getToolCalls(db, runId);
  const checkpoints = getCheckpoints(db, runId);
  const run = getRun(db, runId);
  const traceOk = opportunities.every((o) => o.trace_id) && invocations.every((i) => i.trace_id);
  return [
    { id: 'M23', status: invocations.length ? (traceOk ? 'PASS' : 'FAIL') : 'NOT_EXERCISED', evidence: 'context material is linked to invocation trace records' },
    { id: 'M24', status: summaries.length ? (summaries.every((s) => auditSummaryFidelity({ ...s, source_message_ids: JSON.parse(s.source_message_ids) })) ? 'PASS' : 'FAIL') : 'NOT_EXERCISED', evidence: 'summary provenance and fidelity hashes' },
    { id: 'M25', status: traceOk ? 'PASS' : 'FAIL', evidence: 'opportunity-to-invocation trace completeness' },
    { id: 'M26', status: tools.length ? (tools.every((t) => t.trace_id && t.outcome) ? 'PASS' : 'FAIL') : 'NOT_EXERCISED', evidence: 'tool gateway attribution' },
    { id: 'M27', status: checkpoints.length ? 'PASS' : 'NOT_EXERCISED', evidence: 'checkpoint records available for recovery' },
    { id: 'M28', status: 'NOT_EXERCISED', evidence: 'backup/restore requires a linked backup artifact' },
    { id: 'M29', status: run?.config_json.includes('"mode":"scripted"') ? 'PASS' : 'NOT_EXERCISED', evidence: 'scripted moderator condition' },
    { id: 'M30', status: run && !['mock', 'mock_context_contract'].includes(run.provider) ? 'NOT_EXERCISED' : 'NOT_EXERCISED', evidence: 'live canary requires linked real-provider evidence' },
  ];
}

