import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { compileExperiment, createExperimentProposal, planHash, readiness, sealCampaign } from '../src/phase1a/experiment/plan.js';
import { ChatCompletionsProvider, resolveEndpoints } from '../src/phase1a/experiment/provider.js';
import { executeExperiment, hasUnresolvedCall } from '../src/phase1a/experiment/runner.js';
import { buildSyntheticCampaign, QWEN_CONDITION_MATRIX, validateCampaignManifest } from '../src/phase1a/wp01/index.js';
import { DeterministicMockProvider, type ProviderCallSpec } from '../src/phase1a/index.js';

// Test-only attestations. Never exported as actual approval evidence.
function approvedFixture() {
  const p = createExperimentProposal();
  for (const run of p.campaign.runs) for (const b of run.bindings) Object.assign(b, { model_id: `test-${b.logical_family}`, deployment_id: `test-deployment-${b.logical_family}`, revision: 'test-sha', hosting: 'local', source: 'real' });
  for (const endpoint of p.endpoints) endpoint.expected_url = 'https://example.invalid/v1/chat/completions';
  p.campaign = sealCampaign(p.campaign);
  p.analysis.reviewers = ['Test coder A', 'Test coder B']; p.analysis.calibration_evidence_ref = 'test-only-calibration';
  Object.assign(p.data_policy, { storage_location: 'test-only', backup_location: 'test-only-backup', retention: 'test-only-duration' });
  p.plan_hash = planHash(p);
  p.approvals = ['scientific', 'infrastructure', 'reconstruction'].map(role => ({ role: role as 'scientific' | 'infrastructure' | 'reconstruction', reviewer: role === 'scientific' ? p.scientific_reviewer : `Test ${role} reviewer`, approved_at: '2026-11-11T00:00:00.000Z', evidence_ref: 'test-fixture-not-real-approval', plan_hash: p.plan_hash }));
  return p;
}
const spec: ProviderCallSpec = { operationKey: 't0:P1', participantId: 'P1', provider: 'test', model: 'test-model', configuration: { max_tokens: 16, temperature: 0.7 }, systemPrompt: 'system', userPrompt: 'question', context: [{ role: 'assistant', content: 'previous', sourceArtifactId: 'a1' }], attempt: 1 };
const response = (overrides = {}) => ({ model: 'test-model', choices: [{ message: { content: 'A position' }, finish_reason: 'stop' }], usage: { prompt_tokens: 12, completion_tokens: 3 }, ...overrides });
const directories: string[] = [];
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });
describe('Qwen protocol amendment', () => {
  it('replaces Gemini explicitly while preserving the four cells and 12 runs', () => {
    const p = createExperimentProposal();
    expect(p.campaign.study_contract.composition_variant).toBe('gemma-qwen-model-x-v1');
    expect(p.campaign.runs).toHaveLength(12);
    const bindings = p.campaign.runs.flatMap(r => r.bindings);
    expect(bindings.some(b => b.logical_family === 'GEMINI')).toBe(false);
    const qwen = bindings.filter(b => b.logical_family === 'QWEN');
    expect(qwen).toHaveLength(6);
    expect(qwen.every(b => b.model_id === 'qwen3:32b' && b.revision?.startsWith('sha256:030ee887'))).toBe(true);
    expect(qwen.every(b => b.deployment_id === null)).toBe(true);
    expect(p.endpoints.some(e => e.endpoint_ref.includes('GEMINI'))).toBe(false);
    expect(validateCampaignManifest(p.campaign).valid).toBe(true);
    expect(p.approvals).toEqual([]);
  });
  it('rejects a Qwen composition declared as the historical Gemini protocol even after rehashing', () => {
    const p = createExperimentProposal();
    delete p.campaign.study_contract.composition_variant;
    expect(validateCampaignManifest(sealCampaign(p.campaign)).valid).toBe(false);
  });
  it('preserves historical Gemini campaigns and rejects mixed contract/binding variants', () => {
    const c = buildSyntheticCampaign({ report_notice_timing: 'AFTER_T0_BEFORE_PUBLIC' });
    expect(validateCampaignManifest(c).valid).toBe(true);
    expect(c.runs.some(r => r.bindings.some(b => b.logical_family === 'GEMINI'))).toBe(true);
    c.study_contract.composition_variant = 'gemma-qwen-model-x-v1';
    c.study_contract.conditions = structuredClone([...QWEN_CONDITION_MATRIX]);
    expect(validateCampaignManifest(sealCampaign(c)).issues.join(' ')).toMatch(/composition mismatch/);
  });
});
describe('experiment admission', () => {
  it('keeps a draft blocked and compiles every cell only with complete evidence', () => {
    expect(readiness(createExperimentProposal()).valid).toBe(false);
    const result = compileExperiment(approvedFixture());
    expect(result.manifests).toHaveLength(12);
    expect(new Set(result.manifests.map(m => m.cell))).toEqual(new Set(['A', 'B', 'C', 'D']));
    expect(result.manifests.every(m => m.source.admissionClass === 'scientific')).toBe(true);
    expect(result.manifests[0]!.participantInstructions).toContain('Treat the other participants');
    expect(result.manifests[1]!.reportPrompts.review1).toBe(result.manifests[1]!.reportPrompts.review2);
    expect(result.manifests[0]!.rounds[0]!.prompt).toContain('human limitation');
    expect(result.manifests[0]!.rounds[4]!.prompt).toContain('AI agents');
  });
  it('permits the explicit collection-only gate with verified technical evidence and still requires Mateo', () => {
    const path = mkdtempSync(join(tmpdir(), 'agora-gate-test-')); directories.push(path);
    const p = approvedFixture();
    const hash = 'sha256:' + 'a'.repeat(64);
    for (const r of p.campaign.runs) for (const b of r.bindings) b.revision = hash;
    p.campaign = sealCampaign(p.campaign);
    for (const e of p.endpoints) { e.deployment_config_hash = hash; e.expected_model_revision = hash; }
    const put = (name: string, value: unknown) => {
      const bytes = JSON.stringify(value); const file = join(path, name); writeFileSync(file, bytes);
      return {path: file, sha256: createHash('sha256').update(bytes).digest('hex')};
    };
    p.collection_gate = {
      policy: 'mateo_reviewed_collection_before_human_coding_v1',
      calibration: 'two_independent_coders_on_external_material_before_human_analysis',
      reconstruction: 'automated_restore_not_independent_human_attestation',
      canary: put('canary.json', {result:'pass', mode:'engineering_only_not_scientific_data', deployment_config_hash:hash, overflow_rejection:{passed:true}, unauthenticated_rejection:{passed:true}, final_health:{halted:null}, results: ['GEMMA','QWEN','MODEL_X'].flatMap(f => ['short','long-context'].map(kind => ({kind,passed:true,model:`test-${f}`,model_revision:hash})))}),
      restore: put('restore.json', {result:'pass',mode:'automated_encrypted_backup_restore',verified_bundles:12,verified_calls:330,remote_ciphertext_sha256:'test-only',byte_identical:true,separate_process:true}),
    };
    p.analysis.reviewers = []; p.analysis.calibration_evidence_ref = null;
    p.plan_hash = planHash(p); p.approvals = [];
    expect(readiness(p).blockers).toEqual(['Missing or stale scientific approval']);
    p.approvals = [{role:'scientific',reviewer:'Mateo',approved_at:'2026-11-12T00:00:00.000Z',plan_hash:p.plan_hash,evidence_ref:'test-only-not-real-approval'}];
    expect(compileExperiment(p).manifests).toHaveLength(12);
    writeFileSync(p.collection_gate.restore.path, '{}');
    expect(readiness(p).blockers).toContain('Missing or changed restore evidence');
    p.collection_gate.restore = put('restore.json', null);
    expect(readiness(p).blockers).toContain('Missing or changed restore evidence');
    p.collection_gate.restore = put('restore.json',{result:'fail'});
    expect(readiness(p).blockers).toContain('Encrypted backup/restore verification is incomplete or failed');
  });
  it('invalidates approvals when text, limits or deployment changes', () => {
    for (const mutate of [(p: any) => p.topic += ' changed', (p: any) => p.limits.maxTokens++, (p: any) => p.campaign.runs[0].bindings[0].revision = 'different']) {
      const p = approvedFixture(); mutate(p); expect(() => compileExperiment(p)).toThrow();
      p.plan_hash = planHash(p); expect(() => compileExperiment(p)).toThrow(/stale/);
    }
  });
  it('rejects a changed roster and cross-run model drift', () => {
    const p = approvedFixture(); p.execution_order[1] = p.execution_order[0]!;
    expect(readiness(p).blockers.join(' ')).toMatch(/each planned run/);
    const q = approvedFixture(); q.campaign.runs[1]!.bindings[0]!.model_id = 'other'; q.campaign = sealCampaign(q.campaign);
    expect(readiness(q).blockers.join(' ')).toMatch(/varies across runs/);
  });
  it('rejects unsafe endpoint addresses and missing credentials', () => {
    const p = approvedFixture();
    expect(() => resolveEndpoints(p, {})).toThrow(/Missing endpoint/);
    expect(() => resolveEndpoints(p, { AGORA_GEMMA_URL: 'http://external.invalid/v1/chat/completions' })).toThrow(/approved plan|HTTPS/);
  });
});
describe('live transport', () => {
  it('sends the exact context once, keeps usage, and never archives credentials', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(response())));
    const provider = new ChatCompletionsProvider([{ provider: 'test', url: 'https://example.invalid/v1/chat/completions', credential: 'test-secret' }], 1000, fetcher);
    const result = await provider.invoke(spec);
    expect(result.outcome).toBe('success'); expect(result.usage).toEqual({ inputTokens: 12, outputTokens: 3 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(request.messages.map((m: any) => m.content)).toEqual(['system', 'previous', 'question']);
    expect(JSON.stringify(result)).not.toContain('test-secret');
  });
  it('halts network calls after missing usage or an unexpected model', async () => {
    for (const overrides of [{ usage: null }, { model: 'other' }]) {
      const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(response(overrides))));
      const provider = new ChatCompletionsProvider([{ provider: 'test', url: 'https://example.invalid' }], 1000, fetcher);
      expect((await provider.invoke(spec)).outcome).toBe('invalid_response');
      await provider.invoke(spec); expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('pins deployment configuration and weights revision and halts after drift', async () => {
    for (const deployment of [undefined, {config_hash: 'other', model_revision: 'revision'}, {config_hash: 'config', model_revision: 'other'}]) {
      const fetcher = vi.fn(async () => new Response(JSON.stringify(response({agora_deployment: deployment}))));
      const provider = new ChatCompletionsProvider([{provider: 'test', url: 'https://example.invalid', expectedConfigHash: 'config', expectedRevision: 'revision'}], 1000, fetcher);
      expect((await provider.invoke(spec)).outcome).toBe('invalid_response');
      await provider.invoke(spec); expect(fetcher).toHaveBeenCalledTimes(1);
    }
    const provider = new ChatCompletionsProvider([{provider: 'test', url: 'https://example.invalid', expectedConfigHash: 'config', expectedRevision: 'revision'}], 1000, async () => new Response(JSON.stringify(response({agora_deployment: {config_hash: 'config', model_revision: 'revision'}}))));
    expect((await provider.invoke(spec)).outcome).toBe('success');
  });
  it('archives explicit refusal, does not guess abstentions, and never follows redirects', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(response({ choices: [{ message: { content: null, refusal: 'I decline' }, finish_reason: 'stop' }] }))));
    const provider = new ChatCompletionsProvider([{ provider: 'test', url: 'https://example.invalid' }], 1000, fetcher);
    expect((await provider.invoke(spec)).outcome).toBe('refused');
    expect(fetcher.mock.calls[0]![1]!.redirect).toBe('error');
  });
});
describe('durable campaign runner', () => {
  it('retains all 12 rows and resumes without reissuing completed calls', async () => {
    const path = mkdtempSync(join(tmpdir(), 'agora-experiment-test-')); directories.push(path);
    const p = createExperimentProposal(); const provider = new DeterministicMockProvider();
    const first = await executeExperiment(p, path, 'mock', { provider, stopAfterRuns: 1 });
    expect(first.rows).toHaveLength(12); expect(first.rows.filter(r => r.status === 'COMPLETE')).toHaveLength(1); expect(provider.calls).toHaveLength(24);
    const second = await executeExperiment(p, path, 'mock', { provider });
    expect(second.rows.every(r => r.status === 'COMPLETE')).toBe(true); expect(provider.calls).toHaveLength(330);
    await executeExperiment(p, path, 'mock', { provider }); expect(provider.calls).toHaveLength(330);
    const bundle = JSON.parse(readFileSync(join(path, '1-evidence.json'), 'utf8'));
    expect(hasUnresolvedCall(bundle)).toBe(false);
    bundle.events.push({ event_type: 'provider_call.started' }); expect(hasUnresolvedCall(bundle)).toBe(true);
  }, 120000);
  it('stops the campaign on failed t0 and retains missingness for the other 11 runs', async () => {
    const path = mkdtempSync(join(tmpdir(), 'agora-experiment-test-')); directories.push(path);
    const provider = new DeterministicMockProvider({ 't0:P1': ['permission_denied'] });
    const p = createExperimentProposal();
    const first = await executeExperiment(p, path, 'mock', { provider });
    expect(first.rows[0]!.status).toBe('FAILED'); expect(first.rows.slice(1).every(r => r.status === 'NOT_STARTED')).toBe(true);
    await executeExperiment(p, path, 'mock', { provider }); expect(provider.calls).toHaveLength(1);
  });
});
