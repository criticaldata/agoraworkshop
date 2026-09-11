import { describe, expect, it } from 'vitest';
import { calibrationOutcomeRegistry, computeNominalAgreement, computeOrdinalReliability, holmSecondaryResults, pairedCalibrationEstimate } from '../src/phase1/reliability.js';

describe('Phase 1A calibration reliability and SAP', () => {
  it('uses ordinal 0-2 labels, preserves missingness and requires the frozen pairable threshold', () => {
    const labels = Array.from({ length: 30 }, (_, index) => [((index % 3) as 0 | 1 | 2), ((index % 3) as 0 | 1 | 2)] as [0 | 1 | 2, 0 | 1 | 2]);
    const result = computeOrdinalReliability(labels);
    expect(result.alpha).toBeCloseTo(1);
    expect(result.pairable_units).toBe(30);
    expect(result.status).toBe('PASS');
    expect(computeOrdinalReliability([[0, 0], [1, 1]], { min_pairable_units: 3 }).status).toBe('INSUFFICIENT_COVERAGE');
    expect(computeOrdinalReliability([[0, null]]).status).toBe('NOT_EXERCISED');
  });

  it('keeps relation coding exploratory and uses blocks rather than messages for uncertainty', () => {
    expect(computeNominalAgreement([['supports', 'supports'], ['challenges', 'challenges']]).status).toBe('EXPLORATORY');
    const estimate = pairedCalibrationEstimate([
      { block: 'b1', control: 0.2, treatment: 0.4 }, { block: 'b2', control: 0.3, treatment: 0.2 },
      { block: 'b3', control: null, treatment: 0.8 },
    ], 'role_fidelity', { resamples: 100 });
    expect(estimate.pairable_blocks).toBe(2);
    expect(estimate.unavailable_blocks).toEqual(['b3']);
    expect(estimate.no_message_resampling).toBe(true);
    expect(calibrationOutcomeRegistry().primary).toEqual(['role_fidelity']);
    expect(holmSecondaryResults([{ id: 'icr', p_value: 0.01 }, { id: 'change', p_value: 0.04 }])[0]!.holm_adjusted_p_value).toBeGreaterThanOrEqual(0.01);
  });
});
