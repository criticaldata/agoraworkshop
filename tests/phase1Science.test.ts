import { describe, expect, it } from 'vitest';
import { frozen, tempDb } from './helpers.js';
import { campaign, freezeCampaign, planCampaign, runCampaign, starterInput } from '../src/phase1/campaign.js';
import { analysisPlanDraft, AnalysisPlanSchema } from '../src/phase1/scienceContract.js';
import { scientificEvaluationDraft } from '../src/phase1/evaluationContract.js';
import { parsePosition, positionRows, rankingDistance } from '../src/phase1/positions.js';
import { scientificDataset, lockScientificDataset } from '../src/phase1/scientificDataset.js';
import { analyzeDataset, executeScientificAnalysis } from '../src/phase1/scientificAnalysis.js';
import { readScienceSnapshot, scienceSnapshots } from '../src/phase1/scienceStore.js';
import { annotate } from '../src/semantic/phase1Annotations.js';
import { getMessages } from '../src/db/queries.js';
import { campaignBundle } from '../src/phase1/export.js';
import { campaignAnalysis } from '../src/phase1/analysis.js';
import { reviewArtifact, visibleArtifactReviews } from '../src/phase1/artifactReview.js';
import { collectiveRecords } from '../src/phase1/collective.js';

const input = () => ({ ...starterInput(frozen().config, true), blocks: 1, evaluation: scientificEvaluationDraft(), analysis_plan: analysisPlanDraft() });
async function executed() { const db = tempDb(), id = freezeCampaign(db, input()); await runCampaign(db, id); return { db, id }; }

describe('scientific measurement and analysis lifecycle', () => {
  it('requires new versions when frozen scientific instruments or analysis decisions change', () => {
    const db = tempDb(), raw = input(); freezeCampaign(db, raw);
    const changedQuestion = structuredClone(raw);
    changedQuestion.evaluation.questionnaire.questions[0]!.text += ' Revised.';
    expect(() => freezeCampaign(db, changedQuestion)).toThrow(/questionnaire ID\/version/);
    changedQuestion.evaluation.questionnaire.version += '-revised';
    expect(() => freezeCampaign(db, changedQuestion)).not.toThrow();
    const changedPlan = structuredClone(raw);
    changedPlan.analysis_plan.retain_successful_retries = true;
    expect(() => freezeCampaign(db, changedPlan)).toThrow(/analysis-plan ID\/revision/);
    changedPlan.analysis_plan.revision += '-revised';
    expect(() => freezeCampaign(db, changedPlan)).not.toThrow();
    const changedRubric = structuredClone(raw);
    changedRubric.evaluation.interaction_rubric += ' Revised.';
    expect(() => freezeCampaign(db, changedRubric)).toThrow(/behavioral rubric version/);
    changedRubric.role_pack.rubric.version += '-revised';
    changedRubric.role_pack.version += '-revised';
    expect(() => freezeCampaign(db, changedRubric)).not.toThrow();
    db.close();
  });
  it('keeps legacy hashes stable and requires explicit scientific choices', () => {
    const old = planCampaign({ ...starterInput(frozen().config, true), blocks: 1 });
    expect(old.input.analysis_plan).toBeUndefined();
    const raw = input();
    expect(planCampaign(raw).input.evaluation!.primary_outcomes).toEqual(['role_fidelity']);
    expect(() => AnalysisPlanSchema.parse({ ...raw.analysis_plan, purpose: 'confirmatory' })).toThrow(/Confirmatory/);
    expect(() => planCampaign({ ...raw, evaluation: { ...raw.evaluation, primary_outcomes: ['role_fidelity', 'participation'] } })).toThrow(/exactly one family/);
  });
  it('collects complete rankings and concerns without redefining position change', async () => {
    const { db, id } = await executed(), c = campaign(db, id), runId = c.cases[0]!.run_id!;
    const rows = positionRows(db, runId);
    expect(rows.every(r => r.status === 'valid')).toBe(true);
    expect(JSON.parse(rows[0]!.value_json!).answers[0].priority_ranking).toHaveLength(4);
    const value = JSON.parse(rows[0]!.value_json!); value.answers[0].priority_ranking = ['invented'];
    expect(() => parsePosition(JSON.stringify(value), c.plan.cases[0]!.config)).toThrow(/complete ranking/);
    expect(rankingDistance(['a','b','c'], ['c','b','a'])).toBe(1);
    expect(scientificDataset(db, id).outcomes[0]!.metrics.initial_final_change).toBe(0);
    const behavior = campaignAnalysis(db, id).behavioral[0]!;
    expect(behavior.availability === 'configured' && behavior.positions.every(p => p.questions.every(q => q.ranking_change === 0))).toBe(true);
    db.close();
  });
  it('locks incomplete evidence honestly, refuses mutations, exports immutable reproducible analyses', async () => {
    const { db, id } = await executed();
    const preview = scientificDataset(db, id);
    expect(preview.gates.annotation_coverage_complete).toBe(false);
    expect(preview.outcomes[0]!.metrics.role_fidelity).toBeNull();
    const locked = lockScientificDataset(db, id);
    const first = executeScientificAnalysis(db, id, locked.id), second = executeScientificAnalysis(db, id, locked.id);
    expect(first.hash).toBe(second.hash);
    expect(readScienceSnapshot(db, first.id).payload.readiness.scientific_pass).toBe(false);
    expect(readScienceSnapshot(db, first.id).payload.endpoint_results[0].available_pairs).toBe(0);
    expect(() => annotate(db, id, {})).toThrow(/locked/);
    await expect(runCampaign(db, id)).rejects.toThrow(/locked/);
    expect(campaignBundle(db, id).artifacts.scientific_snapshots).toHaveLength(3);
    expect(campaignAnalysis(db, id).closure.gates.find(g => g.id === 'P1-B')!.status).toBe('BLOCKED');
    db.prepare("UPDATE phase1_science_snapshots SET content_hash = 'tampered' WHERE id = ?").run(locked.id);
    expect(() => executeScientificAnalysis(db, id, locked.id)).toThrow(/hash mismatch/);
    db.close();
  });
  it('rejects locking a campaign before planned cases are resolved', () => {
    const db = tempDb(), id = freezeCampaign(db, input());
    expect(() => lockScientificDataset(db, id)).toThrow(/planned cases/);
    expect(scienceSnapshots(db, id)).toHaveLength(0); db.close();
  });
  it('keeps human S8 quality separate, blinded by submission and bound to exact artifacts', async () => {
    const raw = input();
    raw.analysis_plan.reliability = { reviewers: ['alice','bob'], thresholds: {}, min_pairable_units: 2, min_coverage: 1 };
    raw.analysis_plan.artifact_rubric = { version: 'synthetic-quality-v1', sources: ['Test fixture only'], criteria: [{ id: 'faithful', description: 'Known fixture criterion, not a validated rubric.', weight: 1, max_score: 2 }] };
    raw.evaluation.exploratory_outcomes!.push('final_output_quality');
    const db = tempDb(), id = freezeCampaign(db, raw); await runCampaign(db, id);
    const c = campaign(db, id), runId = c.cases[0]!.run_id!, output = collectiveRecords(db, runId).output!;
    const base = { run_id: runId, artifact_hash: output.hash, author: 'alice', rubric_version: 'synthetic-quality-v1', criterion_id: 'faithful', score: 2, quote: 'deterministic_collective_artifact_v1', reason: 'Synthetic scored fixture.' };
    reviewArtifact(db, id, base);
    expect(visibleArtifactReviews(db, id, 'bob')).toEqual([]);
    expect(scientificDataset(db, id).outcomes[0]!.metrics.final_output_quality).toBeNull();
    reviewArtifact(db, id, { ...base, author: 'bob' });
    expect(visibleArtifactReviews(db, id, 'bob')).toHaveLength(2);
    const data = scientificDataset(db, id);
    expect(data.outcomes[0]!.metrics.final_output_quality).toBe(1);
    expect(data.outcomes[0]!.metrics.role_fidelity).toBeNull();
    expect(() => reviewArtifact(db, id, { ...base, artifact_hash: 'invented' })).toThrow(/exact frozen/);
    expect(() => reviewArtifact(db, id, { ...base, quote: 'fabricated quote' })).toThrow(/exact frozen/);
    lockScientificDataset(db, id);
    expect(() => reviewArtifact(db, id, base)).toThrow(/locked/);
    db.close();
  });
  it('rejects fabricated calibration references and excludes assessment context tampering', async () => {
    const raw = input(); raw.analysis_plan.calibration_snapshot_hash = 'sha256:' + '0'.repeat(64);
    const db = tempDb(), id = freezeCampaign(db, raw); await runCampaign(db, id);
    expect(scientificDataset(db, id).gates.calibration_verified).toBe(false);
    const runId = campaign(db, id).cases[0]!.run_id!;
    const row = positionRows(db, runId)[0]!, request = JSON.parse(row.request_json!);
    request.request.messages[0].content += '\nPEER FINAL POSITION LEAK';
    db.prepare('UPDATE phase1_positions SET request_json = ? WHERE record_id = ?').run(JSON.stringify(request), row.record_id);
    const dataset = scientificDataset(db, id);
    expect(dataset.outcomes[0]!.eligible).toBe(false);
    expect(analyzeDataset(dataset).endpoint_results.find(e => e.endpoint === 'initial_final_change')!.available_pairs).toBe(0);
    db.close();
  });
  it('resolves independent agreement, preserves disagreements, and computes pre-adjudication reliability', async () => {
    const raw = input(); raw.analysis_plan.reliability = { reviewers: ['alice','bob'], thresholds: {}, min_pairable_units: 2, min_coverage: 1 };
    const db = tempDb(), id = freezeCampaign(db, raw); await runCampaign(db, id);
    const c = campaign(db, id), units = scientificDataset(db, id).coding_units;
    const ids = new Map<string, string[]>();
    for (const unit of units) {
      const message = getMessages(db, unit.run_id).find(m => m.message_id === unit.message_id)!;
      for (const author of ['alice','bob']) {
        const base = { run_id: unit.run_id, message_id: unit.message_id, author, annotator_type: 'human', rubric_version: c.plan.input.role_pack.rubric.version, category: unit.category, quote: message.content, reason: 'Synthetic known coding fixture.' };
        const payload = unit.category === 'role_criterion' ? { ...base, criterion_id: unit.criterion_id, label: 'scored', score: message.sequence % 3 } : { ...base, label: 'absent' };
        const annotationId = annotate(db, id, payload);
        ids.set(unit.key, [...(ids.get(unit.key) ?? []), annotationId]);
      }
    }
    const agreed = scientificDataset(db, id);
    expect(agreed.gates.annotation_coverage_complete).toBe(true);
    expect(agreed.reliability.filter(r => r.group.startsWith('role:')).every(r => r.alpha === 1)).toBe(true);
    expect(agreed.gates.reliability_satisfied).toBe(false); // No threshold chosen.
    expect(agreed.outcomes.every(o => o.metrics.role_fidelity !== null && o.metrics.interaction_contingency === 0)).toBe(true);
    const unit = units[0]!, original = agreed.annotations.find(a => a.id === ids.get(unit.key)![1])!;
    const revised = annotate(db, id, { ...original.data, score: (original.data.score! + 1) % 3, supersedes: original.id });
    expect(scientificDataset(db, id).outcomes[0]!.metrics.role_fidelity).toBeNull();
    annotate(db, id, { ...original.data, author: 'adjudicator', adjudicates: [ids.get(unit.key)![0], revised] });
    const resolved = scientificDataset(db, id);
    expect(resolved.outcomes[0]!.metrics.role_fidelity).not.toBeNull();
    expect(resolved.reliability).toEqual(agreed.reliability);
    const report = analyzeDataset(resolved);
    expect(report.endpoint_results.find(e => e.endpoint === 'role_fidelity')!.available_pairs).toBe(1);
    expect(report.endpoint_results.find(e => e.endpoint === 'interaction_contingency')!.estimate).toBe(0);
    expect(report.readiness.scientific_pass).toBe(false);
    db.close();
  }, 30000);
});
