import { krippendorffAlpha, pairedBootstrap, holmAdjust, type BootstrapOptions } from './statistics.js';

export const RF_ICR_ALPHA_THRESHOLD = 0.80;
export const RF_ICR_MIN_PAIRABLE_UNITS = 30;
export const RF_ICR_MIN_COVERAGE = 1;

export type ReliabilityStatus = 'PASS' | 'DIAGNOSTIC' | 'FAIL' | 'NOT_EXERCISED' | 'INSUFFICIENT_COVERAGE';

export interface ReliabilityOptions {
  threshold?: number;
  min_pairable_units?: number;
  min_coverage?: number;
  group?: string;
}

export function computeOrdinalReliability(labels: (0 | 1 | 2 | null)[][], options: ReliabilityOptions = {}) {
  const threshold = options.threshold ?? RF_ICR_ALPHA_THRESHOLD;
  const minPairable = options.min_pairable_units ?? RF_ICR_MIN_PAIRABLE_UNITS;
  const minCoverage = options.min_coverage ?? RF_ICR_MIN_COVERAGE;
  const result = krippendorffAlpha(labels, 'ordinal', [0, 1, 2]);
  const coverage = labels.length ? result.pairable_units / labels.length : null;
  const status: ReliabilityStatus = !labels.length || result.pairable_units === 0
    ? 'NOT_EXERCISED'
    : result.pairable_units < minPairable || (coverage ?? 0) < minCoverage
      ? 'INSUFFICIENT_COVERAGE'
      : result.alpha !== null && result.alpha >= threshold
        ? 'PASS'
        : result.alpha !== null && result.alpha >= 0.667
          ? 'DIAGNOSTIC'
          : 'FAIL';
  return { group: options.group ?? null, scale: 'ordinal_0_2' as const, alpha: result.alpha, pairable_units: result.pairable_units, total_units: labels.length, coverage, threshold, min_pairable_units: minPairable, min_coverage: minCoverage, status, missing_values: labels.reduce((n, unit) => n + unit.filter(value => value === null).length, 0), reliability_is_not_validity: true };
}

export function computeNominalAgreement(labels: (string | null)[][], options: ReliabilityOptions = {}) {
  const result = krippendorffAlpha(labels, 'nominal', ['supports', 'challenges', 'extends', 'rejects', 'revises']);
  return { group: options.group ?? null, scale: 'nominal_relation' as const, alpha: result.alpha, pairable_units: result.pairable_units, total_units: labels.length, coverage: labels.length ? result.pairable_units / labels.length : null, status: result.alpha === null ? 'NOT_EXERCISED' as const : 'EXPLORATORY' as const, missing_values: labels.reduce((n, unit) => n + unit.filter(value => value === null).length, 0), reliability_is_not_validity: true };
}

export function calibrationOutcomeRegistry() {
  return {
    primary: ['role_fidelity'], key_secondary: ['interaction_contingency'], secondary: ['participation', 'initial_final_change'],
    descriptive: ['voting_alignment', 'vote_unanimity', 'minority_preservation', 'final_output_fidelity'],
    exploratory: ['relation_subtypes', 'final_output_quality'],
    inference_unit: 'paired_block', message_level: 'nested_not_independent', missingness: ['behavioral_zero', 'infrastructure_missing', 'measurement_missing', 'annotation_missing'],
  } as const;
}

export interface PairedCalibrationRow { block: string; control: number | null; treatment: number | null; }

export function pairedCalibrationEstimate(rows: PairedCalibrationRow[], metric: string, bootstrap?: Partial<BootstrapOptions>) {
  const available = rows.filter(row => row.control !== null && row.treatment !== null);
  const differences = available.map(row => row.treatment! - row.control!);
  const options: BootstrapOptions = { resamples: 10000, seed: 20260911, confidence: 0.95, interval: 'percentile', p_value: 'centered_bootstrap', min_pairs: 2, ...bootstrap };
  const result = pairedBootstrap(differences, options);
  return { metric, unit: 'paired_block', blocks_total: rows.length, pairable_blocks: available.length, unavailable_blocks: rows.filter(row => row.control === null || row.treatment === null).map(row => row.block), delta: result.estimate, ate_role: result.estimate, bootstrap: result, no_message_resampling: true, missingness: 'incomplete_pairs_are_not_imputed' as const };
}

export function holmSecondaryResults(results: Array<{ id: string; p_value: number | null }>) {
  const adjusted = holmAdjust(results.map(result => result.p_value));
  return results.map((result, index) => ({ ...result, holm_adjusted_p_value: adjusted[index], family: 'prespecified_secondary' as const }));
}
