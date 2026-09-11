import { describe, expect, it } from 'vitest';
import { METRIC_REGISTRY } from '../src/phase1/scientificAnalysis.js';

describe('Phase 1 outcome metric registry', () => {
  it('freezes the primary, secondary and exploratory outcome definitions with explicit missingness', () => {
    const entries = Object.entries(METRIC_REGISTRY);
    expect(entries).toHaveLength(9);
    expect(METRIC_REGISTRY.role_fidelity.version).toBe('rf-v1');
    expect(METRIC_REGISTRY.interaction_contingency.version).toBe('icr-v1');
    expect(METRIC_REGISTRY.participation.version).toBe('gini-v1');
    for (const [, definition] of entries) {
      expect(definition.version).toMatch(/-v\d+$/);
      expect(definition.unit).toBe('run');
      expect(definition.formula.length).toBeGreaterThan(10);
      expect(definition.missing.length).toBeGreaterThan(10);
    }
  });
});
