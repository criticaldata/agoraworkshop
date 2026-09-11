import { expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'docs/phase1');
const required = [
  'SCIENTIFIC_CONTRACT.md', 'BEHAVIORAL_PROTOCOL.md', 'ROLE_REGISTRY.md',
  'EXPRESSED_POSITION_QUESTIONNAIRE.md', 'BEHAVIORAL_RUBRIC.md', 'OUTCOME_METRIC_REGISTRY.md',
  'SCIENTIFIC_ANALYSIS.md', 'CODEBOOK.md', 'RELIABILITY_ADJUDICATION_PROTOCOL.md',
  'CALIBRATION_MANIFEST.md', 'CALIBRATION_REPORT.md', 'STATISTICAL_ANALYSIS_PLAN.md', 'LOCKED_SNAPSHOT_MANIFEST.md',
  'HUMAN_VALIDATION_PACKAGE_MANIFEST.md', 'PHASE1_GATE_REPORT.md', 'PHASE1B_TRANSITION_CONTRACT.md',
  'PHASE1A_CLOSURE_STATUS.md', 'PHASE1A_SOURCE_TRACEABILITY.md', 'AGORA_PHASE1_PR9_INDEPENDENT_REVIEW.md',
];

it('ships the complete Phase 1A pre-human-review documentation set', () => {
  for (const name of required) expect(existsSync(resolve(root, name)), name).toBe(true);
  const closure = readFileSync(resolve(root, 'PHASE1A_CLOSURE_STATUS.md'), 'utf8');
  expect(closure).toContain('PENDING_HUMAN_VALIDATION');
  expect(closure).toContain('BLOCKED_EXTERNAL_LIVE_PROVIDER');
  expect(closure).toContain('Phase 1B');
  const rubric = readFileSync(resolve(root, 'BEHAVIORAL_RUBRIC.md'), 'utf8');
  expect(rubric).toContain('not an externally validated AGORA instrument');
  const sap = readFileSync(resolve(root, 'STATISTICAL_ANALYSIS_PLAN.md'), 'utf8');
  expect(sap).toContain('10,000');
  expect(sap).toContain('INSUFFICIENT_COVERAGE');
});
