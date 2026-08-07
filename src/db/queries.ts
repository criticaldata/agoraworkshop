import type { Db } from './index.js';
import type { ExperimentConfig } from '../config/schema.js';
import type { StoredMessage } from '../orchestrator/visibility.js';

export interface RunRow {
  run_id: string;
  experiment_id: string;
  config_hash: string;
  config_json: string;
  config_canonical: string;
  config_source_path: string | null;
  source_run_id: string | null;
  status: string;
  termination_reason: string | null;
  failure_reason: string | null;
  provider: string;
  model: string;
  code_commit_sha: string | null;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
}

export interface OpportunityRow {
  opportunity_id: string;
  run_id: string;
  sequence: number;
  agent_id: string;
  workshop_state: string;
  channel: string;
  breakout_group_id: string | null;
  round_index: number;
  created_at: string;
  resolved_at: string | null;
  resolution: string | null;
  failure_category: string | null;
  behaviourally_available: number;
  message_id: string | null;
  attempts: number;
}

export interface InvocationRow {
  invocation_id: string;
  run_id: string;
  opportunity_id: string;
  sequence: number;
  agent_id: string;
  workshop_state: string;
  channel: string;
  attempt: number;
  provider: string;
  requested_model: string;
  responded_model: string | null;
  generation_params: string;
  prompt_version: string;
  system_prompt: string;
  rendered_messages: string;
  context_message_ids: string;
  context_public_ids: string;
  context_private_ids: string;
  context_policy_version: string;
  capability_manifest: string;
  budget_calls_used_before: number;
  budget_tokens_used_before: number;
  request_ts: string;
  response_ts: string | null;
  latency_ms: number | null;
  outcome: string;
  failure_category: string | null;
  error_message: string | null;
  finish_reason: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  output_message_id: string | null;
  raw_metadata: string;
}

interface MessageRow {
  message_id: string;
  run_id: string;
  sequence: number;
  channel: string;
  breakout_group_id: string | null;
  sender_agent_id: string;
  intended_recipients: string;
  actual_recipients: string;
  workshop_state: string;
  created_at: string;
  content: string;
  source_invocation_id: string | null;
  source_event_id: string | null;
}

export interface TransitionRow {
  id: number;
  run_id: string;
  sequence: number;
  from_state: string;
  to_state: string;
  status: string;
  reason: string | null;
  started_at: string;
  completed_at: string | null;
}

export function getRun(db: Db, runId: string): RunRow | null {
  return (db.prepare(`SELECT * FROM runs WHERE run_id = ?`).get(runId) as RunRow | undefined) ?? null;
}

export function listRuns(db: Db, limit = 100): RunRow[] {
  return db
    .prepare(`SELECT * FROM runs ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as RunRow[];
}

export function runConfig(row: RunRow): ExperimentConfig {
  return JSON.parse(row.config_json) as ExperimentConfig;
}

export function getMessages(db: Db, runId: string): StoredMessage[] {
  const rows = db
    .prepare(`SELECT * FROM messages WHERE run_id = ? ORDER BY sequence ASC`)
    .all(runId) as MessageRow[];
  return rows.map((row) => ({
    message_id: row.message_id,
    sequence: row.sequence,
    channel: row.channel as 'public' | 'private',
    breakout_group_id: row.breakout_group_id,
    sender_agent_id: row.sender_agent_id,
    intended_recipients: JSON.parse(row.intended_recipients) as string[],
    actual_recipients: JSON.parse(row.actual_recipients) as string[],
    workshop_state: row.workshop_state,
    created_at: row.created_at,
    content: row.content,
    source_invocation_id: row.source_invocation_id,
    source_event_id: row.source_event_id,
  }));
}

export function getOpportunities(db: Db, runId: string): OpportunityRow[] {
  return db
    .prepare(`SELECT * FROM opportunities WHERE run_id = ? ORDER BY sequence ASC`)
    .all(runId) as OpportunityRow[];
}

export function getInvocations(db: Db, runId: string): InvocationRow[] {
  return db
    .prepare(`SELECT * FROM invocations WHERE run_id = ? ORDER BY sequence ASC, attempt ASC`)
    .all(runId) as InvocationRow[];
}

export function getInvocation(db: Db, invocationId: string): InvocationRow | null {
  return (
    (db.prepare(`SELECT * FROM invocations WHERE invocation_id = ?`).get(invocationId) as
      | InvocationRow
      | undefined) ?? null
  );
}

export function getTransitions(db: Db, runId: string): TransitionRow[] {
  return db
    .prepare(`SELECT * FROM state_transitions WHERE run_id = ? ORDER BY id ASC`)
    .all(runId) as TransitionRow[];
}

export function runsWithConfigHash(db: Db, configHash: string): RunRow[] {
  return db
    .prepare(`SELECT * FROM runs WHERE config_hash = ? ORDER BY created_at ASC`)
    .all(configHash) as RunRow[];
}

export function recordArtifact(
  db: Db,
  runId: string,
  name: string,
  kind: string,
  path: string,
  sha256: string,
  bytes: number,
  createdAt: string,
): void {
  db.prepare(
    `INSERT INTO artifacts (run_id, name, kind, path, sha256, bytes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(runId, name, kind, path, sha256, bytes, createdAt);
}

export function getArtifacts(
  db: Db,
  runId: string,
): Array<{ name: string; kind: string; path: string; sha256: string; bytes: number }> {
  return db
    .prepare(`SELECT name, kind, path, sha256, bytes FROM artifacts WHERE run_id = ? ORDER BY id ASC`)
    .all(runId) as Array<{
    name: string;
    kind: string;
    path: string;
    sha256: string;
    bytes: number;
  }>;
}

export interface RunSummary {
  run_id: string;
  public_messages: number;
  private_messages: number;
  opportunities: number;
  failures: number;
  retries: number;
}

/**
 * Cheap per-run counts for the list view, computed in SQL in one pass.
 *
 * The list deliberately does not evaluate the acceptance checks, which are far more
 * expensive; it shows what happened, and the checks live on the run itself.
 */
export function runSummaries(db: Db, runIds: string[]): Map<string, RunSummary> {
  const out = new Map<string, RunSummary>();
  if (runIds.length === 0) return out;
  const placeholders = runIds.map(() => '?').join(',');

  const rows = db
    .prepare(
      `SELECT r.run_id AS run_id,
              (SELECT COUNT(*) FROM messages m
                WHERE m.run_id = r.run_id AND m.channel = 'public')      AS public_messages,
              (SELECT COUNT(*) FROM messages m
                WHERE m.run_id = r.run_id AND m.channel = 'private')     AS private_messages,
              (SELECT COUNT(*) FROM opportunities o
                WHERE o.run_id = r.run_id)                               AS opportunities,
              (SELECT COUNT(*) FROM opportunities o
                WHERE o.run_id = r.run_id
                  AND o.resolution = 'infrastructure_failure')           AS failures,
              (SELECT COUNT(*) FROM invocations i
                WHERE i.run_id = r.run_id AND i.attempt > 1)             AS retries
         FROM runs r
        WHERE r.run_id IN (${placeholders})`,
    )
    .all(...runIds) as RunSummary[];

  for (const row of rows) out.set(row.run_id, row);
  return out;
}
