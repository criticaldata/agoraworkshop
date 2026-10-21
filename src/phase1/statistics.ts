/** Pure, deterministic statistical utilities. Method references and limitations:
 * docs/phase1/SCIENTIFIC_ANALYSIS.md. No method here supplies scientific approval. */
export function mean(values: number[]): number | null {
  if (values.some(v => !Number.isFinite(v))) throw new Error('Non-finite observation');
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
export function quantile(sorted: number[], probability: number): number {
  if (!sorted.length || probability < 0 || probability > 1) throw new Error('Invalid quantile');
  const index = (sorted.length - 1) * probability, low = Math.floor(index), high = Math.ceil(index);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (index - low);
}
export function seededRandom(seed: number): () => number {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be uint32');
  let state = seed;
  return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export interface BootstrapOptions { resamples: number; seed: number; confidence: number; interval: 'percentile' | 'basic'; p_value: 'none' | 'centered_bootstrap'; min_pairs: number }
export function pairedBootstrap(differences: number[], options: BootstrapOptions) {
  const estimate = mean(differences);
  if (!Number.isInteger(options.resamples) || options.resamples < 100 || options.resamples > 100000 || !(options.confidence > 0 && options.confidence < 1) || !Number.isInteger(options.min_pairs) || options.min_pairs < 2) throw new Error('Invalid bootstrap settings');
  const rng = seededRandom(options.seed);
  const base = { estimate, pairs: differences.length, options, unit: 'paired_block_difference', algorithm: 'paired-bootstrap-v1' };
  if (differences.length < options.min_pairs) return { ...base, status: 'insufficient_pairs', interval: null, p_value: null, monte_carlo_se: null };
  if (differences.every(d => d === differences[0])) return { ...base, status: 'degenerate_distribution', interval: null, p_value: null, monte_carlo_se: null };
  const draws: number[] = [];
  for (let b = 0; b < options.resamples; b++) {
    let total = 0;
    for (let i = 0; i < differences.length; i++) total += differences[Math.floor(rng() * differences.length)]!;
    draws.push(total / differences.length);
  }
  const tails = (1 - options.confidence) / 2, sorted = [...draws].sort((a, b) => a - b);
  const low = quantile(sorted, tails), high = quantile(sorted, 1 - tails);
  const interval = options.interval === 'percentile' ? [low, high] : [2 * estimate! - high, 2 * estimate! - low];
  // Resampling centered paired differences approximates the null of zero mean.
  // This is not a randomization/permutation test and creates no random assignment.
  const exceedances = draws.filter(v => Math.abs(v - estimate!) >= Math.abs(estimate!) - 1e-14).length;
  const p = options.p_value === 'none' ? null : (exceedances + 1) / (options.resamples + 1);
  return { ...base, status: 'estimated', interval, p_value: p, monte_carlo_se: p === null ? null : Math.sqrt(p * (1 - p) / (options.resamples + 1)) };
}

/** Missing hypotheses remain in the prespecified family, not silently dropped. */
export function holmAdjust(values: (number | null)[]): (number | null)[] {
  if (values.some(v => v !== null && (!Number.isFinite(v) || v < 0 || v > 1))) throw new Error('Invalid p-value');
  const ranked = values.map((p, index) => ({ p, index })).filter((v): v is { p: number; index: number } => v.p !== null).sort((a, b) => a.p - b.p);
  const adjusted: (number | null)[] = values.map(() => null);
  let running = 0;
  ranked.forEach((v, i) => { running = Math.max(running, Math.min(1, v.p * (values.length - i))); adjusted[v.index] = running; });
  return adjusted;
}

/** Units × independent raters. null means missing/unassessable, never score zero.
 * Ordinal distance uses marginal frequencies, not squared numeric score distance. */
export function krippendorffAlpha(units: (string | number | null)[][], scale: 'nominal' | 'ordinal', domain: (string | number)[]) {
  if (new Set(domain).size !== domain.length || domain.length < 2 || domain.some(v => typeof v === 'number' && !Number.isFinite(v))) throw new Error('Invalid reliability domain');
  if (units.some(u => u.some(v => v !== null && !domain.includes(v)))) throw new Error('Rating outside frozen domain');
  const pairable = units.map(u => u.filter((v): v is string | number => v !== null)).filter(u => u.length >= 2);
  const counts = domain.map(d => pairable.reduce((n, u) => n + u.filter(v => v === d).length, 0));
  const n = counts.reduce((a, b) => a + b, 0);
  const distance = (a: number, b: number) => {
    if (a === b) return 0;
    if (scale === 'nominal') return 1;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return (counts.slice(lo, hi + 1).reduce((x, y) => x + y, 0) - (counts[lo]! + counts[hi]!) / 2) ** 2;
  };
  const base = { scale, domain, units: units.length, pairable_units: pairable.length, pairable_values: n, marginal_counts: counts, excluded_units: units.length - pairable.length };
  if (n < 2) return { ...base, alpha: null, observed_disagreement: null, expected_disagreement: null, status: 'insufficient_pairable_values' };
  let observed = 0, expected = 0;
  for (const unit of pairable) for (let i = 0; i < unit.length; i++) for (let j = 0; j < unit.length; j++) if (i !== j) observed += distance(domain.indexOf(unit[i]!), domain.indexOf(unit[j]!)) / (unit.length - 1);
  for (let a = 0; a < domain.length; a++) for (let b = 0; b < domain.length; b++) if (a !== b) expected += counts[a]! * counts[b]! * distance(a, b);
  observed /= n; expected /= n * (n - 1);
  return { ...base, alpha: expected > 0 ? 1 - observed / expected : null, observed_disagreement: observed, expected_disagreement: expected, status: expected > 0 ? 'estimated' : 'undefined_no_variation' };
}

/** Planning aid, not an approved sample size or power guarantee. */
export function precisionPlanning(differences: number[], targetHalfWidth: number, zCritical: number) {
  if (!(targetHalfWidth > 0) || !Number.isFinite(targetHalfWidth) || !(zCritical > 0) || !Number.isFinite(zCritical)) throw new Error('Specify finite positive precision and critical value');
  const average = mean(differences);
  const variance = differences.length > 1 ? differences.reduce((s, d) => s + (d - average!) ** 2, 0) / (differences.length - 1) : null;
  return { calibration_pairs: differences.length, paired_variance: variance, target_half_width: targetHalfWidth, z_critical: zCritical,
    approximate_pairs: variance !== null && variance > 0 ? Math.ceil(zCritical ** 2 * variance / targetHalfWidth ** 2) : null,
    limitation: 'Normal-approximation planning aid. Requires bounded-outcome simulation and scientific approval; zero calibration variance does not establish zero required sample size.' };
}
