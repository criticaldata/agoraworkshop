export interface NominalRating { item_id: string; coder_id: string; label: string }

/** Nominal Krippendorff alpha from independent ratings; NOT_ASSESSABLE is missing.
 * Do uses coincidence weighting (m_i - 1), not pooled unweighted pairs.
 * No variation => undefined alpha, even when observed agreement is perfect.
 */
export function nominalReliability(itemIds: readonly string[], ratings: readonly NominalRating[]) {
  if (new Set(itemIds).size !== itemIds.length) throw new Error('Duplicate reliability item');
  const declared = new Set(itemIds);
  const seen = new Set<string>();
  for (const rating of ratings) {
    const key = JSON.stringify([rating.item_id, rating.coder_id]);
    if (!declared.has(rating.item_id) || !rating.coder_id.trim() || !rating.label.trim() || seen.has(key)) {
      throw new Error('Invalid or duplicate reliability rating');
    }
    seen.add(key);
  }
  const groups = itemIds.map(id => ratings.filter(row => row.item_id === id && row.label !== 'NOT_ASSESSABLE'));
  const pairable = groups.filter(group => group.length >= 2);
  const counts = new Map<string, number>();
  let n = 0, weightedDisagreements = 0, orderedPairs = 0, disagreeingPairs = 0;
  for (const group of pairable) {
    const m = group.length;
    let disagreements = 0;
    for (const a of group) {
      counts.set(a.label, (counts.get(a.label) ?? 0) + 1);
      for (const b of group) if (a.label !== b.label) disagreements += 1;
    }
    n += m;
    orderedPairs += m * (m - 1);
    disagreeingPairs += disagreements;
    weightedDisagreements += disagreements / (m - 1);
  }
  const observed = n ? weightedDisagreements / n : null;
  const expected = n > 1 ? (n * n - [...counts.values()].reduce((sum, count) => sum + count * count, 0)) / (n * (n - 1)) : null;
  const alpha = observed !== null && expected !== null && expected > 0 ? 1 - observed / expected : null;
  const coders = [...new Set(ratings.map(row => row.coder_id))].sort();
  const pairwise = coders.flatMap((left, i) => coders.slice(i + 1).map(right => {
    const matrix: Record<string, number> = {};
    let matched = 0, total = 0;
    for (const group of groups) {
      const a = group.find(row => row.coder_id === left), b = group.find(row => row.coder_id === right);
      if (!a || !b) continue;
      const key = JSON.stringify([a.label, b.label]);
      matrix[key] = (matrix[key] ?? 0) + 1;
      total += 1;
      if (a.label === b.label) matched += 1;
    }
    return { coder_ids: [left, right], assessable_items: total, observed_agreement: total ? matched / total : null, confusion_matrix: matrix };
  }));
  return {
    algorithm_version: 'wp06-nominal-alpha-v1',
    planned_items: itemIds.length, rated_items: itemIds.filter(id => ratings.some(row => row.item_id === id)).length,
    assessable_ratings: groups.reduce((sum, group) => sum + group.length, 0),
    not_assessable_ratings: ratings.filter(row => row.label === 'NOT_ASSESSABLE').length,
    pairable_items: pairable.length, pairable_ratings: n,
    disagreement_items: pairable.filter(group => new Set(group.map(row => row.label)).size > 1).length,
    observed_agreement: orderedPairs ? 1 - disagreeingPairs / orderedPairs : null,
    observed_disagreement: observed, expected_disagreement: expected,
    krippendorff_alpha: alpha,
    alpha_unavailable_reason: alpha !== null ? null : n === 0 ? 'NO_PAIRABLE_RATINGS' : 'NO_LABEL_VARIATION',
    label_counts: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))),
    label_prevalence: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b)).map(([label, count]) => [label, count / n])),
    pairwise,
  };
}
