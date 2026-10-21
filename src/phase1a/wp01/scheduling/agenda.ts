import { z } from 'zod';
import { conditionById, ConditionIdSchema, type ConditionId } from '../conditions/matrix.js';
import { ReportNoticeTimingSchema, type ReportNoticeTiming, type ParticipantSlot } from '../contracts/study.js';

export const StageKindSchema = z.enum(['private_probe', 'public_opportunity', 'report_production', 'host']);
export const RunStageSchema = z.object({
  id: z.string().min(1),
  kind: StageKindSchema,
  model_invocation: z.boolean(),
  participant_slot: z.enum(['P1', 'P2', 'P3']).nullable(),
  round: z.number().int().min(0).nullable(),
  scope: z.enum(['private', 'public', 'report', 'host']),
}).strict();
export type RunStage = z.infer<typeof RunStageSchema>;

function privateStage(id: string, participant_slot: ParticipantSlot, scope: 'private' | 'report' = 'private'): RunStage {
  return { id, kind: scope === 'report' ? 'report_production' : 'private_probe', model_invocation: true, participant_slot, round: null, scope };
}

function reportStage(id: string): RunStage {
  return { id, kind: 'report_production', model_invocation: true, participant_slot: null, round: null, scope: 'report' };
}

export function buildRunAgenda(conditionId: ConditionId, timing: ReportNoticeTiming): RunStage[] {
  const condition = conditionById(conditionId);
  if (condition.report_required && timing === 'NONE') throw new Error(`report condition ${conditionId} requires a report notice timing`);
  if (!condition.report_required && timing !== 'NONE') throw new Error(`no-report condition ${conditionId} cannot receive a report notice timing`);
  const stages: RunStage[] = [];
  const slots: ParticipantSlot[] = ['P1', 'P2', 'P3'];
  if (condition.report_required && timing === 'BEFORE_T0') stages.push({ id: 'REPORT_NOTICE', kind: 'host', model_invocation: false, participant_slot: null, round: null, scope: 'host' });
  for (const slot of slots) stages.push(privateStage('T0', slot));
  if (condition.report_required && timing === 'AFTER_T0_BEFORE_PUBLIC') stages.push({ id: 'REPORT_NOTICE', kind: 'host', model_invocation: false, participant_slot: null, round: null, scope: 'host' });
  for (let round = 1; round <= 6; round++) {
    for (const slot of slots) stages.push({ id: `PUBLIC_ROUND_${round}`, kind: 'public_opportunity', model_invocation: true, participant_slot: slot, round, scope: 'public' });
  }
  for (const slot of slots) stages.push(privateStage('T6', slot));
  if (condition.report_required) {
    stages.push(reportStage('REPORT_DRAFT'));
    stages.push(reportStage('REPORT_REVIEW_1'));
    stages.push(reportStage('REPORT_REVIEW_2'));
    stages.push(reportStage('REPORT_REVISION'));
    for (const slot of slots) stages.push(privateStage('TR', slot));
  }
  return stages;
}

export function validateRunAgenda(conditionId: ConditionId, timing: ReportNoticeTiming, agenda: readonly RunStage[]): string[] {
  const parsed = z.array(RunStageSchema).safeParse(agenda);
  if (!parsed.success) return parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
  const issues: string[] = [];
  let expected: RunStage[];
  try {
    expected = buildRunAgenda(conditionId, timing);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  if (JSON.stringify(parsed.data) !== JSON.stringify(expected)) issues.push(`agenda does not match the deterministic ${ConditionIdSchema.parse(conditionId)} schedule`);
  if (timing !== 'NONE') ReportNoticeTimingSchema.parse(timing);
  return issues;
}
