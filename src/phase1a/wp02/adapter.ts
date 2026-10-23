import { configHash } from '../../config/hash.js';
import { createManifest, type Phase1aManifest, type RoundDefinition } from '../index.js';
import {
  SELECTED_REPORT_NOTICE_TIMING,
  renderPrompt,
  validateCampaignManifest,
  validateDeploymentBinding,
  type CampaignManifest,
  type PromptCandidate,
  type RunManifest,
} from '../wp01/index.js';

export const WP01_RUNTIME_ADAPTER_VERSION = 'wp01-runtime-adapter-v1' as const;

export interface Wp01RuntimeAdmission {
  admissionClass: 'engineering' | 'scientific';
  topic: string;
  approvedAt: string;
  limits: Phase1aManifest['limits'];
}

function prompt(campaign: CampaignManifest, id: string, variables: Record<string, string>): string {
  const candidate = campaign.prompt_registry.prompts.find((entry) => entry.id === id);
  if (!candidate) throw new Error(`WP01 adapter missing prompt ${id}`);
  return renderPrompt(candidate as PromptCandidate, variables);
}

function assertScientificAdmission(campaign: CampaignManifest, run: RunManifest): void {
  const blockers = campaign.decision_register.decisions.filter((decision) =>
    decision.blocking_effect === 'scientific_freeze' && decision.status !== 'CONFIRMED');
  const errors: string[] = [];
  if (campaign.profile !== 'scientific') errors.push('campaign profile is not scientific');
  if (campaign.lifecycle !== 'FROZEN' || campaign.freeze_status !== 'FROZEN' || campaign.study_contract.lifecycle !== 'FROZEN') errors.push('campaign and study contract are not frozen');
  if (blockers.length) errors.push(`unresolved freeze decisions: ${blockers.map((decision) => decision.id).join(', ')}`);
  if (run.report_notice_timing !== 'NONE' && run.report_notice_timing !== SELECTED_REPORT_NOTICE_TIMING) errors.push('report notice timing is not the selected method');
  if (run.order_policy !== 'candidate_fixed_cyclic') errors.push('unsupported speaking-order policy');
  if (run.report_required && run.report_allocation_policy === 'UNRESOLVED') errors.push('report allocation policy is unresolved');
  for (const binding of run.bindings) {
    const { participant_slot: _participantSlot, ...deployment } = binding;
    errors.push(...validateDeploymentBinding(deployment, 'scientific').issues);
    if (binding.unsupported_parameters.length) errors.push(`unsupported parameters for ${binding.participant_slot}: ${binding.unsupported_parameters.join(', ')}`);
  }
  if (errors.length) throw new Error(`WP01 scientific admission rejected: ${errors.join('; ')}`);
}

function assertEngineeringAdmission(campaign: CampaignManifest, run: RunManifest): void {
  if (campaign.profile !== 'synthetic') throw new Error('WP01 engineering admission accepts only synthetic campaigns');
  for (const binding of run.bindings) {
    const { participant_slot: _participantSlot, ...deployment } = binding;
    const result = validateDeploymentBinding(deployment, 'synthetic');
    if (!result.valid) throw new Error(`WP01 engineering admission rejected: ${result.issues.join('; ')}`);
    if (binding.unsupported_parameters.length) throw new Error(`WP01 engineering admission rejected: unsupported parameters for ${binding.participant_slot}: ${binding.unsupported_parameters.join(', ')}`);
  }
}

export function adaptWp01Run(
  campaignInput: CampaignManifest,
  runId: string,
  admission: Wp01RuntimeAdmission,
): Phase1aManifest {
  const campaign = structuredClone(campaignInput);
  const validation = validateCampaignManifest(campaign);
  if (!validation.valid) throw new Error(`WP01 campaign rejected: ${validation.issues.join('; ')}`);
  const run = campaign.runs.find((candidate) => candidate.run_id === runId);
  if (!run) throw new Error(`WP01 run not found: ${runId}`);
  if (!admission.topic.trim()) throw new Error('WP01 adapter requires an explicit topic');
  if (!Number.isInteger(admission.limits.maxCalls) || admission.limits.maxCalls < run.expected_counts.expected_model_invocations) throw new Error('WP01 adapter call budget is below the planned invocation count');
  if (admission.admissionClass === 'scientific') assertScientificAdmission(campaign, run);
  else assertEngineeringAdmission(campaign, run);

  const variables = { topic: admission.topic };
  const participants = run.bindings.map((binding) => ({
    id: binding.participant_slot,
    provider: binding.provider!,
    model: binding.model_id!,
    configuration: structuredClone(binding.parameters),
  })) as unknown as Phase1aManifest['participants'];
  const orderedIds = run.order.map((slot) => participants.find((participant) => participant.id === slot)!.id) as [string, string, string];
  const topics: RoundDefinition['topic'][] = ['human-problem', 'human-problem', 'redesign', 'redesign', 'agent-role', 'agent-role'];
  const rounds = topics.map((topic, index) => ({
    number: (index + 1) as RoundDefinition['number'],
    topic,
    prompt: prompt(campaign, `public-round-${index + 1}`, { ...variables, round: String(index + 1) }),
  })) as unknown as Phase1aManifest['rounds'];
  const variations = admission.admissionClass === 'engineering'
    ? ['ENGINEERING ONLY: synthetic deployments, candidate prompts, and unresolved scientific-freeze decisions']
    : [];

  return createManifest({
    manifestId: run.run_id,
    experimentId: campaign.campaign_id,
    contractVersion: campaign.study_contract.protocol_revision,
    source: {
      adapterVersion: WP01_RUNTIME_ADAPTER_VERSION,
      admissionClass: admission.admissionClass,
      campaignHash: campaign.campaign_hash,
      runManifestHash: run.manifest_hash,
      adapterInputHash: wp01AdapterInputHash(campaign, runId, admission),
    },
    cell: run.condition_id,
    replication: run.replicate,
    reportEnabled: run.report_required,
    participants,
    rounds,
    checkpoints: {
      t0: prompt(campaign, 'private-t0', variables),
      t1: prompt(campaign, 'private-t6', variables),
      t2: prompt(campaign, 'private-tR', variables),
    },
    reportPrompts: {
      disclosure: prompt(campaign, 'report-anticipation', variables),
      draft: prompt(campaign, 'report-draft', variables),
      review1: prompt(campaign, 'report-review-1', variables),
      review2: prompt(campaign, 'report-review-2', variables),
      revision: prompt(campaign, 'report-revision', variables),
    },
    speakingOrder: [orderedIds, orderedIds, orderedIds, orderedIds, orderedIds, orderedIds],
    speakingOrderDecision: campaign.decision_register.decisions.find((decision) => decision.id === 'D05')!.id,
    replayPolicy: {
      decisionId: campaign.decision_register.decisions.find((decision) => decision.id === 'D12')!.id,
      mode: 'exact',
      tolerance: 0,
    },
    limits: structuredClone(admission.limits),
    variations,
    approvedAt: admission.approvedAt,
  });
}

export function wp01AdapterInputHash(campaign: CampaignManifest, runId: string, admission: Wp01RuntimeAdmission): string {
  return configHash({ adapterVersion: WP01_RUNTIME_ADAPTER_VERSION, campaignHash: campaign.campaign_hash, runId, admission });
}
