import { z } from 'zod';
import { configHash } from '../../../config/hash.js';
import { CONDITION_MATRIX, ConditionIdSchema, ModelFamilySchema, type ConditionId } from '../conditions/matrix.js';
import { createDefaultDecisionRegister, DecisionRegisterSchema, type DecisionRegister } from '../contracts/decisions.js';
import { StudyContractSchema, createStudyContract, expectedPlanningCounts, type ReportNoticeTiming, type StudyContract } from '../contracts/study.js';
import { createSyntheticDeploymentBinding, DeploymentBindingSchema, validateDeploymentBinding, type DeploymentBinding } from '../deployments/bindings.js';
import { buildRunAgenda, RunStageSchema, validateRunAgenda, type RunStage } from '../scheduling/agenda.js';
import { createPromptRegistry, PromptRegistrySchema, validatePromptRegistry, type PromptRegistry } from '../prompts/registry.js';

const TimingSchema = z.enum(['BEFORE_T0', 'AFTER_T0_BEFORE_PUBLIC']);

const BoundDeploymentSchema = DeploymentBindingSchema.extend({ participant_slot: z.enum(['P1', 'P2', 'P3']) }).strict();
export type BoundDeployment = z.infer<typeof BoundDeploymentSchema>;

const RunExpectedCountsSchema = z.object({
  public_opportunities: z.literal(18),
  private_elicitation_opportunities: z.union([z.literal(6), z.literal(9)]),
  report_production_invocations: z.union([z.literal(0), z.literal(4)]),
  expected_model_invocations: z.union([z.literal(24), z.literal(31)]),
}).strict();
export type RunExpectedCounts = z.infer<typeof RunExpectedCountsSchema>;

export const RunManifestSchema = z.object({
  schema_version: z.literal('wp01-run-manifest-v1'),
  run_id: z.string().min(1),
  campaign_id: z.string().min(1),
  condition_id: ConditionIdSchema,
  replicate: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  participant_slots: z.tuple([z.literal('P1'), z.literal('P2'), z.literal('P3')]),
  order_policy: z.literal('candidate_fixed_cyclic'),
  order: z.tuple([z.literal('P1'), z.literal('P2'), z.literal('P3')]),
  report_required: z.boolean(),
  report_notice_timing: z.enum(['BEFORE_T0', 'AFTER_T0_BEFORE_PUBLIC', 'NONE']),
  report_allocation_policy: z.literal('UNRESOLVED'),
  bindings: z.array(BoundDeploymentSchema).length(3),
  prompt_registry_namespace: z.literal('phase1a-reimagining-humans-candidate'),
  prompt_registry_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  agenda: z.array(RunStageSchema).min(1),
  expected_counts: RunExpectedCountsSchema,
  config_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  manifest_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
}).strict();
export type RunManifest = z.infer<typeof RunManifestSchema>;

export const CampaignManifestSchema = z.object({
  schema_version: z.literal('wp01-campaign-manifest-v1'),
  campaign_id: z.string().min(1),
  profile: z.enum(['draft', 'synthetic', 'scientific']),
  lifecycle: z.enum(['DRAFT', 'IMPLEMENTATION_READY', 'SCIENTIFIC_FREEZE_PENDING', 'FROZEN']),
  freeze_status: z.enum(['SCIENTIFIC_FREEZE_PENDING', 'FROZEN']),
  study_contract: StudyContractSchema,
  study_contract_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  decision_register: DecisionRegisterSchema,
  decision_register_ref: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  prompt_registry: PromptRegistrySchema,
  prompt_registry_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  planning_counts: z.object({
    runs: z.literal(12),
    public_opportunities: z.literal(216),
    private_elicitation_opportunities: z.literal(90),
    report_production_invocations: z.literal(24),
    expected_model_invocations: z.literal(330),
  }).strict(),
  runs: z.array(RunManifestSchema).length(12),
  source_references: z.array(z.string().min(1)).min(1),
  campaign_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
}).strict();
export type CampaignManifest = z.infer<typeof CampaignManifestSchema>;

function runHashPayload(run: RunManifest | Omit<RunManifest, 'manifest_hash'>): Omit<RunManifest, 'manifest_hash'> {
  const { manifest_hash: _manifest_hash, ...payload } = run as RunManifest;
  return payload;
}

function configHashPayload(run: Omit<RunManifest, 'manifest_hash'>): unknown {
  return {
    condition_id: run.condition_id,
    replicate: run.replicate,
    order_policy: run.order_policy,
    order: run.order,
    report_required: run.report_required,
    report_notice_timing: run.report_notice_timing,
    report_allocation_policy: run.report_allocation_policy,
    bindings: run.bindings,
    prompt_registry_namespace: run.prompt_registry_namespace,
    prompt_registry_hash: run.prompt_registry_hash,
    agenda: run.agenda,
  };
}

function campaignHashPayload(campaign: CampaignManifest): Omit<CampaignManifest, 'campaign_hash'> {
  const { campaign_hash: _campaign_hash, ...payload } = campaign;
  return payload;
}

function runExpectedCounts(report_required: boolean): RunExpectedCounts {
  return report_required
    ? { public_opportunities: 18, private_elicitation_opportunities: 9, report_production_invocations: 4, expected_model_invocations: 31 }
    : { public_opportunities: 18, private_elicitation_opportunities: 6, report_production_invocations: 0, expected_model_invocations: 24 };
}

export interface SyntheticCampaignOptions {
  report_notice_timing: z.infer<typeof TimingSchema>;
}

export function buildSyntheticCampaign(options: SyntheticCampaignOptions): CampaignManifest {
  TimingSchema.parse(options.report_notice_timing);
  const study_contract = createStudyContract();
  const decision_register = createDefaultDecisionRegister();
  const prompt_registry = createPromptRegistry();
  const campaign_id = `agora-phase1a-synthetic-${options.report_notice_timing.toLowerCase()}`;
  const runs: RunManifest[] = [];
  for (const condition of CONDITION_MATRIX) {
    for (const replicate of [1, 2, 3] as const) {
      const report_notice_timing: RunManifest['report_notice_timing'] = condition.report_required ? options.report_notice_timing : 'NONE';
      const bindings: BoundDeployment[] = condition.composition.map((logical_family, index) => ({
        participant_slot: (['P1', 'P2', 'P3'] as const)[index]!,
        ...createSyntheticDeploymentBinding(logical_family, `${condition.id}-r${replicate}`),
      }));
      const agenda = buildRunAgenda(condition.id, report_notice_timing);
      const runWithoutHash: Omit<RunManifest, 'manifest_hash'> = {
        schema_version: 'wp01-run-manifest-v1',
        run_id: `${campaign_id}-${condition.id}-r${replicate}`,
        campaign_id,
        condition_id: condition.id,
        replicate,
        participant_slots: ['P1', 'P2', 'P3'],
        order_policy: 'candidate_fixed_cyclic',
        order: ['P1', 'P2', 'P3'],
        report_required: condition.report_required,
        report_notice_timing,
        report_allocation_policy: 'UNRESOLVED',
        bindings,
        prompt_registry_namespace: prompt_registry.namespace,
        prompt_registry_hash: prompt_registry.registry_hash,
        agenda,
        expected_counts: runExpectedCounts(condition.report_required),
        config_hash: configHash(configHashPayload({
          ...({} as Omit<RunManifest, 'manifest_hash'>),
          condition_id: condition.id,
          replicate,
          order_policy: 'candidate_fixed_cyclic',
          order: ['P1', 'P2', 'P3'],
          report_required: condition.report_required,
          report_notice_timing,
          report_allocation_policy: 'UNRESOLVED',
          bindings,
          prompt_registry_namespace: prompt_registry.namespace,
          prompt_registry_hash: prompt_registry.registry_hash,
          agenda,
          schema_version: 'wp01-run-manifest-v1',
          run_id: `${campaign_id}-${condition.id}-r${replicate}`,
          campaign_id,
          participant_slots: ['P1', 'P2', 'P3'],
          expected_counts: runExpectedCounts(condition.report_required),
          config_hash: 'sha256:' + '0'.repeat(64),
        })),
      };
      runs.push({ ...runWithoutHash, manifest_hash: configHash(runHashPayload(runWithoutHash)) });
    }
  }
  const counts = expectedPlanningCounts(study_contract) as CampaignManifest['planning_counts'];
  const campaignWithoutHash: Omit<CampaignManifest, 'campaign_hash'> = {
    schema_version: 'wp01-campaign-manifest-v1',
    campaign_id,
    profile: 'synthetic',
    lifecycle: 'IMPLEMENTATION_READY',
    freeze_status: 'SCIENTIFIC_FREEZE_PENDING',
    study_contract,
    study_contract_hash: configHash(study_contract),
    decision_register,
    decision_register_ref: configHash(decision_register),
    prompt_registry,
    prompt_registry_hash: prompt_registry.registry_hash,
    planning_counts: counts,
    runs,
    source_references: [
      'WP01 synthetic fixture: no provider calls or runtime records are generated',
      'AGORA Phase 1A revised October pilot',
    ],
  };
  return { ...campaignWithoutHash, campaign_hash: configHash(campaignWithoutHash) };
}

export function validateCampaignManifest(value: unknown): { valid: boolean; issues: string[] } {
  const parsed = CampaignManifestSchema.safeParse(value);
  if (!parsed.success) return { valid: false, issues: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) };
  const campaign = parsed.data;
  const issues: string[] = [];
  const studyResult = StudyContractSchema.safeParse(campaign.study_contract);
  if (!studyResult.success) issues.push('study contract failed schema validation');
  const promptResult = validatePromptRegistry(campaign.prompt_registry);
  if (!promptResult.valid) issues.push(...promptResult.issues.map(issue => `prompt registry: ${issue}`));
  if (campaign.study_contract_hash !== configHash(campaign.study_contract)) issues.push('study contract hash mismatch');
  if (campaign.decision_register_ref !== configHash(campaign.decision_register)) issues.push('decision register hash mismatch');
  if (campaign.prompt_registry_hash !== campaign.prompt_registry.registry_hash) issues.push('prompt registry reference mismatch');
  if (campaign.campaign_hash !== configHash(campaignHashPayload(campaign))) issues.push('campaign hash mismatch');
  const expectedCounts = expectedPlanningCounts(campaign.study_contract);
  if (JSON.stringify(expectedCounts) !== JSON.stringify(campaign.planning_counts)) issues.push('planning counts do not match the study contract');
  const expectedIds = new Set<string>();
  for (const run of campaign.runs) {
    const condition = CONDITION_MATRIX.find(candidate => candidate.id === run.condition_id)!;
    if (!condition) { issues.push(`unknown condition: ${run.condition_id}`); continue; }
    const expectedId = `${campaign.campaign_id}-${run.condition_id}-r${run.replicate}`;
    expectedIds.add(expectedId);
    if (run.run_id !== expectedId) issues.push(`run ID mismatch: ${run.run_id}`);
    if (run.report_required !== condition.report_required) issues.push(`report assignment mismatch: ${run.run_id}`);
    if (JSON.stringify(run.bindings.map(binding => binding.logical_family)) !== JSON.stringify(condition.composition)) issues.push(`composition mismatch: ${run.run_id}`);
    const agendaIssues = validateRunAgenda(run.condition_id, run.report_notice_timing, run.agenda);
    issues.push(...agendaIssues.map(issue => `${run.run_id}: ${issue}`));
    if (run.manifest_hash !== configHash(runHashPayload(run))) issues.push(`run manifest hash mismatch: ${run.run_id}`);
    if (run.config_hash !== configHash(configHashPayload(runHashPayload(run)))) issues.push(`run config hash mismatch: ${run.run_id}`);
    for (const binding of run.bindings) {
      const { participant_slot: _participant_slot, ...bindingWithoutSlot } = binding;
      const result = validateDeploymentBinding(bindingWithoutSlot, campaign.profile === 'scientific' ? 'scientific' : campaign.profile === 'synthetic' ? 'synthetic' : 'draft');
      if (!result.valid) issues.push(...result.issues.map(issue => `${run.run_id}: ${issue}`));
    }
  }
  if (new Set(campaign.runs.map(run => run.run_id)).size !== campaign.runs.length) issues.push('run IDs must be unique');
  if (campaign.profile === 'scientific' && campaign.freeze_status !== 'FROZEN') issues.push('scientific profile requires FROZEN freeze_status');
  if (campaign.profile === 'scientific' && campaign.study_contract.lifecycle !== 'FROZEN') issues.push('scientific profile requires a frozen study contract');
  if (campaign.profile === 'scientific' && campaign.study_contract.report_policy.notice_timing === 'UNRESOLVED') issues.push('scientific profile requires a resolved report notice timing');
  if (expectedIds.size !== 12) issues.push('campaign must contain twelve distinct condition/replicate IDs');
  return { valid: issues.length === 0, issues };
}
