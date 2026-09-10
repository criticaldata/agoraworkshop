import { z } from 'zod';
import type { Db } from '../db/index.js';
import type { ExperimentConfig } from '../config/schema.js';
import type { AgentInvocationRequest, AgentInvocationResult, AgentProvider } from '../providers/types.js';
import { participantSystemPrompt } from '../prompts/registry.js';
import { assembleContext } from '../orchestrator/context.js';
import type { StoredMessage } from '../orchestrator/visibility.js';
import type { BudgetLedger } from '../orchestrator/budgets.js';
import { newInvocationId, newTraceId, nowIso } from '../core/ids.js';

export interface PositionRow {
  record_id: string; run_id: string; agent_id: string; phase: 'initial' | 'final';
  status: string; request_json: string | null; response_json: string | null;
  value_json: string | null; error: string | null; created_at: string; completed_at: string | null;
}
export const PositionAnswerSchema = z.object({ answers: z.array(z.object({
  question_id: z.string(), choice: z.string(), confidence: z.number().min(0).max(100),
  rationale: z.string().trim().min(1).max(12000),
}).strict()) }).strict();
export type PositionAnswer = z.infer<typeof PositionAnswerSchema>;

export function parsePosition(content: string, config: ExperimentConfig): PositionAnswer {
  const result = PositionAnswerSchema.parse(JSON.parse(content));
  const questions = config.phase1!.evaluation!.questionnaire.questions;
  if (result.answers.length !== questions.length || new Set(result.answers.map(a => a.question_id)).size !== questions.length) throw new Error('Every question must be answered exactly once');
  for (const q of questions) if (!q.options.includes(result.answers.find(a => a.question_id === q.id)?.choice ?? '')) throw new Error(`Invalid or missing choice for ${q.id}`);
  return result;
}

export function positionInstruction(config: ExperimentConfig): string {
  const instrument = config.phase1!.evaluation!.questionnaire;
  return 'AGORA_POSITION_PROBE_V1\n' + JSON.stringify(instrument) + '\nReport your current position on each question using exactly one listed option. Confidence is your expressed confidence from 0 to 100, not a calibrated probability. Return only JSON: {"answers":[{"question_id":"...","choice":"exact option","confidence":50,"rationale":"reason"}]}. Answer every question once. This assessment is not broadcast to workshop participants.';
}

export function positionPromptPreview(config: ExperimentConfig) {
  return { instruction: positionInstruction(config),
    system_prompts: config.participants.map(p => ({ agent_id: p.id, ...participantSystemPrompt(config, p.id) })),
    initial_context: 'Empty workshop history for every participant; no other initial answer is visible.',
    final_context: 'Authorized workshop history under the frozen context policy. No initial/final assessment answers are inserted into dialogue or later probes.',
    timing: 'Initial before moderator opening; final after participant deliberation and before moderator closing.',
    extra_attempts: config.participants.length * 2,
  };
}

export function positionRows(db: Db, runId: string): PositionRow[] {
  return db.prepare('SELECT * FROM phase1_positions WHERE run_id = ? ORDER BY rowid').all(runId) as PositionRow[];
}

/** These are assessment records, not workshop messages/opportunities. A durable
 * reservation precedes each call; interruption never silently repeats a probe. */
export async function collectPositions(input: {
  db: Db; config: ExperimentConfig; runId: string; hash: string; phase: 'initial' | 'final';
  history: StoredMessage[]; provider: AgentProvider; budgets: BudgetLedger;
  stopped: () => boolean; onRecord: (row: PositionRow) => void;
}): Promise<void> {
  const { db, config, runId, phase, budgets } = input;
  if (!config.phase1?.evaluation) return;
  // Same history snapshot for every final assessment, empty for every initial one.
  const history = phase === 'initial' ? [] : [...input.history];
  for (const p of config.participants) {
    const prior = positionRows(db, runId).find(r => r.agent_id === p.id && r.phase === phase);
    if (prior) {
      if (prior.status === 'pending') throw new Error('Interrupted position probe has unknown usage; refusing to repeat it or resume provider calls');
      if (prior.response_json) {
        const result = JSON.parse(prior.response_json) as AgentInvocationResult;
        if (result.usage.inputTokens === null || result.usage.outputTokens === null) throw new Error('Position probe usage unavailable; cannot safely resume provider calls');
      }
      continue;
    }
    const recordId = newInvocationId(), traceId = newTraceId();
    const context = assembleContext({ config, history, agentId: p.id, state: phase === 'initial' ? 'INTRODUCTION' : 'FINAL_DISCUSSION', roundIndex: 0, totalRounds: 1, channel: 'public', opportunityId: recordId, instructionOverride: positionInstruction(config) });
    const messages = context.renderedMessages;
    const request: AgentInvocationRequest = { invocationId: recordId, agentId: p.id, attempt: 1, system: context.systemPrompt,
      messages, model: config.model, timeoutMs: config.runtime.timeout_seconds * 1000,
      configHash: input.hash, traceId, contextMessageIds: context.includedMessageIds,
      summaryIds: context.summaryRecords.map(r => r.summary_id), summaryHashes: context.summaryRecords.map(r => r.content_hash), capabilityManifest: [],
      positionProbe: config.phase1.evaluation.questionnaire,
    };
    const missedInitial = phase === 'initial' && input.history.length > 0;
    const stopped = input.stopped() || missedInitial, allowed = budgets.check(p.id).allowed;
    const status = stopped || !allowed ? 'missing' : 'pending';
    db.prepare('INSERT INTO phase1_positions VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)').run(recordId, runId, p.id, phase, status,
      JSON.stringify({ request, context_summaries: context.summaryRecords }), status === 'missing' ? (missedInitial ? 'initial_window_missed' : stopped ? 'deadline_or_cancelled' : 'agent_budget_exhausted') : null, nowIso(), status === 'missing' ? nowIso() : null);
    if (status === 'missing') { input.onRecord(positionRows(db, runId).find(r => r.record_id === recordId)!); continue; }
    const result = await input.provider.invoke(request);
    budgets.recordCall(p.id, (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0));
    let parsed: PositionAnswer | null = null, error: string | null = result.failure?.message ?? null;
    if (result.ok) try { parsed = parsePosition(result.content ?? '', config); } catch (e) { error = e instanceof Error ? e.message : String(e); }
    db.prepare('UPDATE phase1_positions SET status = ?, response_json = ?, value_json = ?, error = ?, completed_at = ? WHERE record_id = ?').run(parsed ? 'valid' : result.ok ? 'invalid' : 'missing', JSON.stringify(result), parsed ? JSON.stringify(parsed) : null, error, nowIso(), recordId);
    input.onRecord(positionRows(db, runId).find(r => r.record_id === recordId)!);
    if (result.usage.inputTokens === null || result.usage.outputTokens === null) throw new Error('Position probe usage unavailable; stopping further provider calls');
  }
}

/** Provider-independent mock fixture: a valid response proves schema plumbing,
 * not deliberation, confidence calibration or role fidelity. */
export function mockPositionContent(request: AgentInvocationRequest): string | null {
  return request.positionProbe ? JSON.stringify({ answers: request.positionProbe.questions.map(q => ({ question_id: q.id, choice: q.options[0], confidence: 50, rationale: 'Deterministic measurement fixture; not a behavioral finding.' })) }) : null;
}
