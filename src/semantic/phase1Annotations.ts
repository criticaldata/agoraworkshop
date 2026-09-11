import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { getMessages, getInvocation } from '../db/queries.js';
import type { StoredMessage } from '../orchestrator/visibility.js';
import { campaign } from '../phase1/campaign.js';
import { assertCampaignUnlocked } from '../phase1/scienceStore.js';

// Human readings extend the existing semantic evidence layer; they never change
// messages, machine extraction edges, or the context shown to workshop agents.
export const AnnotationSchema = z.object({
  run_id: z.string().min(1), message_id: z.string().min(1),
  author: z.string().trim().min(1).max(200), annotator_type: z.literal('human'),
  rubric_version: z.string().min(1),
  category: z.enum(['role_consistency', 'agreement', 'disagreement', 'position_change', 'public_private_difference', 'role_criterion', 'direct_reply', 'interaction_contingency', 'introduced_idea', 'argument_uptake']),
  label: z.enum(['consistent', 'inconsistent', 'not_assessable', 'present', 'absent', 'scored']),
  quote: z.string().min(1).max(12000), reason: z.string().trim().min(1).max(12000),
  target_message_id: z.string().min(1).optional(), target_quote: z.string().min(1).max(12000).optional(),
  semantic_node_id: z.string().optional(),
  criterion_id: z.string().min(1).optional(), score: z.number().int().min(0).max(2).nullable().optional(),
  relation: z.enum(['supports', 'challenges', 'extends', 'rejects', 'revises']).optional(),
  idea_annotation_id: z.string().min(1).optional(),
  supersedes: z.string().optional(), adjudicates: z.array(z.string()).max(20).optional(),
}).strict();
export type Annotation = z.infer<typeof AnnotationSchema>;
export interface AnnotationRecord { id: string; created_at: string; data: Annotation; }

export function annotationKey(a: Annotation): string {
  return JSON.stringify([a.message_id, a.category, a.criterion_id ?? '', a.idea_annotation_id ?? '', a.category === 'introduced_idea' ? a.quote : '']);
}

export function wasExposed(db: Db, later: StoredMessage, earlier: StoredMessage): boolean {
  if (later.sequence <= earlier.sequence || !later.source_invocation_id) return false;
  const invocation = getInvocation(db, later.source_invocation_id);
  return !!invocation && (JSON.parse(invocation.context_message_ids) as string[]).includes(earlier.message_id);
}

export function allAnnotations(db: Db, id: string): AnnotationRecord[] {
  campaign(db, id);
  const rows = db.prepare('SELECT id, created_at, payload_json FROM phase1_annotations WHERE campaign_id = ? ORDER BY created_at, rowid').all(id) as { id: string; created_at: string; payload_json: string }[];
  return rows.map(r => ({ id: r.id, created_at: r.created_at, data: JSON.parse(r.payload_json) as Annotation }));
}

/** Hide colleagues' labels on a source until this reviewer has submitted on it. */
export function reviewerAnnotations(db: Db, id: string, author: string): AnnotationRecord[] {
  const rows = allAnnotations(db, id);
  const submitted = new Set(rows.filter(r => r.data.author === author).map(r => annotationKey(r.data)));
  return rows.filter(r => r.data.author === author || submitted.has(annotationKey(r.data)));
}

export function annotate(db: Db, id: string, raw: unknown): string {
  return db.transaction(() => {
  assertCampaignUnlocked(db, id);
  const { plan, cases } = campaign(db, id), a = AnnotationSchema.parse(raw);
  if (!cases.some(c => c.run_id === a.run_id)) throw new Error('Annotation run is not a campaign case');
  if (a.rubric_version !== plan.input.role_pack.rubric.version) throw new Error('Use the frozen rubric version');
  const messages = getMessages(db, a.run_id);
  const source = messages.find(m => m.message_id === a.message_id);
  if (!source || !source.content.includes(a.quote)) throw new Error('Source quote is not in the named message');
  if (source.sender_agent_id === plan.input.base_config.moderator.id) throw new Error('Annotate participant evidence, not moderator framing');
  if (a.category === 'role_consistency' && !['consistent', 'inconsistent', 'not_assessable'].includes(a.label)) throw new Error('Invalid role consistency label');
  const extended = ['role_criterion', 'direct_reply', 'interaction_contingency', 'introduced_idea', 'argument_uptake'].includes(a.category);
  if (extended && !plan.input.evaluation) throw new Error('This category requires a frozen behavioral evaluation protocol');
  if (!['role_consistency', 'role_criterion'].includes(a.category) && !['present', 'absent', 'not_assessable'].includes(a.label)) throw new Error('Invalid relation label');
  if (a.category === 'role_criterion') {
    const target = plan.cases.find(c => c.id === cases.find(c => c.run_id === a.run_id)!.case_id)!.targets[source.sender_agent_id]!;
    const criterion = plan.input.evaluation!.role_criteria[target]?.find(c => c.id === a.criterion_id);
    if (!criterion || (a.label === 'scored' ? typeof a.score !== 'number' : a.label !== 'not_assessable' || a.score !== null)) throw new Error('Use a frozen target-role criterion with label scored and score 0–2, or not_assessable with null score');
  } else if (a.criterion_id !== undefined || a.score !== undefined) throw new Error('Scores belong only to role_criterion readings');
  if (['direct_reply', 'interaction_contingency'].includes(a.category) && source.workshop_state === 'INTRODUCTION') throw new Error('Interaction outcomes exclude initial messages');
  if (['direct_reply', 'interaction_contingency'].includes(a.category) && !messages.some(m => m.sender_agent_id !== source.sender_agent_id && m.sender_agent_id !== plan.input.base_config.moderator.id && wasExposed(db, source, m))) throw new Error('No earlier peer content was exposed to this message');
  if (a.category === 'interaction_contingency' && a.label === 'present' && !a.relation) throw new Error('Specify the substantive interaction relation');
  if (a.category === 'introduced_idea' && a.label !== 'present') throw new Error('An introduced idea record identifies a quoted proposal unit');
  const requiresTarget = !['role_consistency', 'role_criterion', 'introduced_idea'].includes(a.category) && (!extended || a.label === 'present');
  if (requiresTarget && (!a.target_message_id || !a.target_quote)) throw new Error('Relational readings require target message and exact quote');
  if (!!a.target_message_id !== !!a.target_quote) throw new Error('Supply target ID and quote together');
  if (a.category === 'argument_uptake') {
    const idea = allAnnotations(db, id).find(r => r.id === a.idea_annotation_id);
    if (!idea || idea.data.category !== 'introduced_idea' || idea.data.author !== a.author || idea.data.message_id !== a.message_id || idea.data.quote !== a.quote) throw new Error('Uptake must assess this reviewer’s introduced-idea record on the same source and quote');
  } else if (a.idea_annotation_id) throw new Error('Idea reference belongs only to argument_uptake');
  if (a.target_message_id) {
    const target = messages.find(m => m.message_id === a.target_message_id);
    if (!target || !a.target_quote || !target.content.includes(a.target_quote) || target.message_id === source.message_id) throw new Error('Invalid target evidence');
    if (['agreement', 'disagreement'].includes(a.category) && (target.sender_agent_id === source.sender_agent_id || target.sequence >= source.sequence)) throw new Error('Agreement evidence must refer to an earlier statement by another speaker');
    if (a.category === 'position_change' && (target.sender_agent_id !== source.sender_agent_id || target.sequence >= source.sequence)) throw new Error('Position changes require an earlier statement by the same participant');
    if (a.category === 'public_private_difference' && (target.sender_agent_id !== source.sender_agent_id || target.channel === source.channel)) throw new Error('Public/private comparisons require the same participant on different channels');
    if (['direct_reply', 'interaction_contingency', 'agreement', 'disagreement'].includes(a.category) && (target.sender_agent_id === source.sender_agent_id || !wasExposed(db, source, target))) throw new Error('Reply evidence must be an earlier other-agent statement actually exposed to the source invocation');
    if (['direct_reply', 'interaction_contingency'].includes(a.category) && target.sender_agent_id === plan.input.base_config.moderator.id) throw new Error('Primary interaction outcomes exclude moderator targets');
    if (a.category === 'argument_uptake' && (target.sender_agent_id === source.sender_agent_id || target.sender_agent_id === plan.input.base_config.moderator.id || !wasExposed(db, target, source))) throw new Error('Uptake evidence must be a later other-participant statement with recorded exposure to the introduced idea');
  }
  if (a.semantic_node_id && !db.prepare('SELECT 1 FROM semantic_nodes WHERE node_id = ? AND run_id = ?').get(a.semantic_node_id, a.run_id)) throw new Error('Semantic node does not belong to this run');
  const prior = allAnnotations(db, id);
  for (const ref of [...(a.adjudicates ?? []), ...(a.supersedes ? [a.supersedes] : [])]) {
    const original = prior.find(r => r.id === ref);
    if (!original || annotationKey(original.data) !== annotationKey(a)) throw new Error('Revision/adjudication must cite readings of this same source, category and criterion/idea');
    if (ref === a.supersedes && original.data.author !== a.author) throw new Error('Only the original author can supersede their label; use adjudicates for other reviewers');
  }
  const annotationId = `annotation_${randomUUID()}`;
  db.prepare('INSERT INTO phase1_annotations VALUES (?, ?, ?, ?, ?, ?, ?)').run(annotationId, id, a.run_id, a.message_id, a.author, JSON.stringify(a), new Date().toISOString());
  return annotationId;
  }).immediate();
}
