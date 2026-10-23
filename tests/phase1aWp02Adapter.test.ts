import { describe, expect, it } from 'vitest';
import { DeterministicMockProvider, Phase1aRuntime, verifyEvidenceBundle } from '../src/phase1a/index.js';
import { buildSyntheticCampaign, SELECTED_REPORT_NOTICE_TIMING } from '../src/phase1a/wp01/index.js';
import { adaptWp01Run, WP01_RUNTIME_ADAPTER_VERSION } from '../src/phase1a/wp02/index.js';

const admission = {
  admissionClass: 'engineering' as const,
  topic: 'how agentic systems should support human judgment',
  approvedAt: '2026-10-22T00:00:00.000Z',
  limits: { maxCalls: 40, maxTokens: 100_000, maxRetries: 1 },
};
const campaign = buildSyntheticCampaign({ report_notice_timing: SELECTED_REPORT_NOTICE_TIMING });

function canonicalOperation(key: string): string {
  const privateMatch = key.match(/^(t0|t1|t2):(P[123])$/);
  if (privateMatch) return `${({ t0: 'T0', t1: 'T6', t2: 'TR' })[privateMatch[1] as 't0' | 't1' | 't2']}:${privateMatch[2]}`;
  const round = key.match(/^round:(\d):(P[123])$/);
  if (round) return `PUBLIC_ROUND_${round[1]}:${round[2]}`;
  return ({ 'report:draft': 'REPORT_DRAFT', 'report:review1': 'REPORT_REVIEW_1', 'report:review2': 'REPORT_REVIEW_2', 'report:revised': 'REPORT_REVISION' } as Record<string, string>)[key]!;
}

describe('WP01 to WP02 versioned runtime adapter', () => {
  it.each(campaign.runs.map((run) => [run.condition_id, run.replicate, run] as const))('executes cell %s replicate %i from the canonical WP01 run manifest', async (_cell, _replicate, run) => {
    const manifest = adaptWp01Run(campaign, run.run_id, admission);
    expect(manifest.source).toMatchObject({
      adapterVersion: WP01_RUNTIME_ADAPTER_VERSION,
      admissionClass: 'engineering',
      campaignHash: campaign.campaign_hash,
      runManifestHash: run.manifest_hash,
    });
    expect(manifest.participants.map((participant) => participant.id)).toEqual(['P1', 'P2', 'P3']);
    const runtime = new Phase1aRuntime();
    const provider = new DeterministicMockProvider();
    const runId = runtime.createRun(manifest);
    expect(await runtime.run(runId, provider)).toBe('COMPLETE');
    expect(provider.calls).toHaveLength(run.expected_counts.expected_model_invocations);
    expect(provider.calls.map((call) => canonicalOperation(call.operationKey))).toEqual(run.agenda.filter((stage) => stage.model_invocation).map((stage) => stage.kind === 'report_production' ? stage.id : `${stage.id}:${stage.participant_slot}`));
    expect(provider.calls.every((call) => JSON.stringify(call.configuration) === JSON.stringify(manifest.participants.find((participant) => participant.id === call.participantId)!.configuration))).toBe(true);
    const bundle = runtime.evidence(runId);
    expect(verifyEvidenceBundle(bundle)).toEqual({ valid: true, errors: [] });
    const disclosures = bundle.events.filter((event) => event.event_type === 'report_requirement.disclosed');
    expect(disclosures).toHaveLength(run.report_required ? 1 : 0);
    const privateContents = bundle.artifacts.filter((artifact) => artifact.kind.startsWith('checkpoint.')).map((artifact) => artifact.content);
    for (const call of provider.calls.filter((candidate) => candidate.operationKey.startsWith('round:') || candidate.operationKey.startsWith('report:'))) {
      expect(call.context.every((message) => !privateContents.includes(message.content))).toBe(true);
    }
    expect(provider.calls.filter((call) => call.operationKey.startsWith('t0:')).every((call) => call.context.length === 0 && !/report/i.test(call.userPrompt))).toBe(true);
    expect(provider.calls.find((call) => call.operationKey === 'round:1:P1')!.context.some((message) => message.content === manifest.reportPrompts.disclosure)).toBe(run.report_required);
  });

  it('rejects tampering and unresolved scientific admission before any provider call', () => {
    const run = campaign.runs.find((candidate) => candidate.condition_id === 'D')!;
    const tampered = structuredClone(campaign);
    tampered.prompt_registry.prompts[0]!.text += ' changed';
    expect(() => adaptWp01Run(tampered, run.run_id, admission)).toThrow(/campaign rejected/i);
    expect(() => adaptWp01Run(campaign, run.run_id, { ...admission, admissionClass: 'scientific' })).toThrow(/scientific admission rejected/i);
  });

  it('rejects an execution budget below the WP01 invocation plan', () => {
    const run = campaign.runs.find((candidate) => candidate.condition_id === 'B')!;
    expect(() => adaptWp01Run(campaign, run.run_id, { ...admission, limits: { ...admission.limits, maxCalls: 30 } })).toThrow(/budget/i);
  });

  it('blocks report disclosure and public turns when t0 fails terminally', async () => {
    const run = campaign.runs.find((candidate) => candidate.condition_id === 'B')!;
    const runtime = new Phase1aRuntime();
    const provider = new DeterministicMockProvider({ 't0:P3': ['timeout', 'timeout'] });
    const runId = runtime.createRun(adaptWp01Run(campaign, run.run_id, admission));
    expect(await runtime.run(runId, provider)).toBe('FAILED');
    const bundle = runtime.evidence(runId);
    expect(bundle.events.some((event) => event.event_type === 'report_requirement.disclosed')).toBe(false);
    expect(provider.calls.some((call) => call.operationKey.startsWith('round:'))).toBe(false);
    expect(verifyEvidenceBundle(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('restores after all t0 commits without recollecting t0 or disclosing twice', async () => {
    const run = campaign.runs.find((candidate) => candidate.condition_id === 'D')!;
    const first = new Phase1aRuntime();
    const runId = first.createRun(adaptWp01Run(campaign, run.run_id, admission));
    await first.run(runId, new DeterministicMockProvider(), { stopAfterOperations: 3 });
    const second = new Phase1aRuntime();
    second.restore(JSON.parse(JSON.stringify(first.evidence(runId))));
    const provider = new DeterministicMockProvider();
    expect(await second.run(runId, provider)).toBe('COMPLETE');
    expect(provider.calls.some((call) => call.operationKey.startsWith('t0:'))).toBe(false);
    expect(second.evidence(runId).events.filter((event) => event.event_type === 'report_requirement.disclosed')).toHaveLength(1);
  });
});
