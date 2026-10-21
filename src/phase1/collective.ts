import { z } from 'zod';
import type { Db } from '../db/index.js';
import type { ExperimentConfig } from '../config/schema.js';
import type { AgentInvocationRequest, AgentInvocationResult } from '../providers/types.js';
import { assembleContext } from '../orchestrator/context.js';
import { collectPositions, positionRows } from './positions.js';
import { newInvocationId, newTraceId, nowIso } from '../core/ids.js';
import { configHash, canonicalize } from '../config/hash.js';
import { STAGES } from './canonicalContract.js';
import { getMessages } from '../db/queries.js';
import { readEvents } from '../events/recorder.js';

export interface BallotRow {
  record_id: string; run_id: string; agent_id: string; status: string;
  request_json: string | null; response_json: string | null; value_json: string | null;
  error: string | null; created_at: string; completed_at: string | null;
}
export interface StageRow { run_id: string; stage: string; status: string; started_at: string; completed_at: string | null }
export const BallotSchema = z.object({ ballots: z.array(z.object({
  question_id: z.string(), choice: z.string().nullable(),
}).strict()) }).strict();
export type Ballot = z.infer<typeof BallotSchema>;

export function ballotRows(db: Db, runId: string): BallotRow[] {
  return db.prepare('SELECT * FROM phase1_ballots WHERE run_id = ? ORDER BY rowid').all(runId) as BallotRow[];
}
export function stageRows(db: Db, runId: string): StageRow[] {
  return db.prepare('SELECT * FROM phase1_stages WHERE run_id = ? ORDER BY rowid').all(runId) as StageRow[];
}
export function startStage(db: Db, runId: string, stage: string): boolean {
  return db.prepare("INSERT OR IGNORE INTO phase1_stages VALUES (?, ?, 'running', ?, NULL)").run(runId, stage, nowIso()).changes > 0;
}
export function finishStage(db: Db, runId: string, stage: string, status: 'complete' | 'incomplete'): boolean {
  return db.prepare("UPDATE phase1_stages SET status = ?, completed_at = ? WHERE run_id = ? AND stage = ? AND status = 'running'").run(status, nowIso(), runId, stage).changes > 0;
}

export function ballotInstruction(config: ExperimentConfig): string {
  return 'AGORA_SEALED_BALLOT_V1\n' + canonicalize(config.phase1!.evaluation!.questionnaire) +
    '\nYour independent final position has already been recorded. Cast one sealed vote per question. Return only JSON: {"ballots":[{"question_id":"...","choice":"exact option or null for abstention"}]}. Use JSON null, not a string, to abstain. Answer every question exactly once. You cannot see other ballots before submitting. Individual ballots are retained for authorized researchers and never added to participant context. Only aggregate counts are published. A decision requires all five valid ballots and at least three votes for one option. Missing/invalid ballots block a decision; abstentions do not reduce the threshold; ties and no-majority outcomes remain unresolved. No repair or second attempt.';
}
export function parseBallot(content: string, config: ExperimentConfig): Ballot {
  const value = BallotSchema.parse(JSON.parse(content));
  const questions = config.phase1!.evaluation!.questionnaire.questions;
  if (value.ballots.length !== questions.length || new Set(value.ballots.map(b => b.question_id)).size !== questions.length) throw new Error('Every ballot question must appear exactly once');
  for (const q of questions) {
    const b = value.ballots.find(b => b.question_id === q.id);
    if (!b || (b.choice !== null && !q.options.includes(b.choice))) throw new Error(`Invalid choice for ${q.id}`);
  }
  return value;
}

/** No ballot or S6 answer is ever appended to history. All voters get the same
 * dialogue snapshot filtered by their frozen access/context policy. */
export async function collectBallots(input: Omit<Parameters<typeof collectPositions>[0], 'phase' | 'onRecord'> & { onRecord: (row: BallotRow) => void }): Promise<void> {
  const { db, runId, config, budgets } = input;
  const finals = positionRows(db, runId).filter(p => p.phase === 'final');
  // Fail closed before reserving or invoking even the first ballot.
  if (finals.length !== 5 || config.participants.some(p => !finals.some(r => r.agent_id === p.id && r.status === 'valid'))) return;
  const history = [...input.history];
  for (const p of config.participants) {
    const prior = ballotRows(db, runId).find(r => r.agent_id === p.id);
    if (prior) {
      const result = prior.response_json ? JSON.parse(prior.response_json) as AgentInvocationResult : null;
      if (prior.status === 'pending' || (result && (result.usage.inputTokens === null || result.usage.outputTokens === null))) throw new Error('Interrupted ballot has unknown usage; refusing to repeat it or resume provider calls');
      continue;
    }
    const recordId = newInvocationId();
    const context = assembleContext({ config, history, agentId: p.id, state: 'FINAL_DISCUSSION', roundIndex: 0, totalRounds: 1, channel: 'public', opportunityId: recordId, instructionOverride: ballotInstruction(config) });
    const request: AgentInvocationRequest = {
      invocationId: recordId, agentId: p.id, attempt: 1, system: context.systemPrompt,
      messages: context.renderedMessages, model: config.model, timeoutMs: config.runtime.timeout_seconds * 1000,
      configHash: input.hash, traceId: newTraceId(), contextMessageIds: context.includedMessageIds,
      summaryIds: context.summaryRecords.map(s => s.summary_id), summaryHashes: context.summaryRecords.map(s => s.content_hash), capabilityManifest: [],
      ballotProbe: config.phase1!.evaluation!.questionnaire,
    };
    const stopped = input.stopped(), allowed = budgets.check(p.id).allowed;
    const missing = stopped || !allowed;
    db.prepare('INSERT INTO phase1_ballots VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)').run(recordId, runId, p.id, missing ? 'missing' : 'pending', JSON.stringify({ request, context_summaries: context.summaryRecords }), missing ? stopped ? 'deadline_or_cancelled' : 'agent_budget_exhausted' : null, nowIso(), missing ? nowIso() : null);
    if (!missing) {
      const result = await input.provider.invoke(request);
      budgets.recordCall(p.id, (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0));
      let value: Ballot | null = null, error = result.failure?.message ?? null;
      if (result.ok) try { value = parseBallot(result.content ?? '', config); } catch (e) { error = String(e); }
      db.prepare('UPDATE phase1_ballots SET status = ?, response_json = ?, value_json = ?, error = ?, completed_at = ? WHERE record_id = ?').run(value ? 'valid' : result.ok ? 'invalid' : 'missing', JSON.stringify(result), value ? canonicalize(value) : null, error, nowIso(), recordId);
      input.onRecord(ballotRows(db, runId).find(r => r.record_id === recordId)!);
      if (result.usage.inputTokens === null || result.usage.outputTokens === null) throw new Error('Ballot usage unavailable; stopping further provider calls');
    } else input.onRecord(ballotRows(db, runId).find(r => r.record_id === recordId)!);
  }
}

const CountSchema = z.object({ option: z.string(), votes: z.number().int().nonnegative() }).strict();
export const CollectiveArtifactSchema = z.object({
  version: z.literal('deterministic_collective_artifact_v1'),
  run_id: z.string(), config_hash: z.string(), participant_behavior: z.literal(false),
  voting_rule: z.literal('single_choice_absolute_majority_v1'),
  eligible_voters: z.literal(5), valid_ballots: z.number().int().min(0).max(5),
  missing_or_invalid_voters: z.array(z.string()),
  decisions: z.array(z.object({ question_id: z.string(), counts: z.array(CountSchema), abstentions: z.number().int(),
    outcome: z.enum(['decided', 'incomplete', 'no_majority']), decision: z.string().nullable(),
    majority_position: CountSchema.nullable(), minority_positions: z.array(CountSchema),
    unresolved_disagreements: z.array(z.string()),
  }).strict()),
  provenance: z.object({ final_position_record_ids: z.array(z.string()), ballot_record_ids: z.array(z.string()) }).strict(),
  limitations: z.string(),
}).strict();

/** Pure aggregation: never resolve a tie by order, plurality, or moderator choice.
 * Counts describe ballot options, not inferred consensus or unexpressed beliefs. */
export function aggregateBallots(config: ExperimentConfig, runId: string, rows: BallotRow[], finalIds: string[] = []) {
  const expected = config.participants.map(p => p.id);
  if (expected.length !== 5 || rows.some(r => r.run_id !== runId || !expected.includes(r.agent_id)) || new Set(rows.map(r => r.agent_id)).size !== rows.length) throw new Error('Invalid ballot provenance or duplicate voter');
  const valid = rows.filter(r => r.status === 'valid').map(r => ({ row: r, value: parseBallot(r.value_json ?? '', config) }));
  return CollectiveArtifactSchema.parse({
    version: 'deterministic_collective_artifact_v1', run_id: runId, config_hash: configHash(config), participant_behavior: false,
    voting_rule: 'single_choice_absolute_majority_v1', eligible_voters: 5, valid_ballots: valid.length,
    missing_or_invalid_voters: expected.filter(id => !valid.some(v => v.row.agent_id === id)),
    decisions: config.phase1!.evaluation!.questionnaire.questions.map(q => {
      const votes = valid.map(v => v.value.ballots.find(b => b.question_id === q.id)!.choice);
      const counts = q.options.map(option => ({ option, votes: votes.filter(v => v === option).length }));
      const majority = valid.length === 5 ? counts.find(c => c.votes >= 3) ?? null : null;
      return { question_id: q.id, counts, abstentions: votes.filter(v => v === null).length,
        outcome: valid.length !== 5 ? 'incomplete' : majority ? 'decided' : 'no_majority', decision: majority?.option ?? null,
        majority_position: majority, minority_positions: majority ? counts.filter(c => c.votes > 0 && c.option !== majority.option) : [],
        unresolved_disagreements: counts.filter(c => c.votes > 0 && c.option !== majority?.option).map(c => c.option),
      };
    }),
    provenance: { final_position_record_ids: finalIds, ballot_record_ids: rows.map(r => r.record_id) },
    limitations: 'System artifact, not participant behavior. Preserves expressed voting differences only; does not infer rationales, resolve semantic disagreements, or disclose private dialogue. Individual ballots and assessments remain researcher-only. A no-majority result is valid, not scientific failure.',
  });
}

export function saveCollectiveOutput(db: Db, config: ExperimentConfig, runId: string) {
  const artifact = aggregateBallots(config, runId, ballotRows(db, runId), positionRows(db, runId).filter(r => r.phase === 'final').map(r => r.record_id));
  const hash = configHash(artifact);
  const old = db.prepare('SELECT artifact_hash FROM phase1_collective_outputs WHERE run_id = ?').get(runId) as { artifact_hash: string } | undefined;
  if (old && old.artifact_hash !== hash) throw new Error('Collective output changed after sealing');
  const inserted = db.prepare('INSERT OR IGNORE INTO phase1_collective_outputs VALUES (?, ?, ?, ?)').run(runId, canonicalize(artifact), hash, nowIso()).changes > 0;
  return { artifact, hash, inserted };
}

export function collectiveRecords(db: Db, runId: string) {
  const output = db.prepare('SELECT * FROM phase1_collective_outputs WHERE run_id = ?').get(runId) as { artifact_json: string; artifact_hash: string } | undefined;
  return { stages: STAGES.map(([id, title]) => ({ id, title, record: stageRows(db, runId).find(s => s.stage === id) ?? null })),
    ballots: ballotRows(db, runId), output: output ? { artifact: CollectiveArtifactSchema.parse(JSON.parse(output.artifact_json)), hash: output.artifact_hash } : null };
}

export function auditCollective(db: Db, config: ExperimentConfig, runId: string) {
  const issues: string[] = [];
  const stages = stageRows(db, runId), ballots = ballotRows(db, runId);
  const complete = stages.length === 8 && stages.every(s => s.status === 'complete');
  if (stages.map(s => s.stage).join(',') !== STAGES.map(s => s[0]).join(',')) issues.push('Missing or out-of-order stages');
  const events = readEvents(db, runId);
  const s6 = events.filter(e => e.event_type === 'phase1_stage_finished' && e.payload.stage === 'S6' && e.payload.status === 'complete');
  const s7 = events.filter(e => e.event_type === 'phase1_stage_started' && e.payload.stage === 'S7');
  if (s6.length !== 1 || s7.length !== 1 || s6[0]!.sequence >= s7[0]!.sequence) issues.push('S6 barrier not proven');
  if (ballots.length !== 5 || ballots.some(b => b.status !== 'valid')) issues.push('Five valid sealed ballots required');
  // The snapshot excludes the post-S8 procedural close. Any injected ballot or
  // assessment text, missing private filter or altered instruction breaks equality.
  const history = getMessages(db, runId).filter(m => m.workshop_state !== 'CLOSING');
  for (const row of ballots) {
    try {
      const request = (JSON.parse(row.request_json ?? '') as { request: AgentInvocationRequest }).request;
      const expected = assembleContext({ config, history, agentId: row.agent_id, state: 'FINAL_DISCUSSION', roundIndex: 0, totalRounds: 1, channel: 'public', opportunityId: row.record_id, instructionOverride: ballotInstruction(config) });
      if (request.system !== expected.systemPrompt || canonicalize(request.messages) !== canonicalize(expected.renderedMessages) || canonicalize(request.contextMessageIds) !== canonicalize(expected.includedMessageIds) || request.configHash !== configHash(config)) issues.push(`Ballot context mismatch: ${row.record_id}`);
      const response = JSON.parse(row.response_json ?? '') as AgentInvocationResult;
      if (!response.ok || response.usage.inputTokens === null || response.usage.outputTokens === null || canonicalize(parseBallot(response.content ?? '', config)) !== row.value_json) issues.push(`Ballot response/usage mismatch: ${row.record_id}`);
    } catch { issues.push(`Unreadable ballot: ${row.record_id}`); }
  }
  try {
    const stored = collectiveRecords(db, runId).output;
    const expected = aggregateBallots(config, runId, ballots, positionRows(db, runId).filter(r => r.phase === 'final').map(r => r.record_id));
    if (!stored || stored.hash !== configHash(expected) || canonicalize(stored.artifact) !== canonicalize(expected)) issues.push('S8 artifact missing or does not match deterministic aggregation');
  } catch { issues.push('Invalid collective artifact'); }
  return { complete, verified: issues.length === 0, issues };
}
