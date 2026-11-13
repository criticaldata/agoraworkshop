import { beforeAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { configHash } from '../src/config/hash.js';
import { createExperimentProposal, compileExperiment, planHash, sealCampaign } from '../src/phase1a/experiment/plan.js';
import { Phase1aRuntime, DeterministicMockProvider, type EvidenceBundle } from '../src/phase1a/index.js';
import { createReportAnnotationTemplate } from '../src/phase1a/wp06/annotations.js';
import { analyzeRun } from '../src/phase1a/wp06/index.js';
import { checkRelease, coderPacket, checkAnnotations, releaseTemplate, type AnnotationRelease } from '../src/phase1a/annotationWorkflow/index.js';

// Synthetic unit-test approval/calibration records only; no files enter a real dossier.
let plan: ReturnType<typeof createExperimentProposal>, bundle: EvidenceBundle;
let directory: string, release: AnnotationRelease;
beforeAll(async () => {
  plan = createExperimentProposal();
  for (const run of plan.campaign.runs) for (const b of run.bindings) Object.assign(b, { model_id: `test-${b.logical_family}`, deployment_id: `test-deployment-${b.logical_family}`, revision: 'test-sha', hosting: 'local', source: 'real' });
  plan.campaign = sealCampaign(plan.campaign);
  for (const endpoint of plan.endpoints) endpoint.expected_url = 'https://example.invalid/v1/chat/completions';
  Object.assign(plan.data_policy, { storage_location: 'test-only', backup_location: 'test-only-backup', retention: 'test-only' });
  plan.analysis.reviewers = ['test-a', 'test-b']; plan.analysis.calibration_evidence_ref = 'test-only';
  plan.plan_hash = planHash(plan);
  plan.approvals = ['scientific', 'infrastructure', 'reconstruction'].map(role => ({ role: role as 'scientific' | 'infrastructure' | 'reconstruction', reviewer: role === 'scientific' ? 'Mateo' : 'Test reviewer', approved_at: '2026-11-11T00:00:00Z', plan_hash: plan.plan_hash, evidence_ref: 'TEST_ONLY_NOT_REAL_APPROVAL' }));
  const manifest = compileExperiment(plan).manifests.find(m => m.cell === 'B')!;
  const runtime = new Phase1aRuntime(); const id = runtime.createRun(manifest);
  await runtime.run(id, { async invoke(spec) {
    const content = spec.operationKey.startsWith('t') ? 'PRIVATE_CHECKPOINT_CANARY'
      : spec.operationKey.startsWith('report:review') ? 'ISOLATED_REVIEW_CANARY'
      : spec.operationKey === 'report:draft' ? 'DRAFT_CANARY'
      : spec.operationKey === 'report:revised' ? 'Final report with outstanding disagreement.' : 'Public proposal: retain audit logs.';
    return { outcome: 'success', provider: spec.provider, model: spec.model, content, raw: { secret: 'RAW_CANARY' }, usage: null, finishReason: 'stop' };
  } });
  bundle = runtime.evidence(id);
});
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'agora-annotation-workflow-'));
  const text = 'SYNTHETIC TEST DOCUMENT — NOT HUMAN CALIBRATION';
  writeFileSync(join(directory, 'evidence.txt'), text);
  const ref = { path: 'evidence.txt', sha256: createHash('sha256').update(text).digest('hex') };
  release = {
    schema_version: 'agora-annotation-release-v1', status: 'RELEASE_AUTHORIZED',
    approved_plan_hash: plan.plan_hash, codebook_hash: plan.analysis.codebook_hash, operator: plan.data_policy.operator,
    external_materials: [{ id: 'test-external', source_ref: 'test-only-material', origin: 'external_not_pilot', evidence: ref }],
    coders: ['test-a','test-b'].map(coder_id => ({ coder_id, calibration_completed_at: '2026-11-11T01:00:00Z', calibration_evidence_ref: ref, no_prior_pilot_access_attestation_ref: ref, first_pilot_access_at: null })),
    original_ratings_ref: ref, calibration_disagreements_and_resolution_ref: ref, scientific_acceptance_of_calibration_ref: ref,
    protocol_deviations: [], release_authorized_by: plan.data_policy.operator, released_at: '2026-11-11T02:00:00Z',
    released_artifacts: [{ run_id: analyzeRun(bundle).run_id, evidence_hash: analyzeRun(bundle).evidence_hash }],
  };
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
function inventory() {
  const data = createReportAnnotationTemplate(bundle, ['test-a', 'test-b']);
  const artifact = bundle.artifacts.find(a => a.kind.startsWith('round.'))!;
  data.propositions = [{ proposition_id: 'p1', summary: 'Retain audit logs', origin: { artifact_id: artifact.artifact_id, start: 0, end: artifact.content.length, quote: artifact.content } }];
  return data;
}

describe('annotation release workflow', () => {
  it('creates an incomplete template without approval, calibration or release claims', () => {
    const template = releaseTemplate(plan);
    expect(template.status).toBe('TEMPLATE_NOT_COMPLETED');
    expect(template.released_at).toBeNull();
    expect(checkRelease(plan, template, directory).valid).toBe(false);
  });
  it('accepts consistent records and resolves evidence paths relative to the release file', () => {
    expect(checkRelease(plan, release, directory)).toEqual({ valid: true, blockers: [] });
    expect(checkRelease(plan, release, join(directory, 'missing')).valid).toBe(false);
  });
  it('rejects missing approval, altered plan and mismatched codebook', () => {
    expect(checkRelease({ ...plan, approvals: [] }, release, directory).blockers).toContain('Missing scientific approval of the archived plan');
    expect(checkRelease({ ...plan, topic: 'altered' }, release, directory).blockers).toContain('Plan hash mismatch');
    release.codebook_hash = 'sha256:' + '0'.repeat(64);
    expect(checkRelease(plan, release, directory).blockers).toContain('Codebook hash mismatch');
  });
  it('rejects calibration after release or pilot access before release', () => {
    release.coders[1]!.calibration_completed_at = '2026-11-11T03:00:00Z';
    expect(checkRelease(plan, release, directory).blockers.join(' ')).toContain('Calibration after release');
    release.coders[0]!.first_pilot_access_at = '2026-11-11T01:59:00Z';
    expect(checkRelease(plan, release, directory).blockers.join(' ')).toContain('Invalid first pilot access');
  });
  it('rejects future release, duplicate coders and disclosed unresolved deviations', () => {
    release.coders[1]!.coder_id = release.coders[0]!.coder_id;
    release.protocol_deviations = ['Test prior exposure'];
    const check = checkRelease(plan, release, directory, new Date('2026-11-11T01:30:00Z'));
    expect(check.blockers).toContain('Duplicate coder identity');
    expect(check.blockers.join(' ')).toContain('future-dated');
    expect(check.blockers.join(' ')).toContain('deviations require scientific resolution');
  });
  it('rejects modified evidence files and an unauthorized release operator', () => {
    writeFileSync(join(directory, 'evidence.txt'), 'changed');
    release.release_authorized_by = 'someone else';
    const check = checkRelease(plan, release, directory);
    expect(check.blockers.join(' ')).toContain('Changed or empty calibration evidence');
    expect(check.blockers.join(' ')).toContain('designated operator');
  });
  it('exports separate packets with exact public/final text and no private, draft, review or raw data', () => {
    const before = JSON.stringify(bundle);
    const a = coderPacket(plan, release, bundle, inventory(), 'test-a', directory);
    const b = coderPacket(plan, release, bundle, inventory(), 'test-b', directory);
    expect(a.public_opportunities).toHaveLength(18);
    expect(a.final_report?.content).toBe('Final report with outstanding disagreement.');
    expect(a.public_opportunities).toEqual(b.public_opportunities);
    expect(a.propositions).toEqual(b.propositions);
    expect(a.packet_hash).not.toBe(b.packet_hash);
    const exported = JSON.stringify(a);
    for (const token of ['PRIVATE_CHECKPOINT_CANARY','ISOLATED_REVIEW_CANARY','DRAFT_CANARY','RAW_CANARY','provider_calls','test-b']) expect(exported).not.toContain(token);
    expect(JSON.stringify(bundle)).toBe(before);
  });
  it('refuses unauthorized coders, unreleased evidence and inventories containing ratings', () => {
    expect(() => coderPacket(plan, release, bundle, inventory(), 'outsider', directory)).toThrow(/not authorized/);
    const data = inventory(); data.ratings.push({ annotation_id: 'peer-rating', coder_id: 'test-b', proposition_id: 'p1', construct: 'report_retention', label: 'NOT_ASSESSABLE', evidence: [], reviewed_artifact_ids: [], rationale: 'Test-only peer judgment' });
    expect(() => coderPacket(plan, release, bundle, data, 'test-a', directory)).toThrow();
    release.released_artifacts[0]!.evidence_hash = 'sha256:' + '0'.repeat(64);
    expect(() => coderPacket(plan, release, bundle, inventory(), 'test-a', directory)).toThrow(/not included/);
  });
  it('rejects internally valid evidence from a different approved protocol with the same run ID', () => {
    const changed = structuredClone(plan); changed.topic += ' different question'; changed.plan_hash = planHash(changed);
    for (const approval of changed.approvals) approval.plan_hash = changed.plan_hash; // Test-only decision.
    release.approved_plan_hash = changed.plan_hash;
    expect(() => coderPacket(changed, release, bundle, inventory(), 'test-a', directory)).toThrow(/manifest differs/);
  });
  it('keeps incomplete annotations unavailable and cannot change the calibrated coder set', () => {
    const data = inventory();
    const result = checkAnnotations(plan, release, bundle, data, directory);
    expect(result.analysis.report_retention.value).toBeNull();
    expect(result.analysis.scientific_status).toBe('PENDING_SCIENTIFIC_APPROVAL');
    expect(result.release_record_hash).toBe(configHash(release));
    data.coder_ids[1] = 'outsider';
    expect(() => checkAnnotations(plan, release, bundle, data, directory)).toThrow(/coders differ/);
  });
  it('keeps failed and missing opportunities visible rather than treating them as absent behavior', async () => {
    const runtime = new Phase1aRuntime(); const id = runtime.createRun(compileExperiment(plan).manifests.find(m => m.cell === 'B')!);
    await runtime.run(id, new DeterministicMockProvider(), { stopAfterOperations: 7 });
    const partial = runtime.evidence(id), run = analyzeRun(partial);
    release.released_artifacts = [{ run_id: run.run_id, evidence_hash: run.evidence_hash }];
    const packet = coderPacket(plan, release, partial, createReportAnnotationTemplate(partial, ['test-a', 'test-b']), 'test-a', directory);
    expect(packet.public_opportunities).toHaveLength(18);
    expect(packet.public_opportunities.some(p => p.artifact === null && p.status === 'not_attempted')).toBe(true);
    expect(packet.final_report).toBeNull();
  });
  it('CLI creates private templates and refuses overwrites', () => {
    const input = join(directory, 'plan.json'), output = join(directory, 'release.json');
    writeFileSync(input, JSON.stringify(plan));
    const args = ['--import', 'tsx', 'src/phase1a/annotationWorkflow/cli.ts', 'init', input, output];
    expect(spawnSync(process.execPath, args).status).toBe(0);
    expect(statSync(output).mode & 0o777).toBe(0o600);
    expect(JSON.parse(readFileSync(output, 'utf8')).status).toBe('TEMPLATE_NOT_COMPLETED');
    expect(spawnSync(process.execPath, args).status).toBe(1);
  });
});
