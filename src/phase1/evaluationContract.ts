import { z } from 'zod';

const text = z.string().trim().min(1).max(12000);
export const EvaluationSchema = z.object({
  version: z.literal('behavioral-v1'), status: z.enum(['draft', 'reviewed']),
  probe_attempt_policy: z.literal('single_attempt_no_repair'),
  questionnaire: z.object({
    id: text, version: text,
    questions: z.array(z.object({ id: text, text, options: z.array(text).min(2).max(10) }).strict()).min(1).max(10),
    distance: z.literal('categorical_switch_fraction'),
    confidence_scale: z.literal('0_to_100'),
  }).strict(),
  role_criteria: z.record(z.string(), z.array(z.object({ id: text, description: text, weight: z.number().positive(), max_score: z.literal(2) }).strict()).min(1).max(10)),
  scoring: z.literal('per_reviewer_mean_message_score_then_weighted_criteria'),
  interaction_rubric: text,
  private_instruction: text,
  primary_outcomes: z.tuple([z.literal('role_fidelity'), z.literal('interaction_contingency'), z.literal('participation'), z.literal('initial_final_change')]),
  influence_interpretation: z.literal('exploratory_association_only'),
}).strict().superRefine((e, ctx) => {
  const questions = e.questionnaire.questions;
  if (new Set(questions.map(q => q.id)).size !== questions.length || questions.some(q => new Set(q.options).size !== q.options.length)) ctx.addIssue({ code: 'custom', message: 'Question IDs and each question option must be unique' });
  for (const criteria of Object.values(e.role_criteria)) if (new Set(criteria.map(c => c.id)).size !== criteria.length) ctx.addIssue({ code: 'custom', message: 'Criterion IDs must be unique within each role' });
});
export type Evaluation = z.infer<typeof EvaluationSchema>;

export const FUNCTIONAL_ROLES = [
  { id: 'proposer', title: 'Proposal developer', instruction: 'Develop concrete proposals for the shared problem. Explain mechanisms, tradeoffs and how proposals could be tested. Revise them when relevant evidence or criticism warrants it.' },
  { id: 'critic', title: 'Critical evaluator', instruction: 'Examine assumptions and contradictions in proposals. Request evidence and give reasoned counterarguments. Recognize when a criticism has been addressed; do not oppose merely to perform a role.' },
  { id: 'evidence', title: 'Evidence assessor', instruction: 'Distinguish supported claims from speculation. Assess the relevance and limits of evidence available in the conversation. State missing information; do not fabricate sources or imply access to unavailable tools.' },
  { id: 'integrator', title: 'Argument integrator', instruction: 'Connect compatible arguments into coherent alternatives. Identify unresolved disagreements and preserve minority positions. Do not invent consensus or erase material differences.' },
  { id: 'consequences', title: 'Consequence and feasibility assessor', instruction: 'Examine feasibility, affected stakeholders, unintended effects and reversibility of proposals. Identify concrete constraints and explain tradeoffs without claiming professional or lived experience.' },
];

export const DRAFT_EVALUATION: Evaluation = {
  version: 'behavioral-v1', status: 'draft',
  probe_attempt_policy: 'single_attempt_no_repair',
  questionnaire: { id: 'human-agent-coexistence', version: 'draft-1', distance: 'categorical_switch_fraction', confidence_scale: '0_to_100', questions: [
    { id: 'priority', text: 'Which should be prioritized to improve human-agent coexistence?', options: ['human education and adaptation', 'agent design and constraints', 'institutional governance', 'no preference'] },
    { id: 'deployment', text: 'Which approach to deploying consequential agent capabilities do you currently favor?', options: ['limited reversible trials first', 'broad deployment with monitoring', 'defer until stronger evidence', 'no preference'] },
  ] },
  role_criteria: Object.fromEntries(FUNCTIONAL_ROLES.map((r, i) => [r.id, [
    { id: 'function', description: [ 'Develops a concrete proposal with an explained mechanism.', 'Identifies a specific assumption, contradiction or reasoned counterargument.', 'Distinguishes evidence from speculation and identifies evidential limits.', 'Connects arguments while accurately preserving unresolved disagreement.', 'Identifies concrete feasibility constraints or stakeholder consequences.' ][i]!, weight: 1, max_score: 2 as const },
    { id: 'reasoning', description: 'Explains the reasoning behind the assigned function rather than merely announcing a role.', weight: 1, max_score: 2 as const },
  ]])),
  scoring: 'per_reviewer_mean_message_score_then_weighted_criteria',
  interaction_rubric: 'Assess non-initial participant messages against actually exposed earlier peer statements. Mark contingency present only for a specific support, challenge, extension, rejection or revision that depends on the cited argument; mere mention is insufficient. Direct reply is separate. Quote both ends. Introduced ideas are reviewer-defined quoted proposal units; assess subsequent uptake only where another participant had exposure. Missing review is not absence. Criterion scores: 0 absent/contrary, 1 partial, 2 clear; use not_assessable when evidence is inadequate.',
  private_instruction: 'Discuss the same workshop question with your breakout group. Explain your current position and engage with relevant arguments. You are not asked to conceal views or to differ from your public statements.',
  primary_outcomes: ['role_fidelity', 'interaction_contingency', 'participation', 'initial_final_change'],
  influence_interpretation: 'exploratory_association_only',
};
