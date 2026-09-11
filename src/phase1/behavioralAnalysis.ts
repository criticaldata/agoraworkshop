import type { Db } from '../db/index.js';
import { getMessages } from '../db/queries.js';
import { allAnnotations, annotationKey, wasExposed, type AnnotationRecord } from '../semantic/phase1Annotations.js';
import { positionRows, rankingDistance, type PositionAnswer } from './positions.js';
import type { PlannedCase } from './campaign.js';

const VERSION = 'behavioral-outcomes-v1';
function rate(present: number, assessed: number, eligible: number, evidence_ids: string[], source_ids: string[]) {
  return { version: VERSION, numerator: present, denominator: eligible, assessed, missing_or_not_assessable: eligible - assessed,
    value: eligible > 0 && assessed === eligible ? present / eligible : null,
    assessed_only_value: assessed ? present / assessed : null,
    availability: !eligible ? 'no_eligible_units' : assessed === eligible ? 'complete' : 'incomplete_review', evidence_ids, source_ids };
}

export function effectiveAnnotations(records: AnnotationRecord[]) {
  const superseded = new Set(records.flatMap(r => r.data.supersedes ? [r.data.supersedes] : []));
  const active = records.filter(r => !superseded.has(r.id));
  const grouped = new Map<string, AnnotationRecord[]>();
  for (const r of active) { const key = `${r.data.author}:${annotationKey(r.data)}`; grouped.set(key, [...(grouped.get(key) ?? []), r]); }
  return { usable: [...grouped.values()].filter(g => g.length === 1).map(g => g[0]!), conflicts: [...grouped.values()].filter(g => g.length > 1).flat().map(r => r.id), superseded: [...superseded] };
}

export function behavioralMeasures(db: Db, campaignId: string, planned: PlannedCase, runId: string | null) {
  const evaluation = planned.config.phase1?.evaluation;
  if (!evaluation) return { version: VERSION, availability: 'not_configured' as const };
  const records = runId ? positionRows(db, runId) : [];
  const positions = planned.config.participants.map(p => {
    const initial = records.find(r => r.agent_id === p.id && r.phase === 'initial'), final = records.find(r => r.agent_id === p.id && r.phase === 'final');
    const before = initial?.status === 'valid' ? JSON.parse(initial.value_json!) as PositionAnswer : null;
    const after = final?.status === 'valid' ? JSON.parse(final.value_json!) as PositionAnswer : null;
    const questions = evaluation.questionnaire.questions.map(q => {
      const a = before?.answers.find(a => a.question_id === q.id), b = after?.answers.find(a => a.question_id === q.id);
      return { question_id: q.id, initial: a ?? null, final: b ?? null, switched: a && b ? Number(a.choice !== b.choice) : null, confidence_shift: a && b ? b.confidence - a.confidence : null,
        ...(evaluation.questionnaire.response_contract ? { ranking_change: a?.priority_ranking && b?.priority_ranking ? rankingDistance(a.priority_ranking, b.priority_ranking) : null, ranking_interpretation: 'Separate exploratory distance; does not change categorical-switch endpoint.' } : {}) };
    });
    return { agent_id: p.id, initial_record: initial?.record_id ?? null, final_record: final?.record_id ?? null,
      initial_status: initial?.status ?? 'not_recorded', final_status: final?.status ?? 'not_recorded', questions,
      position_change: before && after ? questions.reduce((n, q) => n + q.switched!, 0) / questions.length : null,
      distance: evaluation.questionnaire.distance };
  });
  const messages = runId ? getMessages(db, runId).filter(m => planned.config.participants.some(p => p.id === m.sender_agent_id)) : [];
  const eligible = messages.filter(m => m.workshop_state !== 'INTRODUCTION' && messages.some(prior => prior.sender_agent_id !== m.sender_agent_id && wasExposed(db, m, prior)));
  const all = runId ? allAnnotations(db, campaignId).filter(r => r.data.run_id === runId) : [];
  const effective = effectiveAnnotations(all);
  const reviewers = [...new Set(all.map(r => r.data.author))].map(author => {
    const own = effective.usable.filter(r => r.data.author === author);
    const binary = (category: 'direct_reply' | 'interaction_contingency') => {
      const scored = own.filter(r => r.data.category === category && eligible.some(m => m.message_id === r.data.message_id) && ['present', 'absent'].includes(r.data.label));
      return rate(scored.filter(r => r.data.label === 'present').length, scored.length, eligible.length, scored.map(r => r.id), eligible.map(m => m.message_id));
    };
    const ideas = own.filter(r => r.data.category === 'introduced_idea');
    const eligibleIdeas = ideas.filter(r => { const source = messages.find(m => m.message_id === r.data.message_id)!; return messages.some(m => m.sender_agent_id !== source.sender_agent_id && wasExposed(db, m, source)); });
    const fates = own.filter(r => r.data.category === 'argument_uptake' && eligibleIdeas.some(i => i.id === r.data.idea_annotation_id) && ['present', 'absent'].includes(r.data.label));
    const fidelity = planned.config.participants.map(p => {
      const targetRole = planned.targets[p.id]!, source = messages.filter(m => m.sender_agent_id === p.id);
      const criteria = evaluation.role_criteria[targetRole]!.map(c => {
        const scored = own.filter(r => r.data.category === 'role_criterion' && r.data.criterion_id === c.id && source.some(m => m.message_id === r.data.message_id) && r.data.label === 'scored');
        const total = scored.reduce((n, r) => n + r.data.score!, 0);
        return { criterion_id: c.id, weight: c.weight, max_score: c.max_score, sum_scores: total, assessed_messages: scored.length, eligible_messages: source.length,
          normalized_assessed_mean: scored.length ? total / (c.max_score * scored.length) : null,
          evidence_ids: scored.map(r => r.id), source_ids: source.map(m => m.message_id) };
      });
      const weight = criteria.reduce((n, c) => n + c.weight, 0);
      const assessedValue = criteria.every(c => c.normalized_assessed_mean !== null) ? criteria.reduce((n, c) => n + c.weight * c.normalized_assessed_mean!, 0) / weight : null;
      return { agent_id: p.id, evaluator_target_role: targetRole, criteria, value: criteria.every(c => c.assessed_messages > 0 && c.assessed_messages === c.eligible_messages) ? assessedValue : null, assessed_only_value: assessedValue };
    });
    const edges = own.filter(r => r.data.category === 'interaction_contingency' && r.data.label === 'present').map(r => ({
      annotation_id: r.id, from_message_id: r.data.message_id, to_message_id: r.data.target_message_id!, relation: r.data.relation!,
      from_agent: messages.find(m => m.message_id === r.data.message_id)!.sender_agent_id,
      to_agent: messages.find(m => m.message_id === r.data.target_message_id)?.sender_agent_id ?? planned.config.moderator.id,
    }));
    return { author, role_fidelity: fidelity, interaction_contingency: binary('interaction_contingency'), direct_reply: binary('direct_reply'),
      argument_uptake: { ...rate(fates.filter(r => r.data.label === 'present').length, fates.length, eligibleIdeas.length, fates.map(r => r.id), eligibleIdeas.map(r => r.id)), denominator_note: 'Reviewer-defined introduced-idea inventory with later peer exposure, not an automatically exhaustive inventory.' },
      response_network: edges,
      response_centrality_assessed_only: planned.config.participants.map(p => ({ agent_id: p.id, received: edges.filter(e => e.to_agent === p.id).length, total_edges: edges.length, value: edges.length ? edges.filter(e => e.to_agent === p.id).length / edges.length : null })),
    };
  });
  const counts = planned.config.participants.map(p => messages.filter(m => m.sender_agent_id === p.id).length), total = counts.reduce((a, b) => a + b, 0);
  const meanPositionChange = positions.every(p => p.position_change !== null) ? positions.reduce((n, p) => n + p.position_change!, 0) / positions.length : null;
  return { version: VERSION, availability: 'configured' as const, protocol_status: evaluation.status, positions,
    initial_final_change: { value: meanPositionChange, valid_agent_pairs: positions.filter(p => p.position_change !== null).length, expected_agent_pairs: positions.length, unit: 'run_mean_of_categorical_switch_fractions', source_ids: records.map(r => r.record_id) },
    participation_inequality: { version: VERSION, unit: 'successful_participant_messages', counts, denominator: total, source_ids: messages.map(m => m.message_id),
      gini: total ? counts.reduce((n, a) => n + counts.reduce((s, b) => s + Math.abs(a - b), 0), 0) / (2 * counts.length * total) : null,
      normalized_entropy: total ? -counts.reduce((n, x) => x ? n + (x / total) * Math.log(x / total) : n, 0) / Math.log(counts.length) : null },
    reviewers, annotation_conflicts: effective.conflicts,
    interpretation: 'Position/confidence are expressed states, not hidden beliefs. Scores are separate by reviewer; missing/conflicted review is not absence. Response centrality and uptake are associations, not causal influence. No coalition, consensus, semantic-distance or significance claim is inferred.',
  };
}
