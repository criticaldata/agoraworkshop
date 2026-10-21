import { z } from 'zod';
import { OutcomeIdSchema } from './evaluationContract.js';

const text = z.string().trim().min(1).max(12000);
export const AnalysisPlanSchema = z.object({
  version: z.literal('agora-analysis-v1'), id: text, revision: text,
  purpose: z.enum(['calibration', 'confirmatory']),
  status: z.enum(['draft', 'reviewed']),
  unit: z.literal('paired_block'),
  metric_registry_version: z.literal('agora-metrics-v1'),
  annotation_policy: z.literal('unanimous_independent_or_explicit_adjudication'),
  not_assessable: z.literal('endpoint_unavailable'),
  role_stage_window: z.array(z.enum(['PUBLIC_DISCUSSION', 'PRIVATE_OR_BREAKOUT', 'PUBLIC_RECONVENING', 'FINAL_DISCUSSION'])).min(1),
  bootstrap: z.object({ resamples: z.number().int().min(100).max(100000), seed: z.number().int().min(0).max(0xffffffff), confidence: z.number().gt(0).lt(1), interval: z.enum(['percentile', 'basic']), p_value: z.enum(['none', 'centered_bootstrap']), min_pairs: z.number().int().min(2).max(50) }).strict().nullable(),
  multiplicity: z.literal('holm_within_prespecified_families'),
  retain_successful_retries: z.boolean().nullable(),
  reliability: z.object({ reviewers: z.array(text).min(2).max(20),
    thresholds: z.record(z.string(), z.number().min(-1).max(1)),
    min_pairable_units: z.number().int().min(2), min_coverage: z.number().gt(0).max(1),
  }).strict().nullable(),
  precision: z.object({ target_half_width: z.number().positive(), z_critical: z.number().positive() }).strict().nullable(),
  sample_size_justification: text.nullable(),
  calibration_snapshot_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),
  sensitivity_model: z.object({ specification: text, implementation_reference: text, method: z.literal('paired_block_random_intercept_reml').nullable() }).strict().nullable(),
  outcome_notes: z.partialRecord(OutcomeIdSchema, text).optional(),
  artifact_rubric: z.object({ version: text, sources: z.array(text), criteria: z.array(z.object({ id: text, description: text, weight: z.number().positive(), max_score: z.literal(2) }).strict()).min(1).max(20) }).strict().nullable().optional(),
}).strict().superRefine((p, ctx) => {
  if (new Set(p.role_stage_window).size !== p.role_stage_window.length || (p.reliability && new Set(p.reliability.reviewers).size !== p.reliability.reviewers.length)) ctx.addIssue({ code: 'custom', message: 'Stage window and reviewers must be unique' });
  if (p.artifact_rubric && new Set(p.artifact_rubric.criteria.map(c => c.id)).size !== p.artifact_rubric.criteria.length) ctx.addIssue({ code: 'custom', message: 'Artifact criterion IDs must be unique' });
  if (p.purpose === 'confirmatory' && (p.status !== 'reviewed' || !p.bootstrap || p.bootstrap.p_value === 'none' || !p.reliability || p.retain_successful_retries === null || !p.sample_size_justification || !p.calibration_snapshot_hash || !p.sensitivity_model)) ctx.addIssue({ code: 'custom', message: 'Confirmatory plan requires reviewed methods, bootstrap/test, retry policy, reliability, sample justification, calibration snapshot and sensitivity-model specification' });
});
export type AnalysisPlan = z.infer<typeof AnalysisPlanSchema>;
export function analysisPlanDraft(): AnalysisPlan {
  return { version: 'agora-analysis-v1', id: 'agora-sap', revision: 'draft-0.1', purpose: 'calibration', status: 'draft', unit: 'paired_block', metric_registry_version: 'agora-metrics-v1',
    annotation_policy: 'unanimous_independent_or_explicit_adjudication', not_assessable: 'endpoint_unavailable',
    role_stage_window: ['PUBLIC_DISCUSSION', 'PRIVATE_OR_BREAKOUT', 'PUBLIC_RECONVENING', 'FINAL_DISCUSSION'],
    bootstrap: null, multiplicity: 'holm_within_prespecified_families', retain_successful_retries: null,
    reliability: null, precision: null, sample_size_justification: null, calibration_snapshot_hash: null, sensitivity_model: null,
  };
}
