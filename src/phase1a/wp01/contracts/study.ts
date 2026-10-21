import { z } from 'zod';
import { CONDITION_MATRIX, ConditionSchema, ModelFamilySchema, type Condition, type ConditionId, type ModelFamily } from '../conditions/matrix.js';

export const DEFAULT_PROTOCOL_REVISION = 'phase1a-reimagining-humans-october-draft';

export const ReportNoticeTimingSchema = z.enum(['BEFORE_T0', 'AFTER_T0_BEFORE_PUBLIC', 'NONE', 'UNRESOLVED']);
export type ReportNoticeTiming = z.infer<typeof ReportNoticeTimingSchema>;

const LifecycleSchema = z.enum(['DRAFT', 'REVIEW', 'IMPLEMENTATION_READY', 'SCIENTIFIC_FREEZE_PENDING', 'FROZEN', 'AMENDED']);
export type ProtocolLifecycle = z.infer<typeof LifecycleSchema>;

export const StudyContractSchema = z.object({
  schema_version: z.literal('wp01-study-contract-v1'),
  study_id: z.string().trim().min(1),
  protocol_revision: z.string().trim().min(1),
  lifecycle: LifecycleSchema,
  design_factors: z.object({
    composition: z.literal('specified_group_composition'),
    report_anticipation: z.literal('joint_report_anticipation'),
  }).strict(),
  conditions: z.array(ConditionSchema).length(4),
  participant_slots: z.array(z.enum(['P1', 'P2', 'P3'])).length(3),
  repetitions_per_condition: z.literal(3),
  rounds: z.literal(6),
  agenda: z.object({
    public_rounds: z.literal(6),
    public_opportunities_per_round: z.literal(3),
    private_checkpoints: z.array(z.enum(['T0', 'T6', 'TR'])).min(2),
    report_stages: z.array(z.enum(['DRAFT', 'REVIEW_1', 'REVIEW_2', 'REVISION'])).length(4),
  }).strict(),
  report_policy: z.object({
    no_report_conditions: z.array(z.enum(['A', 'C'])).length(2),
    report_conditions: z.array(z.enum(['B', 'D'])).length(2),
    independent_reviews: z.literal(2),
    revisions: z.literal(1),
    no_early_stopping: z.literal(true),
    notice_timing: ReportNoticeTimingSchema,
  }).strict(),
  moderator_policy: z.object({
    mode: z.literal('deterministic_host'),
    autonomous_llm: z.literal(false),
  }).strict(),
  interaction_policy: z.object({
    tools_enabled: z.literal(false),
    web_access: z.literal(false),
    mandatory_breakouts: z.literal(false),
    early_stopping: z.literal(false),
    role_personas: z.literal(false),
    voting_enabled: z.literal(false),
    external_actions_enabled: z.literal(false),
  }).strict(),
  topology: z.object({
    participants_per_run: z.literal(3),
    public_channel: z.literal(true),
    private_channel: z.literal(true),
    private_outputs_reenter_public_context: z.literal(false),
  }).strict(),
  analysis_units: z.object({
    independent_unit: z.literal('run'),
    nested_units: z.array(z.enum(['participant', 'opportunity', 'message', 'report', 'review'])).min(1),
    repetitions_are_exploratory: z.literal(true),
  }).strict(),
  comparability_rules: z.object({
    same_agenda_across_conditions: z.literal(true),
    same_prompt_namespace_across_conditions: z.literal(true),
    provider_changes_require_new_provenance: z.literal(true),
    report_factor_is_only_intended_substantive_difference: z.literal(true),
  }).strict(),
  source_references: z.array(z.string().trim().min(1)).min(1),
}).strict().superRefine((contract, ctx) => {
  const ids = contract.conditions.map(condition => condition.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['conditions'], message: 'condition IDs must be unique' });
  for (const [left, right] of [['A', 'B'], ['C', 'D']] as const) {
    const a = contract.conditions.find(condition => condition.id === left);
    const b = contract.conditions.find(condition => condition.id === right);
    if (!a || !b || JSON.stringify(a.composition) !== JSON.stringify(b.composition) || a.report_required === b.report_required) {
      ctx.addIssue({ code: 'custom', path: ['conditions'], message: `${left}/${right} must differ only by report_required` });
    }
  }
  if (contract.report_policy.notice_timing !== 'UNRESOLVED' && contract.lifecycle === 'SCIENTIFIC_FREEZE_PENDING') {
    ctx.addIssue({ code: 'custom', path: ['report_policy', 'notice_timing'], message: 'a selected timing remains a candidate until the scientific decision is approved' });
  }
});
export type StudyContract = z.infer<typeof StudyContractSchema>;

export function createStudyContract(): StudyContract {
  return {
    schema_version: 'wp01-study-contract-v1',
    study_id: 'agora-phase1a-reimagining-humans',
    protocol_revision: DEFAULT_PROTOCOL_REVISION,
    lifecycle: 'IMPLEMENTATION_READY',
    design_factors: { composition: 'specified_group_composition', report_anticipation: 'joint_report_anticipation' },
    conditions: CONDITION_MATRIX.map(condition => ({ ...condition, composition: [...condition.composition] })) as [Condition, Condition, Condition, Condition],
    participant_slots: ['P1', 'P2', 'P3'],
    repetitions_per_condition: 3,
    rounds: 6,
    agenda: {
      public_rounds: 6,
      public_opportunities_per_round: 3,
      private_checkpoints: ['T0', 'T6', 'TR'],
      report_stages: ['DRAFT', 'REVIEW_1', 'REVIEW_2', 'REVISION'],
    },
    report_policy: {
      no_report_conditions: ['A', 'C'],
      report_conditions: ['B', 'D'],
      independent_reviews: 2,
      revisions: 1,
      no_early_stopping: true,
      notice_timing: 'UNRESOLVED',
    },
    moderator_policy: { mode: 'deterministic_host', autonomous_llm: false },
    interaction_policy: {
      tools_enabled: false,
      web_access: false,
      mandatory_breakouts: false,
      early_stopping: false,
      role_personas: false,
      voting_enabled: false,
      external_actions_enabled: false,
    },
    topology: {
      participants_per_run: 3,
      public_channel: true,
      private_channel: true,
      private_outputs_reenter_public_context: false,
    },
    analysis_units: {
      independent_unit: 'run',
      nested_units: ['participant', 'opportunity', 'message', 'report', 'review'],
      repetitions_are_exploratory: true,
    },
    comparability_rules: {
      same_agenda_across_conditions: true,
      same_prompt_namespace_across_conditions: true,
      provider_changes_require_new_provenance: true,
      report_factor_is_only_intended_substantive_difference: true,
    },
    source_references: [
      'AGORA Phase 1A Technical-Scientific Blueprint, revised October pilot',
      'AGORA Workshop Technical Architecture and Experimental Protocol v0.9, revised Phase 1A sections',
      'AGORA Phase 1A Technical Implementation Meeting, slides 2-12',
      'AGORA Phase 1A WP01 Full Implementation Mandate, sections 3-8',
    ],
  };
}

export interface PlanningCounts {
  runs: number;
  public_opportunities: number;
  private_elicitation_opportunities: number;
  report_production_invocations: number;
  expected_model_invocations: number;
}

export function expectedPlanningCounts(contract: StudyContract): PlanningCounts {
  const runs = contract.conditions.length * contract.repetitions_per_condition;
  const public_opportunities = runs * contract.rounds * contract.participant_slots.length;
  const noReportRuns = contract.report_policy.no_report_conditions.length * contract.repetitions_per_condition;
  const reportRuns = contract.report_policy.report_conditions.length * contract.repetitions_per_condition;
  const private_elicitation_opportunities = noReportRuns * 2 * contract.participant_slots.length + reportRuns * 3 * contract.participant_slots.length;
  const report_production_invocations = reportRuns * (1 + contract.report_policy.independent_reviews + contract.report_policy.revisions);
  return {
    runs,
    public_opportunities,
    private_elicitation_opportunities,
    report_production_invocations,
    expected_model_invocations: public_opportunities + private_elicitation_opportunities + report_production_invocations,
  };
}

export function validateStudyContract(value: unknown): { valid: boolean; issues: string[] } {
  const parsed = StudyContractSchema.safeParse(value);
  if (!parsed.success) return { valid: false, issues: parsed.error.issues.map(issue => `${issue.path.join('.') || 'contract'}: ${issue.message}`) };
  const issues: string[] = [];
  if (parsed.data.report_policy.notice_timing !== 'UNRESOLVED' && parsed.data.lifecycle !== 'FROZEN') issues.push('selected report notice timing requires an approved frozen contract');
  return { valid: issues.length === 0, issues };
}

export type ParticipantSlot = 'P1' | 'P2' | 'P3';
export type StudyModelFamily = ModelFamily;
export type StudyConditionId = ConditionId;
