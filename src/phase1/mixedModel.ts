/** Narrow, opt-in sensitivity model: y ~ 1 + treatment + (1 | paired_block).
 * Gaussian random intercept, homogeneous residual variance, REML profile fit.
 * No automatic claim that these assumptions suit bounded AGORA outcomes. */
export function randomInterceptREML(rows: { block: string; treatment: 0 | 1; value: number }[]) {
  if (rows.some(r => !Number.isFinite(r.value) || ![0, 1].includes(r.treatment)) || new Set(rows.map(r => `${r.block}:${r.treatment}`)).size !== rows.length) throw new Error('Invalid or duplicate mixed-model run observation');
  const groups = [...new Set(rows.map(r => r.block))].map(id => rows.filter(r => r.block === id));
  const base = { method: 'paired-block-random-intercept-reml-v1', observations: rows.length, blocks: groups.length,
    assumptions: 'Gaussian random intercept and independent homoscedastic Gaussian residuals; fixed intercept and treatment slope. No stage/order covariates. Sensitivity only; model choice requires review.' };
  if (groups.length < 3 || rows.length < 5 || ![0, 1].every(t => rows.some(r => r.treatment === t)) || groups.filter(g => g.length === 2).length < 2) return { ...base, status: 'insufficient_design', treatment_effect: null, intercept: null, residual_variance: null, block_variance: null, model_based_se: null };
  const profile = (ratio: number) => {
    let a = 0, b = 0, c = 0, d = 0, e = 0, yy = 0, logdet = 0;
    for (const group of groups) {
      const n = group.length, sx = group.reduce((s, r) => s + r.treatment, 0), sy = group.reduce((s, r) => s + r.value, 0), f = ratio / (1 + ratio * n);
      a += n - f * n * n; b += sx - f * n * sx; c += sx - f * sx * sx;
      d += sy - f * n * sy; e += group.reduce((s, r) => s + r.treatment * r.value, 0) - f * sx * sy;
      yy += group.reduce((s, r) => s + r.value ** 2, 0) - f * sy * sy; logdet += Math.log1p(ratio * n);
    }
    const det = a * c - b * b;
    if (!(det > 0)) return null;
    const intercept = (c * d - b * e) / det, slope = (a * e - b * d) / det;
    const residual = yy - intercept * d - slope * e;
    if (!(residual > 1e-14) || !Number.isFinite(residual)) return null;
    const sigma = residual / (rows.length - 2);
    return { objective: logdet + Math.log(det) + (rows.length - 2) * Math.log(sigma), intercept, treatment_effect: slope,
      residual_variance: sigma, block_variance: ratio * sigma, model_based_se: Math.sqrt(sigma * a / det), ratio };
  };
  const grid = Array.from({ length: 97 }, (_, i) => -12 + i / 4);
  const candidates = grid.map(log => ({ log, fit: profile(Math.exp(log)) })).filter(v => v.fit !== null);
  if (!candidates.length) return { ...base, status: 'singular_or_zero_residual_variance', treatment_effect: null, intercept: null, residual_variance: null, block_variance: null, model_based_se: null };
  const best = candidates.reduce((a, b) => a.fit!.objective < b.fit!.objective ? a : b);
  let low = Math.max(-12, best.log - 0.25), high = Math.min(12, best.log + 0.25);
  for (let iteration = 0; iteration < 70; iteration++) {
    const x = low + (high - low) / 3, y = high - (high - low) / 3;
    if ((profile(Math.exp(x))?.objective ?? Infinity) < (profile(Math.exp(y))?.objective ?? Infinity)) high = y; else low = x;
  }
  const inner = profile(Math.exp((low + high) / 2))!, zero = profile(0);
  const fit = zero && zero.objective <= inner.objective ? zero : inner;
  return { ...base, status: fit.ratio === 0 ? 'boundary_zero_block_variance' : best.log >= 11.75 ? 'upper_search_boundary' : 'estimated', ...fit,
    interpretation: 'Point estimate and model-based standard error only; no automatic p-value, missing-at-random claim, or confirmatory promotion. Inspect boundary/singular fits.' };
}
