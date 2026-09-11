import type { ExperimentConfig } from '../config/schema.js';
import { configHash, canonicalize } from '../config/hash.js';
import { freezeCalibrationInstruments, instrumentManifestHash, type FrozenInstrumentManifest } from './instruments.js';

export type ProviderReadiness = 'AVAILABLE' | 'BLOCKED_EXTERNAL_LIVE_PROVIDER';

export interface FrozenCalibrationManifest {
  version: 'phase1a-calibration-manifest-v1';
  config_hash: string; provider: string; model: string; deployment: string | null;
  fixed_parameters: ExperimentConfig['model']; tools: { enabled: boolean; manifest: unknown[] };
  moderator: ExperimentConfig['moderator']; topic: string; schedule: ExperimentConfig['workshop']['rounds'];
  budgets: ExperimentConfig['budgets']; topology: { participants: string[]; moderator_id: string; breakouts: ExperimentConfig['channels']['private']['breakout_groups'] };
  role_treatment_only: boolean; instrument_hashes: Record<string, string>; instrument_manifest_hash: string;
  canonical_json: string;
}

export function calibrationManifest(config: ExperimentConfig, instruments?: FrozenInstrumentManifest[]): FrozenCalibrationManifest {
  if (!config.phase1?.canonical || config.participants.length !== 5) throw new Error('Phase 1A calibration manifest requires the canonical five-participant contract');
  if (config.capabilities.tools_enabled || config.capabilities.manifest.length) throw new Error('Phase 1A calibration manifest requires tools disabled');
  if (config.model.provider === 'mock' || config.model.provider === 'mock_context_contract') throw new Error('Calibration manifest must name the live provider; mocks are infrastructure fixtures only');
  const frozenInstruments = instruments ?? (config.phase1.evaluation ? freezeCalibrationInstruments({ role_pack: {
    id: 'embedded-role-pack', version: config.prompts.participant_prompt_version, title: 'Embedded Phase 1A roles', status: 'draft',
    common_instruction: config.phase1.common_instruction, neutral_instruction: 'No assigned functional treatment.',
    roles: Object.values(config.phase1.assignments).filter(a => a.role_id !== 'neutral').map(a => ({ id: a.role_id, title: a.role_id, instruction: a.instruction })).slice(0, 5), rubric: { version: config.phase1.evaluation.version, instructions: config.phase1.evaluation.interaction_rubric },
  }, evaluation: config.phase1.evaluation }) : []);
  const manifestPayload = {
    version: 'phase1a-calibration-manifest-v1' as const, config_hash: configHash(config), provider: config.model.provider, model: config.model.model,
    deployment: process.env['NVIDIA_VLLM_DEPLOYMENT_ID'] ?? null, fixed_parameters: config.model,
    tools: { enabled: config.capabilities.tools_enabled, manifest: config.capabilities.manifest }, moderator: config.moderator,
    topic: config.workshop.topic, schedule: config.workshop.rounds, budgets: config.budgets,
    topology: { participants: config.participants.map(p => p.id), moderator_id: config.moderator.id, breakouts: config.channels.private.breakout_groups },
    role_treatment_only: true, instrument_hashes: Object.fromEntries(frozenInstruments.map(item => [item.id, item.content_hash])), instrument_manifest_hash: instrumentManifestHash(frozenInstruments),
  };
  return { ...manifestPayload, canonical_json: canonicalize(manifestPayload) };
}

export function providerReadiness(manifest: FrozenCalibrationManifest, env: NodeJS.ProcessEnv = process.env): ProviderReadiness {
  if (manifest.provider === 'mock' || manifest.provider === 'mock_context_contract') return 'BLOCKED_EXTERNAL_LIVE_PROVIDER';
  const url = env['NVIDIA_VLLM_BASE_URL']?.trim(), key = env['NVIDIA_VLLM_API_KEY']?.trim();
  return url && key ? 'AVAILABLE' : 'BLOCKED_EXTERNAL_LIVE_PROVIDER';
}

export function launchInstructions(manifest: FrozenCalibrationManifest): string {
  return [
    `Provider: ${manifest.provider}; model: ${manifest.model}; config_hash: ${manifest.config_hash}.`,
    'Set NVIDIA_VLLM_BASE_URL and NVIDIA_VLLM_API_KEY in the execution environment; do not put either secret in YAML, manifests or Git.',
    'Run provider preflight, then baseline and identical rerun under the frozen manifest. Keep the fault run separate and link all hashes.',
    'If the endpoint or key is unavailable, record BLOCKED_EXTERNAL_LIVE_PROVIDER and do not substitute a mock for live evidence.',
  ].join('\n');
}
