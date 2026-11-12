import { z } from 'zod';
import { implementationHash } from './provenance.js';
import { configHash } from '../../config/hash.js';
import { buildSyntheticCampaign, QWEN_CONDITION_MATRIX, createPilotPromptRegistry, CampaignManifestSchema, validateCampaignManifest, validateDeploymentBinding, type CampaignManifest, configHashPayload, runHashPayload, campaignHashPayload } from '../wp01/index.js';
import { adaptWp01Run } from '../wp02/adapter.js';
import { REPORT_CODEBOOK, REPORT_CODEBOOK_HASH } from '../wp06/codebook.js';

const approvalSchema = z.object({
  role: z.enum(['scientific', 'infrastructure', 'reconstruction']),
  reviewer: z.string().trim().min(1),
  approved_at: z.string().datetime(),
  plan_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  evidence_ref: z.string().trim().min(1),
}).strict();
export const ExperimentPlanSchema = z.object({
  schema_version: z.literal('phase1a-experiment-plan-v1'),
  campaign: CampaignManifestSchema,
  implementation_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  scientific_reviewer: z.string().trim().min(1),
  topic: z.string().trim().min(1),
  limits: z.object({ maxCalls: z.number().int().min(31), maxTokens: z.number().int().positive(), maxRetries: z.number().int().min(0).max(2) }).strict(),
  timeout_ms: z.number().int().min(1000).max(600000),
  execution_order: z.array(z.string()).length(12),
  endpoints: z.array(z.object({
    provider: z.string().min(1),
    endpoint_ref: z.string().regex(/^env:[A-Z][A-Z0-9_]+$/),
    expected_url: z.string().url().nullable(),
    credential_env: z.string().regex(/^[A-Z][A-Z0-9_]+$/).nullable(),
    transport: z.literal('chat-completions'),
  }).strict()).length(3),
  analysis: z.object({
    codebook_hash: z.literal(REPORT_CODEBOOK_HASH),
    codebook: z.unknown(),
    independent_unit: z.literal('run'),
    inference: z.literal('exploratory_descriptive_only'),
    replay_trials: z.literal(0),
    wild_west: z.literal(false),
    missingness: z.literal('retain_all_planned_runs_no_automatic_replacement'),
    calibration_evidence_ref: z.string().nullable(),
    reviewers: z.array(z.string().min(1)),
  }).strict(),
  data_policy: z.object({
    operator: z.string().min(1),
    storage_location: z.string().nullable(),
    backup_location: z.string().nullable(),
    retention: z.string().nullable(),
    access: z.literal('named_operators_only_no_public_raw_exports'),
  }).strict(),
  decision_proposals: z.record(z.string(), z.string().min(1)),
  approvals: z.array(approvalSchema),
  plan_hash: z.string(),
}).strict();
export type ExperimentPlan = z.infer<typeof ExperimentPlanSchema>;

export function sealCampaign(campaign: CampaignManifest): CampaignManifest {
  const c = structuredClone(campaign);
  c.study_contract_hash = configHash(c.study_contract);
  c.decision_register_ref = configHash(c.decision_register);
  c.prompt_registry_hash = c.prompt_registry.registry_hash;
  for (const run of c.runs) {
    run.campaign_id = c.campaign_id;
    run.run_id = `${c.campaign_id}-${run.condition_id}-r${run.replicate}`;
    run.prompt_registry_hash = c.prompt_registry_hash;
    run.config_hash = configHash(configHashPayload(run));
    run.manifest_hash = configHash(runHashPayload(run));
  }
  c.campaign_hash = configHash(campaignHashPayload(c));
  return c;
}

export function planHash(plan: ExperimentPlan): string {
  const { approvals: _, plan_hash: __, ...payload } = plan;
  return configHash(payload);
}

export function createExperimentProposal(): ExperimentPlan {
  let campaign = buildSyntheticCampaign({ report_notice_timing: 'AFTER_T0_BEFORE_PUBLIC' });
  campaign.campaign_id = 'agora-phase1a-qwen-pilot-20261112';
  campaign.study_contract.protocol_revision = 'phase1a-qwen-pilot-20261112';
  campaign.study_contract.composition_variant = 'gemma-qwen-model-x-v1';
  campaign.study_contract.conditions = structuredClone([...QWEN_CONDITION_MATRIX]);
  campaign.source_references.push('Simon selected Qwen on 2026-11-12; replaces Gemini in this proposed variant, pending Mateo scientific approval.');
  const deploymentDecision = campaign.decision_register.decisions.find(d => d.id === 'D02')!;
  deploymentDecision.question = 'Which exact deployments instantiate GEMMA and QWEN in the proposed Qwen variant?';
  deploymentDecision.current_evidence = 'Simon selected Qwen on 2026-11-12. This model-selection direction is not scientific protocol approval.';
  campaign.profile = 'draft';
  campaign.prompt_registry = createPilotPromptRegistry();
  campaign.lifecycle = 'SCIENTIFIC_FREEZE_PENDING';
  for (const run of campaign.runs) {
    run.report_allocation_policy = run.report_required ? 'COUNTERBALANCED_ROTATION' : 'NONE';
    for (const binding of run.bindings) {
      if (binding.logical_family === 'GEMINI') binding.logical_family = 'QWEN';
      binding.provider = `nvidia_${binding.logical_family.toLowerCase()}`;
      binding.model_id = null;
      binding.endpoint_ref = `env:AGORA_${binding.logical_family}_URL`;
      binding.deployment_id = null;
      binding.revision = null;
      binding.hosting = 'unknown';
      binding.source = 'unresolved';
      binding.parameters = { temperature: 0.7, top_p: 1, max_tokens: 1024 };
      if (binding.logical_family === 'QWEN') {
        binding.model_id = 'qwen3:32b';
        binding.revision = 'sha256:030ee887880fc378860c2dd35101da424377520441ae4bfe7be6deff8ade7840';
        binding.hosting = 'local';
        binding.source = 'real';
        // Verified cached Q4_K_M artifact. A dedicated endpoint/canary is still required.
      }
    }
  }
  campaign = sealCampaign(campaign);
  const plan: ExperimentPlan = {
    schema_version: 'phase1a-experiment-plan-v1', campaign, implementation_hash: implementationHash(), scientific_reviewer: 'Mateo',
    topic: 'Which human limitations should societies address, what changes could address them, and what role and limits should AI agents have?',
    limits: { maxCalls: 62, maxTokens: 500000, maxRetries: 1 }, timeout_ms: 120000,
    execution_order: [1, 2, 3].flatMap(r => ['A', 'B', 'C', 'D'].map(c => `${campaign.campaign_id}-${c}-r${r}`)),
    endpoints: ['GEMMA', 'QWEN', 'MODEL_X'].map(family => ({
      provider: `nvidia_${family.toLowerCase()}`,
      endpoint_ref: `env:AGORA_${family}_URL`, expected_url: null, credential_env: `AGORA_${family}_CREDENTIAL`, transport: 'chat-completions',
    })),
    analysis: { codebook_hash: REPORT_CODEBOOK_HASH, codebook: structuredClone(REPORT_CODEBOOK), independent_unit: 'run', inference: 'exploratory_descriptive_only', replay_trials: 0, wild_west: false, missingness: 'retain_all_planned_runs_no_automatic_replacement', calibration_evidence_ref: null, reviewers: [] },
    data_policy: { operator: 'Simon Heilles', storage_location: null, backup_location: null, retention: null, access: 'named_operators_only_no_public_raw_exports' },
    decision_proposals: {
      D02: 'Simon selected Qwen on 2026-11-12. Proposed C/D composition: Gemma, Qwen, Model X; A/B remain three Gemma instances. Pin Qwen3 32B Q4_K_M from the verified cached Ollama manifest digest; provision a dedicated endpoint and verify its revision, context capacity and thinking/output behavior before approval. Gemma and Model X remain to be bound. This is an explicit amendment to the Gemini protocol and requires Mateo approval.',
      D05: 'Fixed P1/P2/P3 speaking order in all six rounds, as directed at the 13 October meeting. No speaking-order treatment in this pilot.',
      D06: 'Approve pilot-candidate-2 wording and adapter-v2 delivery: shared participant instructions at every opportunity, explicit 2/2/2 topic sequence, identical isolated reviewer prompts, no no-report reminder. Review the rendered preview; candidate prose is not approved by software tests.',
      D07: 'Pin an available open-source Model X on the NVIDIA cluster; no Grok treatment in this pilot.',
      D08: 'Rotate report writer P1/P2/P3 across replications; the other two participants independently review the same draft.',
      D09: 'Sequential calls, 120-second timeout, one retry, 62-call and 500000-token stop-before-next-call thresholds per run; 1024 output tokens per request. Unknown usage stops continuation.',
      D10: 'Exclude Wild West. Simon confirmed the 12-run core-only scope on 2026-11-11.',
      D11: 'Approve attached WP06 report codebook after two-coder calibration; retain original labels and separate adjudication. Descriptive run-level findings only.',
      D12: 'No additional cue-replay trials in this campaign. Preserve reconstruction/replay of evidence. Simon confirmed core-only scope on 2026-11-11.',
      D13: 'All three private t0 responses precede report disclosure in B/D; no disclosure in A/C.',
      D14: 'Review exact private-t0, private-t6 and private-tR prompts. Expressed positions only; no inference about latent beliefs.',
      D15: 'Mateo provides explicit scientific approval of this exact plan hash; Simon requested this reviewer on 2026-11-11.',
      D16: 'A second operator reconstructs a saved mock run and checks the restored archive before live execution; retain their evidence reference.',
    }, approvals: [], plan_hash: '',
  };
  plan.plan_hash = planHash(plan);
  return plan;
}

export function readiness(planInput: unknown): { valid: boolean; blockers: string[]; plan: ExperimentPlan | null } {
  const result = ExperimentPlanSchema.safeParse(planInput);
  if (!result.success) return { valid: false, blockers: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`), plan: null };
  const plan = result.data;
  const blockers: string[] = [];
  if (plan.implementation_hash !== implementationHash()) blockers.push('Implementation changed since review; regenerate the preview and obtain new approval');
  if (planHash(plan) !== plan.plan_hash) blockers.push('Plan hash mismatch; changed plans require new approvals');
  const campaign = validateCampaignManifest(plan.campaign);
  blockers.push(...campaign.issues);
  if (plan.campaign.profile !== 'draft' || plan.campaign.freeze_status !== 'SCIENTIFIC_FREEZE_PENDING') blockers.push('The review plan must contain a draft campaign');
  const runIds = plan.campaign.runs.map(r => r.run_id);
  if (new Set(plan.execution_order).size !== 12 || plan.execution_order.some(id => !runIds.includes(id))) blockers.push('Execution order must contain each planned run exactly once');
  if (configHash(plan.analysis.codebook) !== REPORT_CODEBOOK_HASH) blockers.push('Codebook content/hash mismatch');
  if (new Set(plan.analysis.reviewers).size < 2) blockers.push('Two independent human coders must be named');
  if (!plan.analysis.calibration_evidence_ref?.trim()) blockers.push('Human calibration evidence is missing');
  for (const field of ['storage_location', 'backup_location', 'retention'] as const) if (!plan.data_policy[field]?.trim()) blockers.push(`Data policy ${field} is missing`);
  for (const role of ['scientific', 'infrastructure', 'reconstruction'] as const) {
    const approvals = plan.approvals.filter(a => a.role === role);
    if (approvals.length !== 1 || approvals[0]!.plan_hash !== plan.plan_hash) blockers.push(`Missing or stale ${role} approval`);
  }
  const scientific = plan.approvals.find(a => a.role === 'scientific');
  if (scientific && scientific.reviewer !== plan.scientific_reviewer) blockers.push('Scientific approval must come from the designated reviewer');
  const reconstruction = plan.approvals.find(a => a.role === 'reconstruction');
  if (reconstruction?.reviewer === plan.data_policy.operator) blockers.push('Reconstruction must be checked by a second operator');
  for (const endpoint of plan.endpoints) if (!endpoint.expected_url) blockers.push(`Infrastructure must pin endpoint URL: ${endpoint.provider}`);
  const deployments = new Map<string, string>();
  for (const run of plan.campaign.runs) for (const binding of run.bindings) {
    const parameters = z.object({ temperature: z.number().min(0).max(2), top_p: z.number().min(0).max(1), max_tokens: z.number().int().positive().max(16384), seed: z.number().int().optional() }).strict().safeParse(binding.parameters);
    if (!parameters.success) blockers.push(`Unsupported or invalid generation parameters: ${binding.logical_family}`);
    const { participant_slot: _, ...deployment } = binding;
    blockers.push(...validateDeploymentBinding(deployment, 'scientific').issues.map(i => `${binding.logical_family}: ${i}`));
    const prior = deployments.get(binding.logical_family);
    if (prior && prior !== configHash(deployment)) blockers.push(`Deployment varies across runs: ${binding.logical_family}`);
    deployments.set(binding.logical_family, configHash(deployment));
    const endpoints = plan.endpoints.filter(e => e.provider === binding.provider && e.endpoint_ref === binding.endpoint_ref);
    if (endpoints.length !== 1) blockers.push(`Missing unique endpoint mapping: ${binding.logical_family}`);
  }
  for (const decision of plan.campaign.decision_register.decisions.filter(d => d.blocking_effect === 'scientific_freeze')) {
    if (!plan.decision_proposals[decision.id]?.trim()) blockers.push(`No proposed resolution for ${decision.id}`);
  }
  return { valid: blockers.length === 0, blockers: [...new Set(blockers)], plan };
}

export function compileExperiment(input: unknown) {
  const check = readiness(input);
  if (!check.valid || !check.plan) throw new Error(`Experiment is not ready: ${check.blockers.join('; ')}`);
  const plan = check.plan;
  const approval = plan.approvals.find(a => a.role === 'scientific')!;
  let campaign = structuredClone(plan.campaign);
  campaign.profile = 'scientific'; campaign.lifecycle = 'FROZEN'; campaign.freeze_status = 'FROZEN'; campaign.study_contract.lifecycle = 'FROZEN';
  for (const decision of campaign.decision_register.decisions.filter(d => d.blocking_effect === 'scientific_freeze')) {
    decision.status = 'CONFIRMED'; decision.approval_level = 'scientific_freeze'; decision.decision_date = approval.approved_at;
    decision.approved_wording = plan.decision_proposals[decision.id]!;
    decision.current_evidence = `Approved by ${approval.reviewer}; plan ${plan.plan_hash}; ${approval.evidence_ref}`;
    decision.source_references.push(approval.evidence_ref);
  }
  campaign.source_references.push(`Approved experiment plan: ${plan.plan_hash}`);
  campaign = sealCampaign(campaign);
  const admission = { admissionClass: 'scientific' as const, topic: plan.topic, limits: plan.limits, approvedAt: approval.approved_at };
  // Validate every condition before admitting any live call.
  const manifests = plan.execution_order.map(id => adaptWp01Run(campaign, id, admission));
  return { plan, campaign, manifests };
}
