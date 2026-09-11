import { describe, expect, it } from 'vitest';
import { holmAdjust, krippendorffAlpha, pairedBootstrap, precisionPlanning } from '../src/phase1/statistics.js';
import { randomInterceptREML } from '../src/phase1/mixedModel.js';

describe('reproducible statistical primitives', () => {
  it('matches published Krippendorff nominal and ordinal reference calculations', () => {
    // Krippendorff (2013), Computing Alpha-Reliability, example C, pp. 4–8.
    const raters = [[1,2,3,3,2,1,4,1,2,null,null,null], [1,2,3,3,2,2,4,1,2,5,null,3], [null,3,3,3,2,3,4,2,2,5,1,null], [1,2,3,3,2,4,4,1,2,5,1,null]];
    const units = raters[0]!.map((_, i) => raters.map(r => r[i]!));
    const nominal = krippendorffAlpha(units, 'nominal', [1,2,3,4,5]);
    expect(nominal.pairable_values).toBe(40);
    expect(nominal.alpha).toBeCloseTo(0.743, 3);
    expect(krippendorffAlpha(units, 'ordinal', [1,2,3,4,5]).alpha).toBeCloseTo(0.815, 3);
    expect(krippendorffAlpha(units, 'ordinal', [1,2,3,4,4.5,5]).alpha).toBeCloseTo(0.815, 3);
  });
  it('does not turn missingness or no variation into perfect reliability', () => {
    expect(krippendorffAlpha([[0,0],[1,1],[2,2]], 'ordinal', [0,1,2]).alpha).toBe(1);
    expect(krippendorffAlpha([[0,0],[0,0]], 'nominal', [0,1]).alpha).toBeNull();
    expect(krippendorffAlpha([[0,null],[null,1]], 'nominal', [0,1]).alpha).toBeNull();
    expect(krippendorffAlpha([[0,1],[1,0]], 'nominal', [0,1]).alpha).toBeLessThan(0);
    expect(() => krippendorffAlpha([[3,1]], 'ordinal', [0,1,2])).toThrow();
  });
  it('implements Holm with the entire frozen family including unavailable hypotheses', () => {
    expect(holmAdjust([0.01,0.04,0.03])).toEqual([0.03,0.06,0.06]);
    expect(holmAdjust([0.01,null,0.04])).toEqual([0.03,null,0.08]);
    expect(holmAdjust([0,1,1])).toEqual([0,1,1]);
    expect(() => holmAdjust([NaN])).toThrow();
  });
  it('resamples paired differences reproducibly and retains observed zero without fake certainty', () => {
    const opts = { resamples: 10000, seed: 17, confidence: 0.95, interval: 'percentile' as const, p_value: 'centered_bootstrap' as const, min_pairs: 3 };
    const first = pairedBootstrap([-0.3,-0.1,0,0.1,0.3], opts);
    expect(first).toEqual(pairedBootstrap([-0.3,-0.1,0,0.1,0.3], opts));
    expect(first.estimate).toBeCloseTo(0, 14); expect(first.p_value).toBe(1);
    expect(first.interval![0]).toBeLessThan(0); expect(first.interval![1]).toBeGreaterThan(0);
    expect(pairedBootstrap([0,0,0,0], opts)).toMatchObject({ estimate: 0, status: 'degenerate_distribution', interval: null, p_value: null });
    expect(pairedBootstrap([0,1], opts).status).toBe('insufficient_pairs');
    const shifted = pairedBootstrap([1,1.1,1.2,1.3,1.4], opts);
    expect(shifted.p_value).toBeGreaterThan(0); expect(shifted.p_value).toBeLessThan(0.01);
    expect(pairedBootstrap([0,0.1,0.2,0.5,0.8], { ...opts, interval: 'basic' }).interval).not.toEqual(pairedBootstrap([0,0.1,0.2,0.5,0.8], opts).interval);
  });
  it('returns a planning aid only when calibration variance is estimable and positive', () => {
    expect(precisionPlanning([-1,0,1], 0.1, 1.96).approximate_pairs).toBe(385);
    expect(precisionPlanning([0,0,0], 0.1, 1.96).approximate_pairs).toBeNull();
    expect(precisionPlanning([], 0.1, 1.96).approximate_pairs).toBeNull();
  });
  it('matches the balanced-design REML closed form and handles incomplete blocks', () => {
    const pairs = [[0.1,0.3],[0.4,0.5],[0.2,0.4],[0.7,0.8],[0.4,0.7],[0.8,0.9]];
    const rows = pairs.flatMap((p,i) => p.map((value,t) => ({ block: String(i), treatment: t as 0|1, value })));
    const fit = randomInterceptREML(rows);
    const differences = pairs.map(p => p[1]! - p[0]!), delta = differences.reduce((a,b) => a+b,0)/6;
    const residual = differences.reduce((a,b) => a+(b-delta)**2,0)/5/2;
    const means = pairs.map(p => (p[0]!+p[1]!)/2), mean = means.reduce((a,b)=>a+b,0)/6;
    const tau = means.reduce((a,b)=>a+(b-mean)**2,0)/5-residual/2;
    expect(fit.status).toBe('estimated');
    expect(fit.treatment_effect).toBeCloseTo(delta, 7);
    expect(fit.residual_variance).toBeCloseTo(residual, 6);
    expect(fit.block_variance).toBeCloseTo(tau, 6);
    expect(randomInterceptREML(rows.slice(1)).treatment_effect).not.toBeNull();
    expect(randomInterceptREML([]).status).toBe('insufficient_design');
    expect(() => randomInterceptREML([...rows, rows[0]!])).toThrow(/duplicate/);
  });
});
