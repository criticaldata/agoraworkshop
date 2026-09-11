import { describe, expect, it } from 'vitest';
import { freezeCalibrationInstruments, assertConfirmatoryReady, instrumentManifestHash } from '../src/phase1/instruments.js';
import { scientificEvaluationDraft } from '../src/phase1/evaluationContract.js';
import { STARTER_ROLES } from '../src/phase1/contracts.js';

const input = () => ({ role_pack: { ...structuredClone(STARTER_ROLES), roles: [
  { id: 'proposer', title: 'Proposal developer', instruction: 'Develop proposals.' },
  { id: 'critic', title: 'Critical evaluator', instruction: 'Evaluate assumptions.' },
  { id: 'evidence', title: 'Evidence assessor', instruction: 'Assess evidence.' },
  { id: 'integrator', title: 'Argument integrator', instruction: 'Integrate arguments.' },
  { id: 'consequences', title: 'Consequence assessor', instruction: 'Assess consequences.' },
], id: 'functional-roles', version: 'functional-v1' }, evaluation: scientificEvaluationDraft() });

describe('Phase 1A instrument freeze', () => {
  it('freezes five functional instruments and binds the questionnaire to S1/S6', () => {
    const manifests = freezeCalibrationInstruments(input());
    expect(manifests.map(item => item.id)).toEqual(['role_registry', 'expressed_position_questionnaire', 'behavioral_rubric', 'outcome_metric_registry', 'statistical_analysis_plan']);
    expect(manifests.every(item => item.status === 'frozen_for_calibration' && item.content_hash.startsWith('sha256:'))).toBe(true);
    const questionnaire = JSON.parse(manifests[1]!.canonical_json) as { stages: string[]; questions: Array<{ options: string[] }> };
    expect(questionnaire.stages).toEqual(['S1', 'S6']);
    expect(questionnaire.questions.every(question => question.options.length >= 2)).toBe(true);
    expect(instrumentManifestHash(manifests)).toMatch(/^sha256:/);
  });

  it('does not permit confirmatory readiness without reliability and adjudication', () => {
    const manifests = freezeCalibrationInstruments(input());
    expect(() => assertConfirmatoryReady(manifests, { human_reliability: false, adjudication_complete: false })).toThrow(/confirmatory_ready/);
  });
});
