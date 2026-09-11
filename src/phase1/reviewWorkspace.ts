import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import type { AuthPrincipal } from '../server/principal.js';
import type { AnnotationRecord } from '../semantic/phase1Annotations.js';
import { verifyDatasetLock } from './scienceStore.js';
import { configHash } from '../config/hash.js';

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

function ensureReviewPackageTable(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS phase1_review_packages (
    package_id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES phase1_dataset_snapshots(snapshot_id) ON DELETE CASCADE,
    manifest_json TEXT NOT NULL, content_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
    UNIQUE(snapshot_id)
  )`);
}

function snapshotPayload(db: Db, snapshotId: string): { snapshot_id: string; campaign_id: string; payload_json: string; content_hash: string; state: string } {
  ensureReviewPackageTable(db);
  const row = db.prepare('SELECT snapshot_id, campaign_id, payload_json, content_hash, state FROM phase1_dataset_snapshots WHERE snapshot_id = ?').get(snapshotId) as { snapshot_id: string; campaign_id: string; payload_json: string; content_hash: string; state: string } | undefined;
  if (!row || row.state !== 'LOCKED' || !verifyDatasetLock(db, snapshotId).valid) throw new Error('Review assignments require a valid locked dataset snapshot');
  return row;
}

function unitsFromSnapshot(payload: any): Array<{ unit_id: string; evidence: BlindedUnit['evidence'] }> {
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

export function reviewAssignments(db: Db, snapshotId: string, reviewerId: string) {
  snapshotPayload(db, snapshotId);
  return db.prepare(`SELECT assignment_id, snapshot_id, reviewer_id, unit_id, status, created_at
    FROM phase1_review_assignments WHERE snapshot_id = ? AND reviewer_id = ? ORDER BY unit_id`)
    .all(snapshotId, reviewerId) as Array<{ assignment_id: string; snapshot_id: string; reviewer_id: string; unit_id: string; status: string; created_at: string }>;
}

export function createHumanValidationPackage(db: Db, snapshotId: string, reviewers: string[]) {
  const snapshot = snapshotPayload(db, snapshotId);
  if (new Set(reviewers).size !== reviewers.length || reviewers.length < 2) throw new Error('At least two distinct reviewers are required');
  const existing = db.prepare('SELECT package_id, manifest_json, content_hash, created_at FROM phase1_review_packages WHERE snapshot_id = ?').get(snapshotId) as { package_id: string; manifest_json: string; content_hash: string; created_at: string } | undefined;
  if (existing) {
    const prior = JSON.parse(existing.manifest_json) as { reviewer_ids?: string[] };
    if (JSON.stringify(prior.reviewer_ids ?? []) !== JSON.stringify([...reviewers].sort())) throw new Error('Human-validation package is already frozen; create a new dataset snapshot for reviewer changes');
    return { package_id: existing.package_id, content_hash: existing.content_hash, manifest: prior };
  }
  const payload = JSON.parse(snapshot.payload_json) as Record<string, any>;
  const units = unitsFromSnapshot(payload);
  const assignments = createReviewAssignments(db, snapshotId, reviewers);
  const base = {
    version: 'agora-human-validation-package-v1', snapshot_id: snapshotId, snapshot_hash: snapshot.content_hash,
    campaign_id: snapshot.campaign_id, reviewer_ids: [...reviewers].sort(), reviewer_count: reviewers.length,
    unit_ids: units.map(unit => unit.unit_id), unit_count: units.length, assignment_count: assignments.length,
    rubric_version: payload.manifest?.input?.role_pack?.rubric?.version ?? 'behavioral-v2',
    codebook_version: 'codebook-v1',
    permitted_evidence_fields: ['message_id', 'content', 'workshop_state', 'channel', 'category', 'criterion_id'],
    excluded_fields: ['condition', 'target_role', 'role_prompt', 'other_reviewer_labels', 'aggregate_effects', 'ballots', 'collective_output'],
    reviewer_instructions: 'Code only the frozen evidence against the supplied rubric. Submit independently; do not infer latent belief, condition or role identity. Use not_assessable when evidence is inadequate. Original labels are immutable; disagreements are adjudicated after independent submission.',
  };
  const content_hash = configHash(base), package_id = `hvp_${content_hash.slice('sha256:'.length, 26)}`;
  const manifest = { ...base, package_id, content_hash };
  db.prepare('INSERT INTO phase1_review_packages (package_id, snapshot_id, manifest_json, content_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(package_id, snapshotId, JSON.stringify(manifest), content_hash, new Date().toISOString());
  return { package_id, content_hash, manifest };
}

export function readHumanValidationPackage(db: Db, snapshotId: string) {
  ensureReviewPackageTable(db);
  const row = db.prepare('SELECT package_id, snapshot_id, manifest_json, content_hash, created_at FROM phase1_review_packages WHERE snapshot_id = ?').get(snapshotId) as { package_id: string; snapshot_id: string; manifest_json: string; content_hash: string; created_at: string } | undefined;
  if (!row) return null;
  const manifest = JSON.parse(row.manifest_json) as Record<string, unknown>;
  if (configHash(Object.fromEntries(Object.entries(manifest).filter(([key]) => !['package_id', 'content_hash'].includes(key)))) !== row.content_hash) throw new Error('Human-validation package hash mismatch');
  return { ...row, manifest };
}

export function blindedReviewProjection(db: Db, assignmentId: string, principal: AuthPrincipal): BlindedUnit {
  const row = db.prepare('SELECT * FROM phase1_review_assignments WHERE assignment_id = ?').get(assignmentId) as { assignment_id: string; snapshot_id: string; reviewer_id: string; unit_id: string; blinded_payload_json: string } | undefined;
  if (!row) throw new Error('Review assignment not found');
  if (row.reviewer_id !== principal.id) throw new Error('Review assignment belongs to another reviewer');
  const evidence = JSON.parse(row.blinded_payload_json) as BlindedUnit['evidence'];
  return { assignment_id: row.assignment_id, snapshot_id: row.snapshot_id, unit_id: row.unit_id, reviewer_id: row.reviewer_id, evidence };
}

export function adjudicationWorkspace(db: Db, snapshotId: string) {
  snapshotPayload(db, snapshotId);
  return listAdjudicationCandidates(db, snapshotId).map(candidateId => {
    const separator = candidateId.indexOf(':'), unitId = candidateId.slice(separator + 1);
    const rows = db.prepare(`SELECT s.submission_id, s.reviewer_id, s.label_json, s.submitted_at,
      a.blinded_payload_json FROM phase1_review_submissions s
      JOIN phase1_review_assignments a ON a.assignment_id = s.assignment_id
      WHERE s.snapshot_id = ? AND s.unit_id = ? ORDER BY s.submitted_at, s.submission_id`)
      .all(snapshotId, unitId) as Array<{ submission_id: string; reviewer_id: string; label_json: string; submitted_at: string; blinded_payload_json: string }>;
    return { candidate_id: candidateId, evidence: rows[0] ? JSON.parse(rows[0].blinded_payload_json) : null,
      submissions: rows.map(row => ({ submission_id: row.submission_id, reviewer_id: row.reviewer_id, label: JSON.parse(row.label_json), submitted_at: row.submitted_at })) };
  });
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
  const reviewers = db.prepare('SELECT DISTINCT reviewer_id FROM phase1_review_submissions WHERE snapshot_id = ? AND unit_id = ?').all(snapshotId, unitId) as Array<{ reviewer_id: string }>;
  if (reviewers.some(row => row.reviewer_id === adjudicator.id)) throw new Error('Adjudicator must be independent of the reviewers');
  const parsed = ReviewLabelSchema.parse(decision);
  const adjudicationId = `adjudication_${randomUUID()}`;
  db.prepare(`INSERT INTO phase1_adjudications
    (adjudication_id, snapshot_id, unit_id, adjudicator_id, decision_json, rationale, source_submission_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(adjudicationId, snapshotId, unitId, adjudicator.id, JSON.stringify(parsed), 'Independent disagreement adjudicated in a separate append-only record.', JSON.stringify(submissions.map(row => row.submission_id)), new Date().toISOString());
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
