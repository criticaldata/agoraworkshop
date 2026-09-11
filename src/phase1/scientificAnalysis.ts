import type { Db } from '../db/index.js';
import { configHash } from '../config/hash.js';
import { codeProvenance } from '../core/provenance.js';
import type { ScientificDataset } from './scientificDataset.js';
import { readScienceSnapshot, saveScienceSnapshot, campaignLock } from './scienceStore.js';
import { mean, holmAdjust, pairedBootstrap, precisionPlanning } from './statistics.js';
import { randomInterceptREML } from './mixedModel.js';
import { scienceImplementation } from './scienceProvenance.js';

export const METRIC_REGISTRY = {
  role_fidelity: { version: 'rf-v1', unit: 'run', formula: 'Mean of five participant weighted criterion means, scores divided by two, using frozen stage window and resolved coding.', missing: 'Any required coding unit missing/unassessable or incomplete discussion makes endpoint unavailable.' },
  interaction_contingency: { version: 'icr-v1', unit: 'run', formula: 'Contingent messages / all participant messages with earlier exposed peer content. No initial or moderator-only units.', missing: 'Any eligible message missing/unassessable; zero denominator; incomplete discussion => null.' },
  participation: { version: 'gini-v1', unit: 'run', formula: 'Sum of pairwise absolute count differences / (2 * 5 * total successful participant messages).', missing: 'Zero total or incomplete discussion => null. Not a measure of dominance.' },
  initial_final_change: { version: 'categorical-switch-v1', unit: 'run', formula: 'Mean across all five participants of fraction of exact categorical choices switched between S1 and S6.', missing: 'Any invalid or missing initial/final assessment => null.' },
  voting_alignment: { version: 'vote-s6-alignment-v1', unit: 'run', formula: 'Fraction of participant-question ballots equal to that participant’s S6 choice; explicit abstention is not alignment.', missing: 'Any missing/invalid final assessment or ballot => null.' },
  vote_unanimity: { version: 'vote-unanimity-v1', unit: 'run', formula: 'Fraction of questions where all five ballots select the same substantive option. All-abstention is not unanimity.', missing: 'Any missing/invalid ballot => null. No semantic consensus inference.' },
  minority_preservation: { version: 'minority-structure-v1', unit: 'run', formula: '1 only when complete ballots and exact deterministic S8 minority/count reconstruction pass.', missing: 'Incomplete voting or unverifiable output => null. Structural correctness, not a human quality score.' },
  final_output_fidelity: { version: 's8-structural-v1', unit: 'run', formula: '1 if stored S8 passes complete deterministic reconstruction and context audit, else 0 when artifact exists.', missing: 'No artifact => null. Not participant behavior or human-rated output quality.' },
  final_output_quality: { version: 's8-human-quality-v1', unit: 'run', formula: 'Weighted mean of resolved human artifact-criterion scores divided by two, using the frozen S8 rubric.', missing: 'Any criterion missing/unassessable/unresolved => null. Evaluates the system artifact, not participant behavior.' },
} as const;

export function analyzeDataset(dataset: ScientificDataset) {
  const plan = dataset.analysis_plan, evaluation = dataset.manifest.input.evaluation!;
  const families = { primary: evaluation.primary_outcomes, secondary: evaluation.secondary_outcomes ?? [], exploratory: evaluation.exploratory_outcomes ?? [] };
  const pairIds = [...new Set(dataset.outcomes.map(o => o.pair_id))];
  const endpointResults = Object.entries(families).flatMap(([family, names]) => names.map(endpoint => {
    const pairs = pairIds.map(id => {
      const control = dataset.outcomes.find(o => o.pair_id === id && o.condition === 'control')!, treatment = dataset.outcomes.find(o => o.pair_id === id && o.condition === 'treatment')!;
      const a = control.metrics[endpoint] ?? null, b = treatment.metrics[endpoint] ?? null;
      return { pair_id: id, control_run_id: control.run_id, treatment_run_id: treatment.run_id,
        control: a, treatment: b, difference: control.eligible && treatment.eligible && a !== null && b !== null ? b - a : null,
        reasons: [...control.exclusion_reasons.map(r => `control:${r}`), ...treatment.exclusion_reasons.map(r => `treatment:${r}`), ...(a === null ? ['control:endpoint_unavailable'] : []), ...(b === null ? ['treatment:endpoint_unavailable'] : [])] };
    });
    const included = pairs.filter((p): p is typeof p & { difference: number } => p.difference !== null);
    const differences = included.map(p => p.difference);
    const estimate = mean(differences);
    const inference = plan.bootstrap ? pairedBootstrap(differences, plan.bootstrap) : { status: 'method_not_frozen', estimate, p_value: null, interval: null };
    const allAvailable = (condition: string) => dataset.outcomes.filter(o => o.condition === condition && o.eligible && o.metrics[endpoint] !== null).map(o => ({ run_id: o.run_id, value: o.metrics[endpoint]! }));
    const noRetries = pairs.filter(p => p.difference !== null && !dataset.outcomes.some(o => o.pair_id === p.pair_id && o.retry_attempts > 0)).map(p => ({ pair_id: p.pair_id, difference: p.difference! }));
    return { endpoint, family, definition: METRIC_REGISTRY[endpoint], planned_pairs: pairs.length, available_pairs: included.length,
      pairs, estimate, inference, adjusted_p_value: null as number | null,
      precision_planning: endpoint === 'role_fidelity' && plan.precision ? precisionPlanning(differences, plan.precision.target_half_width, plan.precision.z_critical) : null,
      sensitivity: {
        mixed_model: plan.sensitivity_model?.method === 'paired_block_random_intercept_reml' ? randomInterceptREML(dataset.outcomes.filter(o => o.eligible && o.metrics[endpoint] !== null).map(o => ({ block: o.pair_id, treatment: o.condition === 'treatment' ? 1 : 0, value: o.metrics[endpoint]! }))) : null,
        successful_retries_excluded: { pairs: noRetries, mean_difference: mean(noRetries.map(p => p.difference)), inference: plan.bootstrap ? pairedBootstrap(noRetries.map(p => p.difference), plan.bootstrap) : null },
        all_available_run_level: { control: allAvailable('control'), treatment: allAvailable('treatment'), interpretation: 'Exact inputs to the sensitivity model; a fit is produced only when a supported method was explicitly frozen.' },
      },
    };
  }));
  for (const family of ['primary', 'secondary']) {
    const members = endpointResults.filter(e => e.family === family), adjusted = holmAdjust(members.map(e => e.inference.p_value));
    members.forEach((e, i) => { e.adjusted_p_value = adjusted[i]!; });
  }
  const reviewerSensitivity = dataset.reviewer_identities.flatMap(author => ['role_fidelity', 'interaction_contingency'].map(endpoint => {
    const differences = pairIds.flatMap(pairId => {
      const pair = dataset.outcomes.filter(o => o.pair_id === pairId);
      const get = (condition: string) => pair.find(o => o.condition === condition && o.eligible)?.reviewer_sensitivity.find(r => r.author === author);
      const a = get('control'), b = get('treatment');
      const key = endpoint as 'role_fidelity' | 'interaction_contingency';
      return a?.[key] != null && b?.[key] != null ? [{ pair_id: pairId, difference: b[key]! - a[key]! }] : [];
    });
    return { author, endpoint, differences, mean_difference: mean(differences.map(d => d.difference)), inference: plan.bootstrap ? pairedBootstrap(differences.map(d => d.difference), plan.bootstrap) : null };
  }));
  const blockers: string[] = [];
  if (plan.purpose !== 'confirmatory' || plan.status !== 'reviewed') blockers.push('calibration_or_draft_plan');
  if (!dataset.gates.annotation_coverage_complete) blockers.push('incomplete_annotation_coverage');
  if (!dataset.gates.reliability_satisfied) blockers.push('reliability_not_satisfied');
  if (!dataset.gates.calibration_verified) blockers.push('linked_calibration_not_verified');
  if (!dataset.gates.canonical_protocol_complete || !dataset.gates.comparability) blockers.push('protocol_or_comparability_failure');
  if (dataset.source_runs.some(s => !s.run || ['mock', 'mock_context_contract'].includes(s.run.provider))) blockers.push('not_a_complete_live_campaign');
  if (endpointResults.some(e => e.family !== 'exploratory' && e.inference.status !== 'estimated')) blockers.push('confirmatory_uncertainty_unavailable');
  if (!dataset.closure_evidence.some(e => e.kind === 'protocol_approval' && e.before_execution === 1)) blockers.push('missing_preregistered_protocol_approval');
  // The SAP leaves this specification open: export exact inputs rather than fit
  // an arbitrary random-effects model and imply that its assumptions were agreed.
  if (!plan.sensitivity_model?.method) blockers.push('sensitivity_model_requires_reviewed_executable_specification');
  if (!plan.calibration_snapshot_hash) blockers.push('no_linked_calibration_snapshot');
  return { version: 'agora-analysis-result-v1', dataset_hash: configHash(dataset), campaign_id: dataset.campaign_id,
    manifest_hash: dataset.manifest_hash, method_hash: configHash(plan), metric_registry: METRIC_REGISTRY,
    endpoint_results: endpointResults, reviewer_sensitivity: reviewerSensitivity,
    denominators: { planned_runs: dataset.outcomes.length, eligible_runs: dataset.outcomes.filter(o => o.eligible).length, planned_pairs: pairIds.length },
    missingness_by_condition: ['control', 'treatment'].map(condition => ({ condition, runs: dataset.outcomes.filter(o => o.condition === condition).map(o => ({ run_id: o.run_id, state: o.state, exclusion_reasons: o.exclusion_reasons, missingness: o.missingness, retry_attempts: o.retry_attempts, infrastructure_failures: o.infrastructure_failures })) })),
    reliability: dataset.reliability, relation_reliability: dataset.relation_reliability,
    readiness: { scientific_pass: false, computational_requirements_met: blockers.length === 0, blockers, final_review: 'Independent scientific sign-off is not inferred from computation.' },
    interpretation: 'Estimates describe observable behavior under this frozen protocol. No effect-size/significance requirement is used for integrity gates. Degenerate bootstrap samples retain the observed effect but do not manufacture uncertainty. Exploratory outcomes cannot rescue a null primary result.',
  };
}

export function executeScientificAnalysis(db: Db, campaignId: string, datasetId: string) {
  const saved = readScienceSnapshot(db, datasetId);
  if (saved.kind !== 'dataset' || saved.campaign_id !== campaignId || campaignLock(db, campaignId) !== datasetId) throw new Error('Use this campaign’s locked scientific dataset');
  const dataset = saved.payload as ScientificDataset;
  if (dataset.version !== 'agora-scientific-dataset-v1') throw new Error('Unsupported dataset version');
  const result = analyzeDataset(dataset);
  return saveScienceSnapshot(db, campaignId, 'analysis', { ...result, source_snapshot_id: datasetId, analysis_code_provenance: codeProvenance(), implementation: scienceImplementation() });
}
