import { describe, expect, it } from 'vitest';
import { freezeCampaign, starterInput } from '../src/phase1/campaign.js';
import { lockDataset } from '../src/phase1/scienceStore.js';
import { blindedReviewProjection, createHumanValidationPackage, createReviewAssignments, listAdjudicationCandidates, readHumanValidationPackage, submitAdjudication, submitIndependentReview } from '../src/phase1/reviewWorkspace.js';
import { frozen, tempDb } from './helpers.js';

function fixture() {
  const db = tempDb();
  const campaignId = freezeCampaign(db, { ...starterInput(frozen().config, true), blocks: 1 });
  const snapshot = lockDataset(db, campaignId, { source_runs: [{ messages: [{ message_id: 'm1', content: 'Evidence text', workshop_state: 'PUBLIC_DISCUSSION', channel: 'public' }] }], coding_units: [{ key: 'u1', message_id: 'm1', category: 'role_criterion', criterion_id: 'function' }] });
  const assignments = createReviewAssignments(db, snapshot.id, ['reviewer_a', 'reviewer_b']);
  return { db, snapshot, assignments };
}

describe('authenticated blinded review workspace', () => {
  it('assigns the same evidence without exposing condition, role or colleague labels', () => {
    const { db, assignments } = fixture();
    const mine = assignments.find(a => a.reviewer_id === 'reviewer_a')!;
    const projection = blindedReviewProjection(db, mine.assignment_id, { id: 'reviewer_a', role: 'reviewer' });
    expect(projection.evidence.content).toBe('Evidence text');
    expect(projection.evidence).not.toHaveProperty('condition');
    expect(projection.evidence).not.toHaveProperty('role_id');
    expect(() => blindedReviewProjection(db, mine.assignment_id, { id: 'reviewer_b', role: 'reviewer' })).toThrow(/another reviewer/);
    db.close();
  });

  it('keeps independent labels append-only and requires disagreement adjudication', () => {
    const { db, snapshot, assignments } = fixture();
    const a = assignments.find(x => x.reviewer_id === 'reviewer_a')!;
    const b = assignments.find(x => x.reviewer_id === 'reviewer_b')!;
    submitIndependentReview(db, a.assignment_id, { id: 'reviewer_a', role: 'reviewer' }, { label: 'scored', score: 2, quote: 'Evidence text', reason: 'Clear.' });
    expect(() => submitIndependentReview(db, a.assignment_id, { id: 'reviewer_a', role: 'reviewer' }, { label: 'scored', score: 0, quote: 'Evidence text', reason: 'Duplicate.' })).toThrow(/already submitted/);
    submitIndependentReview(db, b.assignment_id, { id: 'reviewer_b', role: 'reviewer' }, { label: 'scored', score: 0, quote: 'Evidence text', reason: 'Not clear.' });
    const candidates = listAdjudicationCandidates(db, snapshot.id);
    expect(candidates).toHaveLength(1);
    const id = submitAdjudication(db, candidates[0]!, { id: 'adjudicator_1', role: 'adjudicator' }, { label: 'scored', score: 1, quote: 'Evidence text', reason: 'The evidence supports a partial score.' });
    expect(id).toMatch(/^adjudication_/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM phase1_review_submissions').get()).toEqual({ n: 2 });
    db.close();
  });

  it('freezes one content-addressed reviewer package and prevents membership changes', () => {
    const { db, snapshot } = fixture();
    const pkg = createHumanValidationPackage(db, snapshot.id, ['reviewer_a', 'reviewer_b']);
    expect(pkg.package_id).toMatch(/^hvp_/);
    expect(pkg.content_hash).toMatch(/^sha256:/);
    expect(pkg.manifest.excluded_fields).toContain('target_role');
    expect(readHumanValidationPackage(db, snapshot.id)?.content_hash).toBe(pkg.content_hash);
    expect(() => createHumanValidationPackage(db, snapshot.id, ['reviewer_a', 'reviewer_c'])).toThrow(/already frozen/);
    db.close();
  });
});
