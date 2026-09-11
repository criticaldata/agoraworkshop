import { z } from 'zod';

const text = z.string().trim().min(1).max(12000);
export const OutcomeIdSchema = z.enum(['role_fidelity', 'interaction_contingency', 'participation', 'initial_final_change', 'voting_alignment', 'vote_unanimity', 'minority_preservation', 'final_output_fidelity', 'final_output_quality']);
export const EvaluationSchema = z.object({
  version: z.enum(['behavioral-v1', 'behavioral-v2']), status: z.enum(['draft', 'reviewed']),
  probe_attempt_policy: z.literal('single_attempt_no_repair'),
  questionnaire: z.object({
    id: text, version: text,
    questions: z.array(z.object({ id: text, text, options: z.array(text).min(2).max(10) }).strict()).min(1).max(10),
    distance: z.literal('categorical_switch_fraction'),
    confidence_scale: z.literal('0_to_100'),
    response_contract: z.object({ version: z.literal('expressed-position-v1'), ranking: z.literal('complete_options_no_ties'), primary_concern: z.literal('required'), ranking_distance: z.literal('normalized_kendall_inversions') }).strict().optional(),
  }).strict(),
  role_criteria: z.record(z.string(), z.array(z.object({ id: text, description: text, weight: z.number().positive(), max_score: z.literal(2) }).strict()).min(1).max(10)),
  scoring: z.literal('per_reviewer_mean_message_score_then_weighted_criteria'),
  interaction_rubric: text,
  private_instruction: text,
  primary_outcomes: z.array(OutcomeIdSchema).min(1),
  secondary_outcomes: z.array(OutcomeIdSchema).optional(),
  exploratory_outcomes: z.array(OutcomeIdSchema).optional(),
  influence_interpretation: z.literal('exploratory_association_only'),
}).strict().superRefine((e, ctx) => {
  if (e.version === 'behavioral-v1' && (JSON.stringify(e.primary_outcomes) !== JSON.stringify(['role_fidelity', 'interaction_contingency', 'participation', 'initial_final_change']) || e.secondary_outcomes || e.exploratory_outcomes || e.questionnaire.response_contract)) ctx.addIssue({ code: 'custom', message: 'Legacy behavioral-v1 is unchanged; select behavioral-v2 for new instruments/hierarchy' });
  if (e.version === 'behavioral-v2' && (!e.secondary_outcomes || !e.exploratory_outcomes)) ctx.addIssue({ code: 'custom', message: 'behavioral-v2 requires explicit secondary and exploratory outcome arrays' });
  const outcomes = [...e.primary_outcomes, ...(e.secondary_outcomes ?? []), ...(e.exploratory_outcomes ?? [])];
  if (new Set(outcomes).size !== outcomes.length) ctx.addIssue({ code: 'custom', message: 'Each outcome must belong to exactly one family' });
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

/** Explicit draft, never a migration of an existing frozen campaign. */
export function scientificEvaluationDraft(): Evaluation {
  return EvaluationSchema.parse({ ...structuredClone(DRAFT_EVALUATION), version: 'behavioral-v2',
    questionnaire: { ...structuredClone(DRAFT_EVALUATION.questionnaire), version: 'expressed-draft-1', response_contract: { version: 'expressed-position-v1', ranking: 'complete_options_no_ties', primary_concern: 'required', ranking_distance: 'normalized_kendall_inversions' } },
    primary_outcomes: ['role_fidelity'], secondary_outcomes: ['interaction_contingency', 'participation', 'initial_final_change'],
    exploratory_outcomes: ['voting_alignment', 'vote_unanimity', 'minority_preservation', 'final_output_fidelity'],
  });
}
