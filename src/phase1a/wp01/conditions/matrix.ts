import { z } from 'zod';

export const MODEL_FAMILIES = ['GEMMA', 'GEMINI', 'MODEL_X'] as const;
export const ModelFamilySchema = z.enum(MODEL_FAMILIES);
export type ModelFamily = z.infer<typeof ModelFamilySchema>;
export const ModelFamilyReferenceSchema = z.object({ family: ModelFamilySchema }).strict();
export type ModelFamilyReference = z.infer<typeof ModelFamilyReferenceSchema>;

export const CONDITION_IDS = ['A', 'B', 'C', 'D'] as const;
export const ConditionIdSchema = z.enum(CONDITION_IDS);
export type ConditionId = z.infer<typeof ConditionIdSchema>;

export const ConditionSchema = z.object({
  id: ConditionIdSchema,
  composition: z.array(ModelFamilySchema).length(3),
  report_required: z.boolean(),
}).strict();
export type Condition = z.infer<typeof ConditionSchema>;

export const CONDITION_MATRIX: readonly Condition[] = [
  { id: 'A', composition: ['GEMMA', 'GEMMA', 'GEMMA'], report_required: false },
  { id: 'B', composition: ['GEMMA', 'GEMMA', 'GEMMA'], report_required: true },
  { id: 'C', composition: ['GEMMA', 'GEMINI', 'MODEL_X'], report_required: false },
  { id: 'D', composition: ['GEMMA', 'GEMINI', 'MODEL_X'], report_required: true },
];

export function conditionById(id: ConditionId): Condition {
  return CONDITION_MATRIX.find(condition => condition.id === id)!;
}

export function validateConditionMatrix(conditions: readonly Condition[] = CONDITION_MATRIX): string[] {
  const issues: string[] = [];
  const parsed = z.array(ConditionSchema).safeParse(conditions);
  if (!parsed.success) return parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
  if (parsed.data.length !== 4) issues.push('condition matrix must contain exactly four conditions');
  if (new Set(parsed.data.map(condition => condition.id)).size !== parsed.data.length) issues.push('condition IDs must be unique');
  for (const [left, right] of [['A', 'B'], ['C', 'D']] as const) {
    const a = parsed.data.find(condition => condition.id === left);
    const b = parsed.data.find(condition => condition.id === right);
    if (!a || !b || JSON.stringify(a.composition) !== JSON.stringify(b.composition) || a.report_required === b.report_required) {
      issues.push(`${left}/${right} must differ only by report_required`);
    }
  }
  return issues;
}
