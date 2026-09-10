import { z } from 'zod';
import { EvaluationSchema } from './evaluationContract.js';

const text = z.string().trim().min(1).max(12000);
export const RolePackSchema = z.object({
  id: text, version: text, title: text, status: z.enum(['draft', 'reviewed']),
  common_instruction: text, neutral_instruction: text,
  roles: z.array(z.object({ id: text, title: text, instruction: text })).length(5),
  rubric: z.object({ version: text, instructions: text }),
}).strict().superRefine((p, ctx) => {
  if (new Set(p.roles.map(r => r.id)).size !== p.roles.length) ctx.addIssue({ code: 'custom', message: 'role IDs must be unique' });
});
export type RolePack = z.infer<typeof RolePackSchema>;

/** Opt-in only: absent on legacy configurations, with no defaults to alter their hashes. */
export const Phase1ConfigSchema = z.object({
  phase: z.literal('1A'), protocol_id: text, protocol_version: text,
  condition: z.enum(['control', 'treatment']),
  common_instruction: text,
  assignments: z.record(z.string(), z.object({ role_id: text, instruction: text }).strict()),
  opening_message: text,
  evaluation: EvaluationSchema.optional(),
}).strict();

export const STARTER_ROLES: RolePack = {
  id: 'reimagining-humans', version: 'draft-1', title: 'Reimagining Humans', status: 'draft',
  common_instruction: 'Discuss how humans might evolve to coexist better with agents and the living world. Distinguish your proposals, evidence and uncertainties. Respond to what others actually say.',
  neutral_instruction: 'Consider the topic without an assigned specialist perspective. Give reasons for your proposals and acknowledge uncertainty.',
  roles: [
    { id: 'analytic', title: 'Analytic philosophy and history', instruction: 'Use analytic philosophy and the history of ideas as a perspective. Examine assumptions, arguments and precedents; acknowledge their limitations.' },
    { id: 'plural', title: 'Indigenous and non-Western perspectives', instruction: 'Consider relationships, place, community and diverse non-Western knowledge traditions. Avoid claiming to represent any culture or to possess lived experience. State uncertainty and avoid treating a tradition as homogeneous.' },
    { id: 'clinical', title: 'Clinical and practical care', instruction: 'Consider care, avoidable suffering, practical consequences and limits of evidence. Use a clinical perspective without claiming personal bedside experience or professional credentials.' },
    { id: 'design', title: 'Design and aesthetics', instruction: 'Consider form, experience, accessibility and design tradeoffs. Describe design ideas in words; no image tool is available in this experiment.' },
    { id: 'ecological', title: 'Ecological and systems perspectives (proposed)', instruction: 'Consider ecological relationships, feedback, resource constraints, resilience and unintended system effects. Explicitly separate mechanisms from speculation.' },
  ],
  rubric: { version: 'draft-1', instructions: 'Label whether a quoted statement expresses reasoning consistent with the evaluator target perspective: consistent, inconsistent, or not_assessable. Give evidence, not a judgment about the agent\'s inner beliefs. The fifth role is a proposed placeholder. All roles and this rubric require domain review.' },
};
