import { describe, expect, it } from 'vitest';
import { buildSyntheticCampaign, renderPrompt, SELECTED_REPORT_NOTICE_TIMING } from '../src/phase1a/wp01/index.js';
import { DeterministicMockProvider, Phase1aRuntime, createFixtureManifest, replayEvidence, verifyEvidenceBundle, type Phase1aManifest, type ProviderCallSpec } from '../src/phase1a/index.js';
import { createReplayPlan, executeReplayPlan, ScriptedReplayProvider, verifyReplayCell } from '../src/phase1a/contextLockedReplay.js';

const campaign = buildSyntheticCampaign({ report_notice_timing: SELECTED_REPORT_NOTICE_TIMING });
type PlannedRun = typeof campaign.runs[number];

// Test projection only: explicit fixture order, budget and writer allocation are
// not scientific approvals or a production WP01 -> WP02 manifest adapter.
function fixture(run: PlannedRun): Phase1aManifest {
  const base = createFixtureManifest();
  const prompt = (id: string, round = '') => renderPrompt(campaign.prompt_registry.prompts.find(p => p.id === id)!, { topic: 'offline integration fixture', round });
  return createFixtureManifest({
    manifestId: run.run_id, experimentId: campaign.campaign_id,
    contractVersion: campaign.study_contract.protocol_revision,
    cell: run.condition_id, replication: run.replicate, reportEnabled: run.report_required,
    participants: run.bindings.map((b, i) => ({ id: `agent_${i + 1}`, provider: 'mock', model: b.model_id!, configuration: b.parameters })) as unknown as Phase1aManifest['participants'],
    rounds: base.rounds.map((r) => ({ ...r, prompt: prompt(`public-round-${r.number}`, String(r.number)) })) as unknown as Phase1aManifest['rounds'],
    checkpoints: { t0: prompt('private-t0'), t1: prompt('private-t6'), t2: prompt('private-tR') },
    reportPrompts: { disclosure: prompt('report-anticipation'), draft: prompt('report-draft'), review1: prompt('report-review-1'), review2: prompt('report-review-2'), revision: prompt('report-revision') },
    variations: ['TEST ONLY: candidate prompts; fixture budget/order/writer assignment; no scientific approval'],
  });
}

function canonicalOperation(key: string): string {
  const privateMatch = key.match(/^(t0|t1|t2):agent_(\d)$/);
  if (privateMatch) return `${({ t0: 'T0', t1: 'T6', t2: 'TR' })[privateMatch[1]!]}:P${privateMatch[2]}`;
  const round = key.match(/^round:(\d):agent_(\d)$/);
  if (round) return `PUBLIC_ROUND_${round[1]}:P${round[2]}`;
  return ({ 'report:draft': 'REPORT_DRAFT', 'report:review1': 'REPORT_REVIEW_1', 'report:review2': 'REPORT_REVIEW_2', 'report:revised': 'REPORT_REVISION' } as Record<string, string>)[key]!;
}

describe('Consolidated WP01/runtime/WP05 offline integration', () => {
  it.each(campaign.runs.map(run => [run.condition_id, run.replicate, run] as const))('matches the complete WP01 invocation agenda for %s replicate %i', async (_cell, _replicate, run) => {
    const runtime = new Phase1aRuntime();
    const provider = new DeterministicMockProvider();
    const manifest = fixture(run);
    const id = runtime.createRun(manifest);
    expect(await runtime.run(id, provider)).toBe('COMPLETE');
    const bundle = runtime.evidence(id);
    expect(provider.calls.map(c => canonicalOperation(c.operationKey))).toEqual(run.agenda.filter(s => s.model_invocation).map(s => s.kind === 'report_production' ? s.id : `${s.id}:${s.participant_slot}`));
    expect(provider.calls).toHaveLength(run.expected_counts.expected_model_invocations);
    expect(bundle.artifacts.filter(a => a.kind.startsWith('checkpoint.'))).toHaveLength(run.expected_counts.private_elicitation_opportunities);
    expect(verifyEvidenceBundle(bundle)).toEqual({ valid: true, errors: [] });
    expect(replayEvidence(bundle).transitions).toHaveLength(run.expected_counts.expected_model_invocations);
    const disclosures = bundle.events.filter(e => e.event_type === 'report_requirement.disclosed');
    expect(disclosures).toHaveLength(run.report_required ? 1 : 0);
    if (run.report_required) {
      const commits = bundle.events.filter(e => e.event_type === 'operation.committed' && String(e.payload.operation_key).startsWith('t0:'));
      expect(commits).toHaveLength(3);
      expect(disclosures[0]!.payload.after_t0_event_ids).toEqual(commits.map(e => e.event_id));
      expect(disclosures[0]!.sequence).toBeGreaterThan(Math.max(...commits.map(e => e.sequence)));
      expect(disclosures[0]!.sequence).toBeLessThan(bundle.events.find(e => e.event_type === 'provider_call.started' && String(e.payload.operation_key).startsWith('round:1:'))!.sequence);
    }
    const privateContents = bundle.artifacts.filter(a => a.kind.startsWith('checkpoint.')).map(a => a.content);
    for (const call of provider.calls.filter(c => c.operationKey.startsWith('round:') || c.operationKey.startsWith('report:'))) {
      expect(call.context.every(m => !privateContents.includes(m.content))).toBe(true);
    }
    expect(provider.calls.filter(c => c.operationKey.startsWith('t0:')).every(c => c.context.length === 0 && !/report/i.test(c.userPrompt))).toBe(true);
    const firstRound = provider.calls.find(c => c.operationKey === 'round:1:agent_1')!;
    expect(firstRound.context.some(m => m.content === manifest.reportPrompts.disclosure)).toBe(run.report_required);
  });

  it('blocks disclosure and public calls if a t0 provider attempt fails terminally', async () => {
    const runtime = new Phase1aRuntime();
    const run = campaign.runs.find(r => r.condition_id === 'B')!;
    const provider = new DeterministicMockProvider({ 't0:agent_3': ['timeout', 'timeout'] });
    const id = runtime.createRun(fixture(run));
    expect(await runtime.run(id, provider)).toBe('FAILED');
    expect(runtime.evidence(id).events.some(e => e.event_type === 'report_requirement.disclosed')).toBe(false);
    expect(provider.calls.some(c => c.operationKey.startsWith('round:'))).toBe(false);
    expect(replayEvidence(runtime.evidence(id))).toMatchObject({ valid: true, state: 'FAILED' });
  });

  it('restores a serialized pre-disclosure bundle without recollecting t0 or disclosing twice', async () => {
    const first = new Phase1aRuntime();
    const id = first.createRun(fixture(campaign.runs.find(r => r.condition_id === 'D')!));
    await first.run(id, new DeterministicMockProvider(), { stopAfterOperations: 3 });
    const serialized = JSON.stringify(first.evidence(id));
    const second = new Phase1aRuntime();
    second.restore(JSON.parse(serialized));
    const provider = new DeterministicMockProvider();
    expect(await second.run(id, provider)).toBe('COMPLETE');
    expect(provider.calls.some(c => c.operationKey.startsWith('t0:'))).toBe(false);
    expect(second.evidence(id).events.filter(e => e.event_type === 'report_requirement.disclosed')).toHaveLength(1);
    expect(second.evidence(id).provider_calls.filter(c => c.operation_key.startsWith('t0:'))).toHaveLength(3);
  });

  it('builds a WP05 draft from exact public request evidence and gates execution pending human review', async () => {
    const runtime = new Phase1aRuntime();
    const id = runtime.createRun(fixture(campaign.runs.find(r => r.condition_id === 'B')!));
    await runtime.run(id, new DeterministicMockProvider());
    const bundle = runtime.evidence(id);
    const call = bundle.provider_calls.find(c => c.operation_key === 'round:1:agent_2')!;
    const request = JSON.parse(bundle.artifacts.find(a => a.artifact_id === call.request_artifact_ref)!.content) as ProviderCallSpec;
    const target = request.context.at(-1)!;
    const plan = createReplayPlan(bundle, {
      parentCallId: call.call_id, targetMessageId: target.sourceArtifactId!,
      targetSpeaker: { participantId: 'agent_1', displayName: 'Fixture One', visibleLabel: 'P1', hiddenLabel: 'a participant' },
      endorsement: { text: 'Fixture endorsement.', provenance: 'synthetic' },
      parentCues: { identityShown: true, endorsementShown: false }, trialCount: 1,
      orderSeed: 'offline-integration-only', retryPolicy: { maxAttempts: 1, delayMs: 0, retryableOutcomes: [] },
    });
    expect(plan.snapshot.contextHash).toBe(call.context_hash);
    expect(plan.snapshot.targetArgument).toBe(target.content);
    expect(plan.snapshot.messages.map(m => m.messageId)).toEqual(call.context_message_ids);
    expect(plan.cells.every(c => verifyReplayCell(plan.snapshot, c).valid)).toBe(true);
    const provider = new ScriptedReplayProvider();
    await expect(executeReplayPlan(plan, bundle, provider)).rejects.toThrow(/human review/);
    expect(provider.calls).toHaveLength(0);
  });
});
