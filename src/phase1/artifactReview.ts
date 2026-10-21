import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { campaign } from './campaign.js';
import { assertCampaignUnlocked, initializeScience } from './scienceStore.js';
import { collectiveRecords } from './collective.js';
import { canonicalize } from '../config/hash.js';

const text = z.string().trim().min(1).max(12000);
export const ArtifactReviewSchema = z.object({
  run_id: text, artifact_hash: text, author: text, rubric_version: text, criterion_id: text,
  score: z.number().int().min(0).max(2).nullable(), quote: text, reason: text,
  supersedes: text.optional(), adjudicates: z.array(text).min(2).max(20).optional(),
}).strict();
export function artifactReviews(db: Db, id: string) {
  initializeScience(db);
  return (db.prepare('SELECT id, payload_json, created_at FROM phase1_artifact_reviews WHERE campaign_id = ? ORDER BY rowid').all(id) as { id: string; payload_json: string; created_at: string }[]).map(row => ({ id: row.id, created_at: row.created_at, data: ArtifactReviewSchema.parse(JSON.parse(row.payload_json)) }));
}
export function reviewArtifact(db: Db, id: string, raw: unknown): string {
  return db.transaction(() => {
    assertCampaignUnlocked(db, id);
    const { plan, cases } = campaign(db, id), value = ArtifactReviewSchema.parse(raw), rubric = plan.input.analysis_plan?.artifact_rubric;
    if (!rubric || value.rubric_version !== rubric.version || !rubric.criteria.some(c => c.id === value.criterion_id)) throw new Error('Use a criterion from the frozen S8 human-review rubric');
    if (!cases.some(c => c.run_id === value.run_id)) throw new Error('Artifact run is not a campaign case');
    const output = collectiveRecords(db, value.run_id).output;
    if (!output || output.hash !== value.artifact_hash || !canonicalize(output.artifact).includes(value.quote)) throw new Error('Quote and hash must identify the exact frozen S8 artifact');
    const prior = artifactReviews(db, id);
    for (const ref of [...(value.adjudicates ?? []), ...(value.supersedes ? [value.supersedes] : [])]) {
      const original = prior.find(r => r.id === ref);
      if (!original || original.data.run_id !== value.run_id || original.data.criterion_id !== value.criterion_id || original.data.artifact_hash !== value.artifact_hash) throw new Error('Revision/adjudication must concern this same artifact and criterion');
      if (ref === value.supersedes && original.data.author !== value.author) throw new Error('Only the original reviewer may supersede their label');
    }
    const reviewId = `artifact_review_${randomUUID()}`;
    db.prepare('INSERT INTO phase1_artifact_reviews VALUES (?, ?, ?, ?, ?)').run(reviewId, id, value.run_id, canonicalize(value), new Date().toISOString());
    return reviewId;
  }).immediate();
}
export function visibleArtifactReviews(db: Db, id: string, author: string) {
  const rows = artifactReviews(db, id), submitted = new Set(rows.filter(r => r.data.author === author).map(r => `${r.data.run_id}:${r.data.criterion_id}`));
  return rows.filter(r => r.data.author === author || submitted.has(`${r.data.run_id}:${r.data.criterion_id}`));
}
