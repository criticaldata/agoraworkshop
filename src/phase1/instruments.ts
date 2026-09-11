import { z } from 'zod';
import { createHash } from 'node:crypto';
import { canonicalize, configHash } from '../config/hash.js';
import type { RolePack } from './contracts.js';
import type { Evaluation } from './evaluationContract.js';
import type { AnalysisPlan } from './scienceContract.js';

export const InstrumentStatusSchema = z.enum(['draft', 'frozen_for_calibration', 'confirmatory_ready']);
export type InstrumentStatus = z.infer<typeof InstrumentStatusSchema>;
export const FrozenInstrumentManifestSchema = z.object({
  id: z.string().min(1), version: z.string().min(1), canonical_json: z.string().min(2),
  content_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/), status: InstrumentStatusSchema,
  provenance: z.object({ kind: z.enum(['design', 'adaptation', 'analysis']), sources: z.array(z.string()).min(1), note: z.string().min(1) }).strict(),
}).strict();
export type FrozenInstrumentManifest = z.infer<typeof FrozenInstrumentManifestSchema>;

export interface CalibrationInstrumentInput {
  role_pack: RolePack;
  evaluation: Evaluation;
  analysis_plan?: AnalysisPlan | null;
  protocol?: unknown;
}

function manifest(id: string, version: string, payload: unknown, status: InstrumentStatus, provenance: FrozenInstrumentManifest['provenance']): FrozenInstrumentManifest {
  const canonical_json = canonicalize(payload);
  const content_hash = configHash(payload);
  return FrozenInstrumentManifestSchema.parse({ id, version, canonical_json, content_hash, status, provenance });
}

export function freezeCalibrationInstruments(input: CalibrationInstrumentInput): FrozenInstrumentManifest[] {
  const roleIds = input.role_pack.roles.map(role => role.id);
  if (roleIds.length !== 5 || new Set(roleIds).size !== 5) throw new Error('Calibration requires five unique functional role IDs');
  const roleRegistry = {
    id: input.role_pack.id, version: input.role_pack.version, title: input.role_pack.title,
    roles: input.role_pack.roles.map(role => ({ ...role, construct: 'functional role instruction', not_a_personality_or_demographic_claim: true })),
    common_instruction: input.role_pack.common_instruction, neutral_instruction: input.role_pack.neutral_instruction,
  };
  const questionnaire = { ...input.evaluation.questionnaire, stages: ['S1', 'S6'], expressed_position: !!input.evaluation.questionnaire.response_contract,
    missingness: ['invalid', 'provider_failure', 'timeout', 'deadline', 'budget', 'cancellation', 'unknown_incomplete'],
    note: 'S1 and S6 use byte-identical questionnaire wording and options; values describe expressed position, not latent belief.' };
  const rubric = { version: input.evaluation.version, role_criteria: input.evaluation.role_criteria, interaction_rubric: input.evaluation.interaction_rubric,
    scale: { kind: 'ordinal', domain: [0, 1, 2], not_assessable: true },
    provenance: ['DQI', 'CACS', 'DCS', 'AGORA adaptation'],
    note: 'Construct and coding provenance only; this is not an externally validated AGORA instrument.' };
  const outcomes = { primary: ['role_fidelity'], key_secondary: ['interaction_contingency'], secondary: ['participation', 'initial_final_change'],
    descriptive: ['voting_alignment', 'vote_unanimity', 'minority_preservation', 'final_output_fidelity'], exploratory: ['relation_subtypes', 'final_output_quality'],
    unit: 'paired_block', message_level: 'nested descriptive evidence only' };
  const sap = input.analysis_plan ?? { version: 'agora-sap-pending-v1', status: 'draft', unit: 'paired_block', bootstrap: { resamples: 10000, confidence: 0.95, interval: 'percentile' }, multiplicity: 'holm_within_prespecified_families' };
  const designSources = ['AGORA_Phase1_Scientific_Foundation_and_Experimental_Framework.pdf', 'AGORA_Phase1A_Scientific_Basis_for_Behavioral_Rubric.pdf', 'AGORA_Phase1A_Statistical_Analysis_Plan_v0.1_revised.pdf'];
  return [
    manifest('role_registry', input.role_pack.version, roleRegistry, 'frozen_for_calibration', { kind: 'design', sources: designSources, note: 'Functional treatment registry; not a validated personality measure.' }),
    manifest('expressed_position_questionnaire', input.evaluation.questionnaire.version, questionnaire, 'frozen_for_calibration', { kind: 'adaptation', sources: designSources, note: 'Exact S1/S6 questionnaire contract, including invalid and missing statuses.' }),
    manifest('behavioral_rubric', input.evaluation.version, rubric, 'frozen_for_calibration', { kind: 'adaptation', sources: designSources, note: 'AGORA-specific coding adaptation requiring independent calibration.' }),
    manifest('outcome_metric_registry', 'agora-metrics-v1', outcomes, 'frozen_for_calibration', { kind: 'analysis', sources: designSources, note: 'Primary/key-secondary hierarchy is frozen before confirmatory analysis.' }),
    manifest('statistical_analysis_plan', input.analysis_plan?.revision ?? 'pending-review', sap, 'frozen_for_calibration', { kind: 'analysis', sources: designSources, note: 'Calibration SAP; final N and precision remain calibration-derived.' }),
  ];
}

export function assertConfirmatoryReady(manifests: FrozenInstrumentManifest[], evidence: { human_reliability: boolean; adjudication_complete: boolean }): void {
  if (manifests.some(item => item.status !== 'confirmatory_ready')) throw new Error('All instruments must be explicitly confirmatory_ready');
  if (!evidence.human_reliability) throw new Error('Independent human reliability evidence is required');
  if (!evidence.adjudication_complete) throw new Error('Required adjudication is incomplete');
}

export function instrumentManifestHash(manifests: FrozenInstrumentManifest[]): string {
  return `sha256:${createHash('sha256').update(canonicalize(manifests), 'utf8').digest('hex')}`;
}
