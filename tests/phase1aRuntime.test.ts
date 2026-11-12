import { describe, expect, it } from 'vitest';
import { canonicalize, configHash } from '../src/config/hash.js';
import {
  DeterministicMockProvider,
  EvidenceLedger,
  Phase1aRuntime,
  createFixtureManifest,
  createManifest,
  inferState,
  replayEvidence,
  verifyEvidenceBundle,
  type EvidenceBundle,
  type Phase1aManifest,
  type Phase1aProvider,
  type ProviderCallSpec,
  type ProviderResponse,
} from '../src/phase1a/index.js';

function fixedClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 9, 20, 0, 0, tick++)).toISOString();
}

function homogeneousNoReport(): Phase1aManifest {
  const base = createFixtureManifest();
  return createManifest({
    ...structuredClone(base), cell: 'A', reportEnabled: false,
    participants: [
      { id: 'agent_1', provider: 'mock', model: 'gemma-fixture', configuration: { temperature: 0 } },
      { id: 'agent_2', provider: 'mock', model: 'gemma-fixture', configuration: { temperature: 0 } },
      { id: 'agent_3', provider: 'mock', model: 'gemma-fixture', configuration: { temperature: 0 } },
    ],
  });
}

describe('Phase 1A contract and deterministic host', () => {
  it('[CTX-01] [CTX-02] [CTX-04] [CTX-05] uses a provider-neutral deterministic runtime with explicit extension boundaries', async () => {
    const manifest = createFixtureManifest();
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(manifest);
    const provider = new DeterministicMockProvider();
    await runtime.run(runId, provider);

    expect(runtime.state(runId)).toBe('COMPLETE');
    expect(provider.calls).toHaveLength(31);
    expect(provider.calls.every((call) => call.systemPrompt.includes('Phase 1A') || call.systemPrompt.includes('reviewer'))).toBe(true);
    expect(runtime.evidence(runId).manifest.contractVersion).toBe('1A-0.1');
  });

  it('[CTX-03] reuses canonical hashes, timestamps, immutable artifacts, and response envelopes', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, new DeterministicMockProvider(), { stopAfterOperations: 1 });
    const before = runtime.evidence(runId);
    const changed = before.artifacts[0]!;
    changed.content = 'external mutation';
    expect(runtime.evidence(runId).artifacts[0]!.content).not.toBe('external mutation');
    expect(before.events.every((event) => event.created_at.endsWith('Z'))).toBe(true);
    expect(before.artifacts[0]!.content_hash).toMatch(/^sha256:/);
  });

  it('[EXP-01] [EXP-02] [EXP-03] [EXP-04] [EXP-05] [EXP-06] [EXP-07] [EXP-09] [EXP-10] freezes the exact six-round and checkpoint contract', () => {
    const manifest = createFixtureManifest();
    expect(manifest.rounds.map((round) => round.topic)).toEqual(['human-problem', 'human-problem', 'redesign', 'redesign', 'agent-role', 'agent-role']);
    expect(manifest.reportEnabled).toBe(true);
    expect(() => { (manifest.rounds as Array<unknown>).push({}); }).toThrow();
    expect(() => createManifest({ ...structuredClone(manifest), rounds: manifest.rounds.slice(0, 5) as never })).toThrow(/six/);
    expect(() => createManifest({ ...structuredClone(manifest), reportEnabled: false })).toThrow(/Report condition/);
    expect(() => createManifest({ ...structuredClone(manifest), cell: 'A', reportEnabled: false })).toThrow(/homogeneous/);
  });

  it('[EXP-11] [EXP-12] [EXP-13] requires an explicit approved order and preserves declared protocol variations', () => {
    const manifest = createFixtureManifest({ variations: ['round-4 prompt wording corrected before launch'] });
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(manifest);
    const deviation = runtime.evidence(runId).events.find((event) => event.event_type === 'protocol_deviation.recorded');
    expect(deviation?.payload).toMatchObject({ preserved: true, variation: manifest.variations[0] });
    expect(() => createManifest({ ...structuredClone(manifest), speakingOrderDecision: '' })).toThrow(/explicitly/);
    expect(manifest.speakingOrder).toHaveLength(6);
  });
});

describe('Phase 1A orchestration, visibility, and report workflow', () => {
  it('[ORCH-01] [ORCH-02] advances from the frozen manifest only after durable evidence commits', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest(), (eventType) => eventType === 'operation.committed');
    await expect(runtime.run(runId, new DeterministicMockProvider())).rejects.toThrow(/persistence rejected/);
    expect(runtime.state(runId)).toBe('CREATED');
    expect(runtime.evidence(runId).events.some((event) => event.event_type === 'operation.committed')).toBe(false);
  });

  it('[ORCH-03] [ORCH-04] [VIS-01] [EXP-08] isolates private checkpoint canaries from public and peer contexts', async () => {
    class CanaryProvider implements Phase1aProvider {
      calls: ProviderCallSpec[] = [];
      async invoke(spec: ProviderCallSpec): Promise<ProviderResponse> {
        this.calls.push(structuredClone(spec));
        const content = spec.operationKey.startsWith('t0:') ? `PRIVATE_${spec.participantId}` : `PUBLIC_${spec.operationKey}`;
        return { outcome: 'success', provider: spec.provider, model: spec.model, content, usage: null, finishReason: 'stop', raw: {} };
      }
    }
    const provider = new CanaryProvider();
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, provider);
    const publicCalls = provider.calls.filter((call) => call.operationKey.startsWith('round:'));
    expect(publicCalls.flatMap((call) => call.context).map((message) => message.content).join('|')).not.toContain('PRIVATE_');
    const ownT1 = provider.calls.find((call) => call.operationKey === 't1:agent_1')!;
    expect(ownT1.context.map((message) => message.content)).toContain('PRIVATE_agent_1');
    expect(ownT1.context.map((message) => message.content).join('|')).not.toContain('PRIVATE_agent_2');
  });

  it('[VIS-02] [VIS-03] [RPT-01] [RPT-03] [RPT-04] [RPT-05] [RPT-06] assembles isolated review contexts and an ordered exact revision context', async () => {
    const provider = new DeterministicMockProvider();
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, provider);
    const review1 = provider.calls.find((call) => call.operationKey === 'report:review1')!;
    const review2 = provider.calls.find((call) => call.operationKey === 'report:review2')!;
    const revision = provider.calls.find((call) => call.operationKey === 'report:revised')!;
    const draft = provider.calls.find((call) => call.operationKey === 'report:draft')!;
    expect(draft.context).toHaveLength(19);
    expect(review1.context).toHaveLength(1);
    expect(review2.context).toHaveLength(1);
    expect(review1.context).toEqual(review2.context);
    expect(revision.context.map((item) => item.content)).toEqual(['report:draft:success', 'report:review1:success', 'report:review2:success']);
  });

  it('[RPT-02] [RPT-07] [RPT-08] keeps report artifacts immutable and t2 strictly after the revised report', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, new DeterministicMockProvider());
    const bundle = runtime.evidence(runId);
    const reportKinds = bundle.artifacts.filter((artifact) => artifact.kind.startsWith('report.')).map((artifact) => artifact.kind);
    expect(reportKinds).toEqual(['report.draft', 'report.review1', 'report.review2', 'report.revised']);
    const revisedSeq = bundle.events.find((event) => event.event_type === 'report.revised.completed')!.sequence;
    const firstT2 = bundle.events.find((event) => event.event_type === 'checkpoint.t2.completed')!.sequence;
    expect(firstT2).toBeGreaterThan(revisedSeq);
    const draft = bundle.artifacts.find((artifact) => artifact.kind === 'report.draft')!;
    draft.content = 'mutated';
    expect(runtime.evidence(runId).artifacts.find((artifact) => artifact.kind === 'report.draft')!.content).toBe('report:draft:success');
  });

  it('[RPT-09] [ORCH-08] stores refusal as terminal behavior and retries technical failure separately', async () => {
    const provider = new DeterministicMockProvider({ 'report:review1': ['refused'], 'report:review2': ['timeout', 'success'] });
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    expect(await runtime.run(runId, provider)).toBe('COMPLETE');
    const calls = runtime.evidence(runId).provider_calls;
    expect(calls.filter((call) => call.operation_key === 'report:review1').map((call) => call.terminal_status)).toEqual(['refused']);
    expect(calls.filter((call) => call.operation_key === 'report:review2').map((call) => call.terminal_status)).toEqual(['timeout', 'success']);
  });

  it('[ORCH-07] [ORCH-10] [DRY-03] resumes on a fresh runtime without duplicating committed calls', async () => {
    const firstProvider = new DeterministicMockProvider({ 'round:1:agent_1': ['timeout', 'success'] });
    const first = new Phase1aRuntime(fixedClock());
    const runId = first.createRun(createFixtureManifest());
    await first.run(runId, firstProvider, { stopAfterOperations: 5 });
    const partial = first.evidence(runId);
    const committed = partial.events.filter((event) => event.event_type === 'operation.committed').length;
    const secondProvider = new DeterministicMockProvider();
    const second = new Phase1aRuntime(fixedClock());
    second.restore(partial);
    expect(await second.run(runId, secondProvider)).toBe('COMPLETE');
    expect(secondProvider.calls).toHaveLength(31 - committed);
    expect(second.evidence(runId).events.filter((event) => event.event_type === 'operation.committed')).toHaveLength(31);
  });

  it('[ORCH-09] [DRY-01] [DRY-02] always completes six rounds even when every answer claims consensus', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(homogeneousNoReport());
    await runtime.run(runId, new DeterministicMockProvider());
    const roundArtifacts = runtime.evidence(runId).artifacts.filter((artifact) => artifact.kind.startsWith('round.'));
    expect(roundArtifacts).toHaveLength(18);
    expect(new Set(roundArtifacts.map((artifact) => artifact.kind))).toHaveLength(6);
    expect(runtime.evidence(runId).artifacts.some((artifact) => artifact.kind.startsWith('report.') || artifact.kind === 'checkpoint.t2')).toBe(false);
    expect(runtime.state(runId)).toBe('COMPLETE');
  });

  it('[EXP-14] discloses the frozen report condition after every t0 commit and before the first public turn', async () => {
    const provider = new DeterministicMockProvider();
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, provider, { stopAfterOperations: 4 });
    const bundle = runtime.evidence(runId);
    const disclosure = bundle.events.find((event) => event.event_type === 'report_requirement.disclosed')!;
    const t0Commits = bundle.events.filter((event) => event.event_type === 'operation.committed' && String(event.payload.operation_key).startsWith('t0:'));
    const firstRoundCall = bundle.events.find((event) => event.event_type === 'provider_call.started' && event.payload.operation_key === 'round:1:agent_1')!;
    expect(t0Commits).toHaveLength(3);
    expect(disclosure.sequence).toBeGreaterThan(Math.max(...t0Commits.map((event) => event.sequence)));
    expect(disclosure.sequence).toBeLessThan(firstRoundCall.sequence);
    expect(provider.calls.filter((call) => call.operationKey.startsWith('t0:')).every((call) => call.context.every((message) => !message.content.includes('joint report')))).toBe(true);
    expect(provider.calls.find((call) => call.operationKey === 'round:1:agent_1')!.context.map((message) => message.content)).toContain(createFixtureManifest().reportPrompts.disclosure);

    const noReport = new Phase1aRuntime(fixedClock());
    const noReportId = noReport.createRun(homogeneousNoReport());
    await noReport.run(noReportId, new DeterministicMockProvider(), { stopAfterOperations: 4 });
    expect(noReport.evidence(noReportId).events.some((event) => event.event_type === 'report_requirement.disclosed')).toBe(false);
    expect(() => createManifest({ ...structuredClone(createFixtureManifest()), reportPrompts: { ...createFixtureManifest().reportPrompts, disclosure: '' } })).toThrow(/supplied explicitly/);
  });

  it('[ORCH-11] emits explicit budget evidence and preserves the full context hash', async () => {
    const manifest = createFixtureManifest({ limits: { maxCalls: 1, maxTokens: 100_000, maxRetries: 0 } });
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(manifest);
    expect(await runtime.run(runId, new DeterministicMockProvider())).toBe('FAILED');
    const exhausted = runtime.evidence(runId).events.find((event) => event.event_type === 'budget.exhausted');
    expect(exhausted?.payload.context_hash).toMatch(/^sha256:/);
  });

  it('[P07] rejects report-contaminated t0 prompts before any provider call', () => {
    const base = createFixtureManifest();
    expect(() => createFixtureManifest({
      checkpoints: { ...base.checkpoints, t0: 'Condition B will prepare a joint report. Give a baseline.' },
    })).toThrow(/t0 prompt.*report condition/i);
  });

  it('[P11] rejects malformed cells, fixture compositions, and approval markers', () => {
    const base = createFixtureManifest();
    const homogeneous = base.participants.map((participant) => ({ ...participant, model: 'gemma-fixture' })) as unknown as Phase1aManifest['participants'];
    const wrongFamilyA = homogeneous.map((participant) => ({ ...participant, model: 'not-gemma' })) as unknown as Phase1aManifest['participants'];
    const twoModelD = base.participants.map((participant, index) => ({ ...participant, model: index === 2 ? 'gemini-fixture' : participant.model })) as unknown as Phase1aManifest['participants'];

    expect(() => createFixtureManifest({ cell: 'A', reportEnabled: false, participants: wrongFamilyA })).toThrow(/composition/i);
    expect(() => createFixtureManifest({ participants: twoModelD })).toThrow(/heterogeneous|composition/i);
    expect(() => createFixtureManifest({ cell: 'Z' as Phase1aManifest['cell'] })).toThrow(/cell must be/i);
    expect(() => createFixtureManifest({ approvedAt: '', contractVersion: 'September-S1-S8' })).toThrow(/approval marker/i);
  });

  it('[S03] requires canonical WP01 admission for every non-fixture execution', () => {
    const base = createFixtureManifest();
    for (const admissionClass of ['engineering', 'scientific'] as const) {
      const forged = createManifest({
        ...structuredClone(base),
        source: {
          ...base.source,
          admissionClass,
          campaignHash: `sha256:${'0'.repeat(64)}`,
          runManifestHash: `sha256:${'0'.repeat(64)}`,
          adapterInputHash: `sha256:${'0'.repeat(64)}`,
        },
      });
      expect(() => new Phase1aRuntime(fixedClock()).createRun(forged)).toThrow(/canonical WP01 adapter admission/i);
    }
  });

  it('[P22] keeps FAILED runs terminal across later run calls', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    const failing = new DeterministicMockProvider({ 't0:agent_1': ['timeout', 'timeout'] });
    expect(await runtime.run(runId, failing)).toBe('FAILED');
    const before = runtime.evidence(runId);
    const recovery = new DeterministicMockProvider();

    expect(await runtime.run(runId, recovery)).toBe('FAILED');
    expect(recovery.calls).toHaveLength(0);
    expect(runtime.evidence(runId).provider_calls).toHaveLength(before.provider_calls.length);
    expect(runtime.evidence(runId).events).toHaveLength(before.events.length);
  });

  it('[P16] charges a conservative token when usage is unavailable and stops at the bound', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest({ limits: { maxCalls: 40, maxTokens: 1, maxRetries: 0 } }));
    const provider: Phase1aProvider = {
      invoke: async (spec) => ({
        outcome: 'success', provider: spec.provider, model: spec.model, content: 'usage unavailable',
        usage: null, finishReason: 'stop', raw: {},
      }),
    };

    expect(await runtime.run(runId, provider)).toBe('FAILED');

    const bundle = runtime.evidence(runId);
    expect(bundle.provider_calls).toHaveLength(1);
    expect(bundle.provider_calls[0]?.usage).toBeNull();
    expect(bundle.events.find((event) => event.event_type === 'budget.exhausted')?.payload.tokens_used).toBe(1);
    expect(bundle.events.some((event) => event.event_type === 'report_requirement.disclosed')).toBe(false);
    expect(bundle.provider_calls.some((call) => call.operation_key.startsWith('round:'))).toBe(false);
  });

  it.each([NaN, Infinity])('[B02-%s] rejects non-finite execution limits', (limit) => {
    expect(() => createFixtureManifest({ limits: { maxCalls: limit, maxTokens: 1_000, maxRetries: limit } })).toThrow(/finite integer limits/i);
  });

  it('[P15] preserves permission_denied as a typed terminal technical cause', async () => {
    let calls = 0;
    const provider: Phase1aProvider = {
      invoke: async () => {
        calls += 1;
        throw new Error('permission_denied: audit-only synthetic');
      },
    };
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());

    expect(await runtime.run(runId, provider)).toBe('FAILED');

    const bundle = runtime.evidence(runId);
    expect(calls).toBe(1);
    expect(bundle.provider_calls[0]?.terminal_status).toBe('permission_denied');
    expect(bundle.artifacts.some((artifact) => artifact.kind === 'checkpoint.t0')).toBe(false);
    expect(bundle.events.some((event) => event.event_type === 'operation.committed')).toBe(false);
  });

  it('[B03-secret-format] rejects password sentinels before execution', () => {
    expect(() => createFixtureManifest({
      checkpoints: { t0: 'password=AUDIT_SYNTHETIC_NOT_A_REAL_SECRET', t1: 'x', t2: 'y' },
    })).toThrow(/Secrets/i);
  });

  it('[S05-max_tokens] archives legitimate token-limit parameters without redaction', async () => {
    const base = createFixtureManifest();
    const configuration = { temperature: 0.37, top_p: 0.86, seed: 777, max_tokens: 64 };
    const manifest = createFixtureManifest({
      participants: base.participants.map((participant) => ({ ...participant, configuration })) as unknown as Phase1aManifest['participants'],
    });
    const runtime = new Phase1aRuntime(fixedClock());
    const provider = new DeterministicMockProvider();
    const runId = runtime.createRun(manifest);
    await runtime.run(runId, provider, { stopAfterOperations: 1 });

    const bundle = runtime.evidence(runId);
    const call = bundle.provider_calls[0]!;
    const request = JSON.parse(bundle.artifacts.find((artifact) => artifact.artifact_id === call.request_artifact_ref)!.content) as ProviderCallSpec;
    expect(provider.calls[0]?.configuration).toEqual(configuration);
    expect(call.configuration).toEqual(configuration);
    expect(request.configuration).toEqual(configuration);
    expect(configHash(request.configuration)).toBe(configHash(configuration));
    expect(verifyEvidenceBundle(bundle)).toEqual({ valid: true, errors: [] });
  });
});

describe('Phase 1A evidence, export, and dry-run acceptance', () => {
  it('[ORCH-05] [ORCH-06] [EVD-01] [EVD-02] [EVD-03] [EVD-04] records a common provider envelope with distinct hashes and protected raw artifacts', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, new DeterministicMockProvider(), { stopAfterOperations: 1 });
    const bundle = runtime.evidence(runId);
    const call = bundle.provider_calls[0]!;
    expect(call).toMatchObject({ provider: 'mock', model: 'gemma-fixture', attempt: 1, terminal_status: 'success' });
    expect(new Set([call.system_prompt_hash, call.user_prompt_hash, call.context_hash, call.raw_response_hash]).size).toBeGreaterThan(2);
    expect(call.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(bundle.artifacts.find((artifact) => artifact.artifact_id === call.raw_artifact_ref)?.visibility).toBe('operator');
    expect(bundle.events.some((event) => canonicalizeForTest(event.payload).includes('fixture'))).toBe(false);
    const request = JSON.parse(bundle.artifacts.find((artifact) => artifact.artifact_id === call.request_artifact_ref)!.content) as ProviderCallSpec;
    expect(request.configuration).toEqual({ temperature: 0 });
    expect(call.configuration).toEqual(request.configuration);
  });

  it('stores unavailable provider usage explicitly as null rather than zero', async () => {
    const provider: Phase1aProvider = { invoke: async (spec) => ({ outcome: 'success', provider: spec.provider, model: spec.model, content: 'ok', usage: null, finishReason: 'stop', raw: {} }) };
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, provider, { stopAfterOperations: 1 });
    expect(runtime.evidence(runId).provider_calls[0]!.usage).toBeNull();
  });

  it('[EVD-05] [DRY-06] links successful retries to preserved failed attempts', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, new DeterministicMockProvider({ 't0:agent_1': ['timeout', 'success'] }), { stopAfterOperations: 1 });
    const attempts = runtime.evidence(runId).provider_calls.filter((call) => call.operation_key === 't0:agent_1');
    expect(attempts.map((attempt) => attempt.terminal_status)).toEqual(['timeout', 'success']);
    expect(attempts[1]!.previous_attempt_ids).toEqual([attempts[0]!.call_id]);
  });

  it('[EVD-06] [EVD-07] [DRY-10] detects event deletion, reorder, and artifact substitution', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, new DeterministicMockProvider());
    const good = runtime.evidence(runId);
    expect(verifyEvidenceBundle(good)).toEqual({ valid: true, errors: [] });
    const removed = structuredClone(good); removed.events.splice(3, 1);
    expect(verifyEvidenceBundle(removed).valid).toBe(false);
    const reordered = structuredClone(good); [reordered.events[3], reordered.events[4]] = [reordered.events[4]!, reordered.events[3]!];
    expect(verifyEvidenceBundle(reordered).valid).toBe(false);
    const substituted = structuredClone(good); substituted.artifacts[0]!.content = 'tampered';
    expect(verifyEvidenceBundle(substituted).errors.some((error) => error.startsWith('artifact_hash'))).toBe(true);
    const changedCall = structuredClone(good); changedCall.provider_calls[0]!.model = 'tampered-model';
    expect(verifyEvidenceBundle(changedCall).errors.some((error) => error.startsWith('call_model'))).toBe(true);
    const changedIndex = structuredClone(good); changedIndex.artifacts_index[0]!.kind = 'tampered-kind';
    expect(verifyEvidenceBundle(changedIndex).errors).toContain('artifacts_index');
  });

  it('[RPT-10] rejects restored evidence when the manifest changes the recorded report roles', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest({ replication: 1 }));
    const bundle = runtime.evidence(runId);
    bundle.manifest = { ...structuredClone(bundle.manifest), replication: 2 };
    bundle.manifest_hash = configHash(bundle.manifest);

    expect(verifyEvidenceBundle(bundle).errors).toContain('run_created_manifest_hash');
    expect(() => new Phase1aRuntime(fixedClock()).restore(bundle)).toThrow(/invalid evidence/);
  });

  it('[RPT-10] rejects a report provider call assigned to a role inconsistent with the frozen plan', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest({ replication: 1 }));
    await runtime.run(runId, new DeterministicMockProvider());
    const bundle = runtime.evidence(runId);
    const call = bundle.provider_calls.find((candidate) => candidate.operation_key === 'report:draft')!;
    const request = bundle.artifacts.find((artifact) => artifact.artifact_id === call.request_artifact_ref)!;
    const requestBody = JSON.parse(request.content) as ProviderCallSpec;
    requestBody.participantId = 'agent_2';
    request.content = canonicalizeForTest(requestBody);
    request.content_hash = configHash(request.content);
    call.participant_id = 'agent_2';
    bundle.artifacts_index.find((artifact) => artifact.artifact_id === request.artifact_id)!.content_hash = request.content_hash;

    expect(verifyEvidenceBundle(bundle).errors).toContain(`call_operation_participant:${call.call_id}`);
  });

  it('[D02] [D03] [D04] rejects resealed changed, reassigned, or missing report-role evidence', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest({ replication: 2 }));
    await runtime.run(runId, new DeterministicMockProvider(), { stopAfterOperations: 25 });
    const source = runtime.evidence(runId);
    expect(verifyEvidenceBundle(source)).toEqual({ valid: true, errors: [] });
    const alternate = { writer_id: 'agent_1', reviewer_1_id: 'agent_2', reviewer_2_id: 'agent_3' };

    const changedRoles = structuredClone(source);
    Object.assign(changedRoles.events.find((event) => event.event_type === 'report.roles_allocated')!.payload, alternate);
    resealEvidence(changedRoles);
    expect(verifyEvidenceBundle(changedRoles).errors).toContain('report_role_allocation');
    expect(() => new Phase1aRuntime(fixedClock()).restore(changedRoles)).toThrow(/invalid evidence/);

    const reassignedDraft = structuredClone(source);
    Object.assign(reassignedDraft.events.find((event) => event.event_type === 'report.roles_allocated')!.payload, alternate);
    const draftCall = reassignedDraft.provider_calls.find((call) => call.operation_key === 'report:draft')!;
    const alternateWriter = reassignedDraft.manifest.participants[0]!;
    Object.assign(draftCall, {
      participant_id: alternateWriter.id,
      provider: alternateWriter.provider,
      model: alternateWriter.model,
      configuration: structuredClone(alternateWriter.configuration),
    });
    const draftRequest = reassignedDraft.artifacts.find((artifact) => artifact.artifact_id === draftCall.request_artifact_ref)!;
    const draftSpec = JSON.parse(draftRequest.content) as ProviderCallSpec;
    Object.assign(draftSpec, {
      participantId: alternateWriter.id,
      provider: alternateWriter.provider,
      model: alternateWriter.model,
      configuration: structuredClone(alternateWriter.configuration),
    });
    draftRequest.content = canonicalize(draftSpec);
    draftRequest.content_hash = configHash(draftRequest.content);
    draftRequest.owner_id = alternateWriter.id;
    reassignedDraft.artifacts.find((artifact) => artifact.artifact_id === draftCall.raw_artifact_ref)!.owner_id = alternateWriter.id;
    reassignedDraft.artifacts.find((artifact) => artifact.kind === 'report.draft')!.owner_id = alternateWriter.id;
    for (const event of reassignedDraft.events) {
      if (event.payload.operation_key === 'report:draft' && event.actor_id !== 'host') event.actor_id = alternateWriter.id;
    }
    resealEvidence(reassignedDraft);
    const reassignedErrors = verifyEvidenceBundle(reassignedDraft).errors;
    expect(reassignedErrors).toContain('report_role_allocation');
    expect(reassignedErrors).toContain(`call_operation_participant:${draftCall.call_id}`);
    expect(reassignedErrors.some((error) => error.startsWith('operation_commit_artifact:'))).toBe(true);
    expect(() => new Phase1aRuntime(fixedClock()).restore(reassignedDraft)).toThrow(/invalid evidence/);

    const missingAllocation = structuredClone(source);
    missingAllocation.events = missingAllocation.events.filter((event) => event.event_type !== 'report.roles_allocated');
    resealEvidence(missingAllocation);
    expect(verifyEvidenceBundle(missingAllocation).errors).toContain('report_role_allocation_count');
    expect(() => new Phase1aRuntime(fixedClock()).restore(missingAllocation)).toThrow(/invalid evidence/);
  });

  it('[B01] rejects deletion of the final event using the exported evidence head seal', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, new DeterministicMockProvider());
    const truncated = runtime.evidence(runId);
    expect(truncated.events.pop()?.event_type).toBe('run.completed');

    const errors = verifyEvidenceBundle(truncated).errors;
    expect(errors).toContain('integrity_event_count');
    expect(errors).toContain('integrity_event_head_hash');
    expect(() => new Phase1aRuntime(fixedClock()).restore(truncated)).toThrow(/invalid evidence/);
  });

  it('[S09] rejects coherent call and stored-request identity or configuration changes against the manifest', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, new DeterministicMockProvider(), { stopAfterOperations: 4 });
    const bundle = runtime.evidence(runId);
    const call = bundle.provider_calls.find((candidate) => candidate.operation_key === 'round:1:agent_1')!;
    const requestArtifact = bundle.artifacts.find((artifact) => artifact.artifact_id === call.request_artifact_ref)!;
    const request = JSON.parse(requestArtifact.content) as ProviderCallSpec;
    Object.assign(call, {
      provider: 'changed-provider',
      model: 'changed-model',
      configuration: { temperature: 0.9 },
      system_prompt_hash: configHash('changed system'),
      user_prompt_hash: configHash('changed prompt'),
      context_hash: configHash([]),
      context_message_ids: [],
    });
    Object.assign(request, {
      provider: call.provider,
      model: call.model,
      configuration: structuredClone(call.configuration),
      systemPrompt: 'changed system',
      userPrompt: 'changed prompt',
      context: [],
    });
    requestArtifact.content = canonicalize(request);
    requestArtifact.content_hash = configHash(requestArtifact.content);
    bundle.artifacts_index.find((artifact) => artifact.artifact_id === requestArtifact.artifact_id)!.content_hash = requestArtifact.content_hash;

    const errors = verifyEvidenceBundle(bundle).errors;
    expect(errors).toContain(`call_operation_provider:${call.call_id}`);
    expect(errors).toContain(`call_operation_model:${call.call_id}`);
    expect(errors).toContain(`call_operation_configuration:${call.call_id}`);
    expect(errors).toContain(`call_operation_system_prompt:${call.call_id}`);
    expect(errors).toContain(`call_operation_user_prompt:${call.call_id}`);
    expect(errors).toContain(`call_operation_context:${call.call_id}`);
  });

  it('[EVD-08] binds every derived metric to exact events and an algorithm version', () => {
    const manifest = createFixtureManifest();
    const ledger = new EvidenceLedger('run_metric', manifest, fixedClock());
    const source = ledger.append('round.1.completed', 'public', 'host');
    expect(ledger.metric('turn_count', 1, [source.event_id], 'turn-count@1')).toEqual({ name: 'turn_count', value: 1, source_event_ids: [source.event_id], algorithm_version: 'turn-count@1' });
    expect(() => ledger.metric('bad', 1, ['missing'], 'v1')).toThrow(/source event/);
  });

  it('[VIS-04] [VIS-07] [EVD-09] exports manifest, visibility, artifact index, call references, and integrity', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, new DeterministicMockProvider());
    const bundle = runtime.evidence(runId);
    expect(bundle.schema_version).toBe('phase1a-0.2');
    expect(bundle.artifacts_index).toHaveLength(bundle.artifacts.length);
    expect(new Set(bundle.artifacts_index.map((artifact) => artifact.visibility))).toEqual(new Set(['public', 'private-agent', 'reviewer-isolated', 'operator']));
    expect(bundle.provider_calls.every((call) => call.context_hash && call.raw_artifact_ref)).toBe(true);
    expect(bundle.integrity.valid).toBe(true);
  });

  it('[VIS-05] rejects secrets in manifests, prompts, and participant-visible artifacts while redacting operator payloads', () => {
    const base = createFixtureManifest();
    expect(() => createManifest({ ...structuredClone(base), checkpoints: { ...base.checkpoints, t0: 'api_key=supersecretvalue' } })).toThrow(/Secrets/);
    const ledger = new EvidenceLedger('run_secret', base, fixedClock());
    expect(() => ledger.artifact('public', 'public', null, 'Authorization: Bearer hidden')).toThrow(/Secrets/);
    expect(ledger.append('operator.log', 'operator', 'host', { apiKey: 'hidden' }).payload.apiKey).toBe('[REDACTED]');
  });

  it('[VIS-06] makes restored context assembly byte-identical for the same manifest and event history', async () => {
    const initial = new Phase1aRuntime(fixedClock());
    const runId = initial.createRun(createFixtureManifest());
    await initial.run(runId, new DeterministicMockProvider(), { stopAfterOperations: 4 });
    const bundle = initial.evidence(runId);
    const p1 = new DeterministicMockProvider(); const p2 = new DeterministicMockProvider();
    const a = new Phase1aRuntime(fixedClock()); const b = new Phase1aRuntime(fixedClock());
    a.restore(bundle); b.restore(bundle);
    await a.run(runId, p1, { stopAfterOperations: 1 }); await b.run(runId, p2, { stopAfterOperations: 1 });
    expect(p1.calls[0]!.context).toEqual(p2.calls[0]!.context);
  });

  it('[DRY-04] [DRY-05] [DRY-09] completes the report fixture without checkpoint or reviewer canary leakage and exports public history only', async () => {
    class FullCanaryProvider implements Phase1aProvider {
      calls: ProviderCallSpec[] = [];
      async invoke(spec: ProviderCallSpec): Promise<ProviderResponse> {
        this.calls.push(structuredClone(spec));
        const canary = spec.operationKey.startsWith('t') || spec.operationKey.startsWith('report:review') ? `CANARY_${spec.operationKey}` : `OUTPUT_${spec.operationKey}`;
        return { outcome: 'success', provider: spec.provider, model: spec.model, content: canary, usage: null, finishReason: 'stop', raw: {} };
      }
    }
    const provider = new FullCanaryProvider();
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, provider);
    const bundle = runtime.evidence(runId);
    expect(bundle.artifacts.filter((artifact) => artifact.visibility === 'public')).toHaveLength(20);
    expect(bundle.artifacts.filter((artifact) => artifact.kind === 'checkpoint.t2')).toHaveLength(3);
    expect(bundle.events.filter((event) => event.visibility === 'public').every((event) => !event.event_type.startsWith('checkpoint.'))).toBe(true);
    const publicAndReviewerCalls = provider.calls.filter((call) => call.operationKey.startsWith('round:') || call.operationKey === 'report:draft' || call.operationKey.startsWith('report:review'));
    expect(publicAndReviewerCalls.flatMap((call) => call.context).map((item) => item.content).join('|')).not.toContain('CANARY_t');
    expect(provider.calls.find((call) => call.operationKey === 'report:review1')!.context.map((item) => item.content).join('|')).not.toContain('CANARY_report:review2');
    expect(provider.calls.find((call) => call.operationKey === 'report:review2')!.context.map((item) => item.content).join('|')).not.toContain('CANARY_report:review1');
  });

  it('[DRY-07] [DRY-08] preserves refusal semantics and a replayable partial bundle after terminal failure', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest({ limits: { maxCalls: 40, maxTokens: 100_000, maxRetries: 0 } }));
    const provider = new DeterministicMockProvider({ 't0:agent_1': ['refused'], 't0:agent_2': ['provider_error'] });
    expect(await runtime.run(runId, provider)).toBe('FAILED');
    const bundle = runtime.evidence(runId);
    expect(bundle.provider_calls[0]!.terminal_status).toBe('refused');
    expect(bundle.provider_calls[1]!.terminal_status).toBe('provider_error');
    expect(replayEvidence(bundle)).toMatchObject({ valid: true, state: 'FAILED' });
  });

  it('[DRY-11] lets a second operator verify and explain every committed transition from evidence alone', async () => {
    const runtime = new Phase1aRuntime(fixedClock());
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, new DeterministicMockProvider());
    const replay = replayEvidence(runtime.evidence(runId));
    expect(replay).toMatchObject({ valid: true, state: 'COMPLETE' });
    expect(replay.transitions).toHaveLength(31);
    expect(replay.transitions[0]).toMatchObject({ operation: 't0:agent_1', state: 'T0' });
    expect(replay.transitions.at(-1)).toMatchObject({ operation: 't2:agent_3', state: 'T2' });
    expect(inferState(runtime.evidence(runId).events)).toBe('COMPLETE');
  });
});

function canonicalizeForTest(value: unknown): string {
  return JSON.stringify(value);
}

function resealEvidence(bundle: EvidenceBundle): void {
  let previous: string | null = null;
  bundle.events.forEach((event, index) => {
    event.sequence = index + 1;
    event.previous_event_hash = previous;
    const { event_hash: _oldHash, ...base } = event;
    event.event_hash = configHash(base);
    previous = event.event_hash;
  });
  bundle.artifacts_index = bundle.artifacts.map(({ artifact_id, kind, visibility, content_hash }) => ({ artifact_id, kind, visibility, content_hash }));
  bundle.integrity.event_count = bundle.events.length;
  bundle.integrity.event_head_hash = bundle.events.at(-1)?.event_hash ?? null;
  bundle.integrity.artifact_count = bundle.artifacts.length;
  bundle.integrity.provider_call_count = bundle.provider_calls.length;
}
