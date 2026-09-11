import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import type { AuthPrincipal } from '../server/principal.js';
import type { AnnotationRecord } from '../semantic/phase1Annotations.js';
import { verifyDatasetLock } from './scienceStore.js';

const ReviewLabelSchema = z.object({
  label: z.enum(['present', 'absent', 'not_assessable', 'scored']),
  score: z.number().int().min(0).max(2).nullable().optional(),
  quote: z.string().min(1).max(12000), reason: z.string().trim().min(1).max(12000),
  relation: z.enum(['supports', 'challenges', 'extends', 'rejects', 'revises']).nullable().optional(),
}).strict();
export type ReviewLabel = z.infer<typeof ReviewLabelSchema>;

export interface BlindedUnit {
  assignment_id: string; snapshot_id: string; unit_id: string; reviewer_id: string;
  evidence: { message_id: string; content: string; workshop_state: string; channel: string; category: string; criterion_id?: string };
}

function snapshotPayload(db: Db, snapshotId: string): { campaign_id: string; payload_json: string; state: string } {
  const row = db.prepare('SELECT campaign_id, payload_json, state FROM phase1_dataset_snapshots WHERE snapshot_id = ?').get(snapshotId) as { campaign_id: string; payload_json: string; state: string } | undefined;
  if (!row || row.state !== 'LOCKED' || !verifyDatasetLock(db, snapshotId).valid) throw new Error('Review assignments require a valid locked dataset snapshot');
  return row;
}

function unitsFromSnapshot(payload: any) {
  const messages = new Map<string, any>();
  for (const source of payload.source_runs ?? []) for (const message of source.messages ?? []) messages.set(message.message_id, message);
  return (payload.coding_units ?? []).map((unit: any) => {
    const message = messages.get(unit.message_id);
    if (!message) throw new Error(`Snapshot unit ${unit.key} has no source message`);
    return { unit_id: unit.key, evidence: { message_id: message.message_id, content: message.content, workshop_state: message.workshop_state, channel: message.channel, category: unit.category, ...(unit.criterion_id ? { criterion_id: unit.criterion_id } : {}) } };
  });
}

export function createReviewAssignments(db: Db, snapshotId: string, reviewers: string[]) {
  if (new Set(reviewers).size !== reviewers.length || reviewers.length < 2) throw new Error('At least two distinct reviewers are required');
  const row = snapshotPayload(db, snapshotId), units = unitsFromSnapshot(JSON.parse(row.payload_json));
  const created: Array<{ assignment_id: string; snapshot_id: string; reviewer_id: string; unit_id: string }> = [];
  const insert = db.prepare(`INSERT OR IGNORE INTO phase1_review_assignments
    (assignment_id, snapshot_id, reviewer_id, unit_id, blinded_payload_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'assigned', ?)`);
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const unit of units) for (const reviewer_id of reviewers) {
      const assignment_id = `assignment_${randomUUID()}`;
      insert.run(assignment_id, snapshotId, reviewer_id, unit.unit_id, JSON.stringify(unit.evidence), now);
      const saved = db.prepare('SELECT assignment_id FROM phase1_review_assignments WHERE snapshot_id = ? AND reviewer_id = ? AND unit_id = ?').get(snapshotId, reviewer_id, unit.unit_id) as { assignment_id: string };
      created.push({ assignment_id: saved.assignment_id, snapshot_id: snapshotId, reviewer_id, unit_id: unit.unit_id });
    }
  })();
  return created;
}

export function blindedReviewProjection(db: Db, assignmentId: string, principal: AuthPrincipal): BlindedUnit {
  const row = db.prepare('SELECT * FROM phase1_review_assignments WHERE assignment_id = ?').get(assignmentId) as { assignment_id: string; snapshot_id: string; reviewer_id: string; unit_id: string; blinded_payload_json: string } | undefined;
  if (!row) throw new Error('Review assignment not found');
  if (row.reviewer_id !== principal.id) throw new Error('Review assignment belongs to another reviewer');
  const evidence = JSON.parse(row.blinded_payload_json) as BlindedUnit['evidence'];
  return { assignment_id: row.assignment_id, snapshot_id: row.snapshot_id, unit_id: row.unit_id, reviewer_id: row.reviewer_id, evidence };
}

export function submitIndependentReview(db: Db, assignmentId: string, principal: AuthPrincipal, label: unknown): string {
  const assignment = db.prepare('SELECT * FROM phase1_review_assignments WHERE assignment_id = ?').get(assignmentId) as { assignment_id: string; snapshot_id: string; reviewer_id: string; unit_id: string } | undefined;
  if (!assignment) throw new Error('Review assignment not found');
  if (assignment.reviewer_id !== principal.id) throw new Error('Review assignment belongs to another reviewer');
  const parsed = ReviewLabelSchema.parse(label);
  const submissionId = `submission_${randomUUID()}`;
  const labelJson = JSON.stringify(parsed), labelHash = `sha256:${createHash('sha256').update(labelJson, 'utf8').digest('hex')}`;
  try {
    db.prepare(`INSERT INTO phase1_review_submissions
      (submission_id, assignment_id, snapshot_id, unit_id, reviewer_id, label_json, label_hash, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(submissionId, assignment.assignment_id, assignment.snapshot_id, assignment.unit_id, principal.id, labelJson, labelHash, new Date().toISOString());
  } catch (error) {
    throw new Error(`Independent review already submitted or invalid: ${String(error)}`);
  }
  return submissionId;
}

export function listAdjudicationCandidates(db: Db, snapshotId: string): string[] {
  snapshotPayload(db, snapshotId);
  const rows = db.prepare(`SELECT unit_id, GROUP_CONCAT(label_hash) AS hashes, COUNT(*) AS n
    FROM phase1_review_submissions WHERE snapshot_id = ? GROUP BY unit_id HAVING n >= 2`).all(snapshotId) as Array<{ unit_id: string; hashes: string; n: number }>;
  return rows.filter(row => {
    const labels = db.prepare('SELECT label_json FROM phase1_review_submissions WHERE snapshot_id = ? AND unit_id = ? ORDER BY submitted_at').all(snapshotId, row.unit_id) as Array<{ label_json: string }>;
    return new Set(labels.map(label => label.label_json)).size > 1;
  }).map(row => `${snapshotId}:${row.unit_id}`);
}

export function submitAdjudication(db: Db, candidateId: string, adjudicator: AuthPrincipal, decision: unknown): string {
  if (!['admin', 'adjudicator'].includes(adjudicator.role)) throw new Error('Adjudicator permission required');
  const separator = candidateId.indexOf(':');
  if (separator < 1) throw new Error('Candidate ID must be snapshot_id:unit_id');
  const snapshotId = candidateId.slice(0, separator), unitId = candidateId.slice(separator + 1);
  if (!listAdjudicationCandidates(db, snapshotId).includes(candidateId)) throw new Error('Candidate requires two distinct independent labels');
  const submissions = db.prepare('SELECT submission_id FROM phase1_review_submissions WHERE snapshot_id = ? AND unit_id = ? ORDER BY submitted_at').all(snapshotId, unitId) as Array<{ submission_id: string }>;
  const adjudicationId = `adjudication_${randomUUID()}`;
  db.prepare(`INSERT INTO phase1_adjudications
    (adjudication_id, snapshot_id, unit_id, adjudicator_id, decision_json, rationale, source_submission_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(adjudicationId, snapshotId, unitId, adjudicator.id, JSON.stringify(decision), 'Independent disagreement adjudicated in a separate append-only record.', JSON.stringify(submissions.map(row => row.submission_id)), new Date().toISOString());
  return adjudicationId;
}

/** Projects workspace submissions into the existing immutable annotation layer for analysis. */
export function reviewWorkspaceAnnotations(db: Db, campaignId: string): AnnotationRecord[] {
  const snapshot = db.prepare('SELECT snapshot_id, payload_json FROM phase1_dataset_snapshots WHERE campaign_id = ? AND state = \'LOCKED\' ORDER BY created_at DESC LIMIT 1').get(campaignId) as { snapshot_id: string; payload_json: string } | undefined;
  if (!snapshot) return [];
  const payload = JSON.parse(snapshot.payload_json) as any;
  const units = new Map((payload.coding_units ?? []).map((unit: any) => [unit.key, unit]));
  const instrumentVersion = payload.manifest?.input?.role_pack?.rubric?.version ?? 'workspace-rubric';
  const rows = db.prepare('SELECT submission_id, unit_id, reviewer_id, label_json, submitted_at FROM phase1_review_submissions WHERE snapshot_id = ? ORDER BY submitted_at, submission_id').all(snapshot.snapshot_id) as Array<{ submission_id: string; unit_id: string; reviewer_id: string; label_json: string; submitted_at: string }>;
  const annotations = rows.map(row => {
    const unit = units.get(row.unit_id) as any, label = JSON.parse(row.label_json) as ReviewLabel;
    if (!unit) throw new Error(`Workspace submission ${row.submission_id} references an unknown unit`);
    return { id: row.submission_id, created_at: row.submitted_at, data: {
      run_id: unit.run_id, message_id: unit.message_id, author: row.reviewer_id, annotator_type: 'human' as const, rubric_version: instrumentVersion,
      category: unit.category, label: label.label, quote: label.quote, reason: label.reason,
      ...(unit.criterion_id ? { criterion_id: unit.criterion_id } : {}), ...(label.score !== undefined ? { score: label.score } : {}), ...(label.relation ? { relation: label.relation } : {}),
    } };
  });
  const adjudications = db.prepare('SELECT adjudication_id, unit_id, adjudicator_id, decision_json, source_submission_ids_json, created_at FROM phase1_adjudications WHERE snapshot_id = ? ORDER BY created_at').all(snapshot.snapshot_id) as Array<{ adjudication_id: string; unit_id: string; adjudicator_id: string; decision_json: string; source_submission_ids_json: string; created_at: string }>;
  for (const row of adjudications) {
    const unit = units.get(row.unit_id) as any, label = JSON.parse(row.decision_json) as ReviewLabel;
    if (!unit) continue;
    annotations.push({ id: row.adjudication_id, created_at: row.created_at, data: {
      run_id: unit.run_id, message_id: unit.message_id, author: row.adjudicator_id, annotator_type: 'human' as const, rubric_version: instrumentVersion,
      category: unit.category, label: label.label, quote: label.quote ?? 'adjudicated workspace decision', reason: label.reason ?? 'Append-only adjudication.',
      ...(unit.criterion_id ? { criterion_id: unit.criterion_id } : {}), ...(label.score !== undefined ? { score: label.score } : {}), ...(label.relation ? { relation: label.relation } : {}), adjudicates: JSON.parse(row.source_submission_ids_json),
    } } as any);
  }
  return annotations as AnnotationRecord[];
}
