import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { getMessages } from '../db/queries.js';
import { campaign } from '../phase1/campaign.js';

// Human readings extend the existing semantic evidence layer; they never change
// messages, machine extraction edges, or the context shown to workshop agents.
export const AnnotationSchema = z.object({
  run_id: z.string().min(1), message_id: z.string().min(1),
  author: z.string().trim().min(1).max(200), annotator_type: z.literal('human'),
  rubric_version: z.string().min(1),
  category: z.enum(['role_consistency', 'agreement', 'disagreement', 'position_change', 'public_private_difference']),
  label: z.enum(['consistent', 'inconsistent', 'not_assessable', 'present', 'absent']),
  quote: z.string().min(1).max(12000), reason: z.string().trim().min(1).max(12000),
  target_message_id: z.string().min(1).optional(), target_quote: z.string().min(1).max(12000).optional(),
  semantic_node_id: z.string().optional(),
  supersedes: z.string().optional(), adjudicates: z.array(z.string()).max(20).optional(),
}).strict();
export type Annotation = z.infer<typeof AnnotationSchema>;
export interface AnnotationRecord { id: string; created_at: string; data: Annotation; }

export function allAnnotations(db: Db, id: string): AnnotationRecord[] {
  campaign(db, id);
  const rows = db.prepare('SELECT id, created_at, payload_json FROM phase1_annotations WHERE campaign_id = ? ORDER BY created_at, rowid').all(id) as { id: string; created_at: string; payload_json: string }[];
  return rows.map(r => ({ id: r.id, created_at: r.created_at, data: JSON.parse(r.payload_json) as Annotation }));
}

/** Hide colleagues' labels on a source until this reviewer has submitted on it. */
export function reviewerAnnotations(db: Db, id: string, author: string): AnnotationRecord[] {
  const rows = allAnnotations(db, id);
  const submitted = new Set(rows.filter(r => r.data.author === author).map(r => `${r.data.message_id}:${r.data.category}`));
  return rows.filter(r => r.data.author === author || submitted.has(`${r.data.message_id}:${r.data.category}`));
}

export function annotate(db: Db, id: string, raw: unknown): string {
  const { plan, cases } = campaign(db, id), a = AnnotationSchema.parse(raw);
  if (!cases.some(c => c.run_id === a.run_id)) throw new Error('Annotation run is not a campaign case');
  if (a.rubric_version !== plan.input.role_pack.rubric.version) throw new Error('Use the frozen rubric version');
  const messages = getMessages(db, a.run_id);
  const source = messages.find(m => m.message_id === a.message_id);
  if (!source || !source.content.includes(a.quote)) throw new Error('Source quote is not in the named message');
  if (source.sender_agent_id === plan.input.base_config.moderator.id) throw new Error('Annotate participant evidence, not moderator framing');
  if (a.category === 'role_consistency' && !['consistent', 'inconsistent', 'not_assessable'].includes(a.label)) throw new Error('Invalid role consistency label');
  if (a.category !== 'role_consistency' && !['present', 'absent', 'not_assessable'].includes(a.label)) throw new Error('Invalid relation label');
  if (a.category !== 'role_consistency' && (!a.target_message_id || !a.target_quote)) throw new Error('Relational readings require target message and exact quote');
  if (a.target_message_id) {
    const target = messages.find(m => m.message_id === a.target_message_id);
    if (!target || !a.target_quote || !target.content.includes(a.target_quote) || target.message_id === source.message_id) throw new Error('Invalid target evidence');
    if (['agreement', 'disagreement'].includes(a.category) && (target.sender_agent_id === source.sender_agent_id || target.sequence >= source.sequence)) throw new Error('Agreement evidence must refer to an earlier statement by another speaker');
    if (a.category === 'position_change' && (target.sender_agent_id !== source.sender_agent_id || target.sequence >= source.sequence)) throw new Error('Position changes require an earlier statement by the same participant');
    if (a.category === 'public_private_difference' && (target.sender_agent_id !== source.sender_agent_id || target.channel === source.channel)) throw new Error('Public/private comparisons require the same participant on different channels');
  }
  if (a.semantic_node_id && !db.prepare('SELECT 1 FROM semantic_nodes WHERE node_id = ? AND run_id = ?').get(a.semantic_node_id, a.run_id)) throw new Error('Semantic node does not belong to this run');
  const prior = allAnnotations(db, id);
  for (const ref of [...(a.adjudicates ?? []), ...(a.supersedes ? [a.supersedes] : [])]) {
    const original = prior.find(r => r.id === ref);
    if (!original || original.data.message_id !== a.message_id || original.data.category !== a.category) throw new Error('Revision/adjudication must cite readings of this same source and category');
    if (ref === a.supersedes && original.data.author !== a.author) throw new Error('Only the original author can supersede their label; use adjudicates for other reviewers');
  }
  const annotationId = `annotation_${randomUUID()}`;
  db.prepare('INSERT INTO phase1_annotations VALUES (?, ?, ?, ?, ?, ?, ?)').run(annotationId, id, a.run_id, a.message_id, a.author, JSON.stringify(a), new Date().toISOString());
  return annotationId;
}
