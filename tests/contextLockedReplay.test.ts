import { describe, expect, it } from 'vitest';
import {
  Phase1aRuntime,
  createFixtureManifest,
  type Phase1aProvider,
  type ProviderCallSpec,
  type ProviderResponse,
} from '../src/phase1a/index.js';
import {
  ScriptedReplayProvider,
  approveReplayPlan,
  auditReplaySet,
  buildPhase1aResults,
  createReplayPlan,
  evidenceFingerprint,
  executeReplayPlan,
  replayEligibility,
  verifyReplayCell,
  type ReplayPlan,
  type ReplaySet,
} from '../src/phase1a/contextLockedReplay.js';

function fixedClock(): () => string {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 9, 20, 1, 0, tick++)).toISOString();
}

class ArgumentProvider implements Phase1aProvider {
  readonly calls: ProviderCallSpec[] = [];
  private publicCount = 0;
  constructor(private readonly firstArgument = 'A concise public proposal.') {}
  async invoke(spec: ProviderCallSpec): Promise<ProviderResponse> {
    this.calls.push(structuredClone(spec));
    const isPublicRound = spec.operationKey.startsWith('round:');
    if (isPublicRound) this.publicCount += 1;
    const content = isPublicRound
      ? (this.publicCount === 1 ? this.firstArgument : `Public argument ${this.publicCount}.`)
      : `Private result for ${spec.operationKey}.`;
    return { outcome: 'success', provider: spec.provider, model: spec.model, content, usage: { inputTokens: 8, outputTokens: 3 }, finishReason: 'stop', raw: { fixture: true } };
  }
}

async function completedParent(firstArgument?: string) {
  const runtime = new Phase1aRuntime(fixedClock());
  const runId = runtime.createRun(createFixtureManifest());
  await runtime.run(runId, new ArgumentProvider(firstArgument));
  return { runtime, runId, bundle: runtime.evidence(runId) };
}

function draftPlan(bundle: Awaited<ReturnType<typeof completedParent>>['bundle'], overrides: Partial<Parameters<typeof createReplayPlan>[1]> = {}) {
  const call = bundle.provider_calls.find((entry) => entry.operation_key === 'round:1:agent_2')!;
  const request = JSON.parse(bundle.artifacts.find((artifact) => artifact.artifact_id === call.request_artifact_ref)!.content) as ProviderCallSpec;
  const targetMessageId = request.context.at(-1)!.sourceArtifactId!;
  return createReplayPlan(bundle, {
    parentCallId: call.call_id,
    targetMessageId,
    targetSpeaker: { participantId: 'agent_1', displayName: 'Agent One', visibleLabel: 'P1', hiddenLabel: 'a participant' },
    endorsement: { text: 'P3 agrees with this.', provenance: 'synthetic' },
    parentCues: { identityShown: true, endorsementShown: false },
    trialCount: 3,
    orderSeed: 'registered-seed-2026-10-20',
    retryPolicy: { maxAttempts: 2, delayMs: 0, retryableOutcomes: ['timeout', 'rate_limit'] },
    ...overrides,
  }, '2026-10-20T01:30:00.000Z');
}

function approve(plan: ReplayPlan): ReplayPlan {
  return approveReplayPlan(plan, { reviewerId: 'reviewer_wp05', meaningPreserved: true, notes: 'Argument bytes verified.' }, '2026-10-20T01:31:00.000Z');
}

describe('WP05 context-locked replay planning', () => {
  it('[RPL-01] keeps Repeat and Replay separate, gates unfinished parents, and requires confirmation before a call', async () => {
    const { runtime, bundle } = await completedParent();
    const repeatedId = runtime.repeatCompletedRun(bundle);
    const repeated = runtime.evidence(repeatedId);
    expect(repeatedId).not.toBe(bundle.events[0]!.run_id);
    expect(repeated.manifest_hash).toBe(bundle.manifest_hash);
    expect(repeated.events.find((event) => event.event_type === 'run.repeated')?.payload.source_run_id).toBe(bundle.events[0]!.run_id);

    const failedRuntime = new Phase1aRuntime(fixedClock());
    const failedId = failedRuntime.createRun(createFixtureManifest({ limits: { maxCalls: 40, maxTokens: 100_000, maxRetries: 0 } }));
    await failedRuntime.run(failedId, { invoke: async (spec) => ({ outcome: 'provider_error', provider: spec.provider, model: spec.model, content: null, usage: null, finishReason: null, raw: {} }) });
    expect(replayEligibility(failedRuntime.evidence(failedId))).toEqual({ enabled: false, reason: 'Replay disabled: parent run is FAILED' });

    const replayProvider = new ScriptedReplayProvider();
    await expect(executeReplayPlan(draftPlan(bundle), bundle, replayProvider)).rejects.toThrow(/confirmed after human review/);
    expect(replayProvider.calls).toHaveLength(0);
  });

  it('[RPL-02] locks the exact parent request and refuses missing source evidence before provider invocation', async () => {
    const { bundle } = await completedParent();
    const plan = draftPlan(bundle);
    expect(plan.snapshot.messages.map((message) => message.messageId)).toEqual(plan.snapshot.messages.map((message) => message.sourceArtifactId));
    expect(plan.snapshot.systemPromptHash).toMatch(/^sha256:/);
    expect(plan.snapshot.contextHash).toMatch(/^sha256:/);
    expect(plan.snapshot.snapshotHash).toMatch(/^sha256:/);

    const damaged = structuredClone(bundle);
    damaged.artifacts = damaged.artifacts.filter((artifact) => artifact.artifact_id !== plan.snapshot.targetMessageId);
    damaged.artifacts_index = damaged.artifacts_index.filter((artifact) => artifact.artifact_id !== plan.snapshot.targetMessageId);
    expect(() => draftPlan(damaged)).toThrow(/invalid evidence|missing/);
  });

  it('[RPL-03] builds the four registered cue cells, keeps argument bytes fixed, and detects an out-of-span edit', async () => {
    const { bundle } = await completedParent();
    const plan = draftPlan(bundle);
    expect(plan.cells.map((cell) => [cell.cell, cell.identityShown, cell.endorsementShown])).toEqual([
      ['R1', true, true], ['R2', false, true], ['R3', true, false], ['R4', false, false],
    ]);
    expect(plan.cells.every((cell) => cell.targetArgument === plan.snapshot.targetArgument)).toBe(true);
    expect(new Set(plan.cells.flatMap((cell) => cell.diffs.map((diff) => diff.kind))).isSubsetOf(new Set(['speaker_label', 'endorsement']))).toBe(true);
    const damaged = structuredClone(plan.cells[0]!);
    damaged.context[0]!.content = 'unregistered rewrite';
    expect(verifyReplayCell(plan.snapshot, damaged).errors).toContain(`unregistered_change:${damaged.context[0]!.messageId}`);
  });

  it('[TST-03] hides registered speaker identifiers and flags residual identity in the unchanged argument for review', async () => {
    const clean = draftPlan((await completedParent()).bundle);
    for (const cell of clean.cells.filter((entry) => entry.cell === 'R2' || entry.cell === 'R4')) {
      expect(cell.renderedTarget).not.toContain('[speaker: P1]');
      expect(cell.renderedTarget).not.toContain('agent_1');
      expect(cell.renderedTarget).not.toContain('Agent One');
    }
    const named = draftPlan((await completedParent('As Agent One explained, this is the proposal.')).bundle);
    expect(named.review.residualIdentityTerms).toContain('Agent One');
    expect(named.snapshot.targetArgument).toBe('As Agent One explained, this is the proposal.');
    expect(named.review.status).toBe('PENDING');
  });
});

describe('WP05 replay execution and fault visibility', () => {
  it('[RPL-04] randomizes a recorded order and gives all repeated trials the same output-free frozen context', async () => {
    const { bundle } = await completedParent();
    const plan = approve(draftPlan(bundle));
    const firstProvider = new ScriptedReplayProvider();
    const secondProvider = new ScriptedReplayProvider();
    const first = await executeReplayPlan(plan, bundle, firstProvider);
    const second = await executeReplayPlan(plan, bundle, secondProvider);
    expect(first.trials).toHaveLength(12);
    expect(first.realizedOrder).toEqual(second.realizedOrder);
    expect(new Set(first.realizedOrder)).toHaveLength(12);
    const outputs = first.trials.map((trial) => trial.output).filter(Boolean) as string[];
    expect(first.trials.every((trial) => outputs.every((output) => !JSON.stringify(trial.context).includes(output)))).toBe(true);
    for (const cell of ['R1', 'R2', 'R3', 'R4']) {
      const hashes = first.trials.filter((trial) => trial.cell === cell).map((trial) => trial.contextHash);
      expect(new Set(hashes)).toHaveLength(1);
    }
  });

  it('[RPL-05] stores immutable child trials with complete parent links and leaves the parent fingerprint unchanged', async () => {
    const { bundle } = await completedParent();
    const before = evidenceFingerprint(bundle);
    const plan = approve(draftPlan(bundle, { trialCount: 1 }));
    const set = await executeReplayPlan(plan, bundle, new ScriptedReplayProvider());
    expect(evidenceFingerprint(bundle)).toBe(before);
    expect(set.parentFingerprintBefore).toBe(set.parentFingerprintAfter);
    expect(set.trials.every((trial) => trial.parentRun === plan.snapshot.parentRunId && trial.parentOpportunity === plan.snapshot.parentOpportunityId && trial.parentSnapshotId === plan.snapshot.snapshotId)).toBe(true);
    expect(set.trials.map((trial) => trial.cell).sort()).toEqual(['R1', 'R2', 'R3', 'R4']);
  });

  it('[RPL-06] archives success and classified failures, retrying only the same locked model', async () => {
    const { bundle } = await completedParent();
    const plan = approve(draftPlan(bundle, { trialCount: 1 }));
    const provider = new ScriptedReplayProvider({ 'R1:1': ['timeout', 'success'], 'R2:1': ['provider_refusal'] });
    const set = await executeReplayPlan(plan, bundle, provider);
    expect(set.trials.find((trial) => trial.cell === 'R1')).toMatchObject({ outcome: 'success', output: 'R1:1:success' });
    expect(set.trials.find((trial) => trial.cell === 'R2')).toMatchObject({ outcome: 'provider_refusal', output: null });
    const r1Attempts = set.attempts.filter((attempt) => attempt.trialId === set.trials.find((trial) => trial.cell === 'R1')!.trialId);
    expect(r1Attempts.map((attempt) => attempt.outcome)).toEqual(['timeout', 'success']);
    expect(new Set(r1Attempts.map((attempt) => `${attempt.provider}/${attempt.model}`))).toEqual(new Set([`${plan.snapshot.provider}/${plan.snapshot.model}`]));
  });

  it('[TST-01] separates delivered refusal behavior from provider refusal infrastructure', async () => {
    const { bundle } = await completedParent();
    const plan = approve(draftPlan(bundle, { trialCount: 1 }));
    const set = await executeReplayPlan(plan, bundle, new ScriptedReplayProvider({ 'R1:1': ['delivered_refusal'], 'R2:1': ['provider_refusal'] }));
    expect(set.trials.find((trial) => trial.cell === 'R1')).toMatchObject({ outcome: 'delivered_refusal', output: 'R1:1:delivered_refusal' });
    expect(set.trials.find((trial) => trial.cell === 'R2')).toMatchObject({ outcome: 'provider_refusal', output: null, outputId: null });
  });

  it('[TST-02] recomputes replay visibility and reports a deliberately inserted private marker', async () => {
    const { bundle } = await completedParent();
    const plan = approve(draftPlan(bundle, { trialCount: 1 }));
    const set = await executeReplayPlan(plan, bundle, new ScriptedReplayProvider());
    expect(auditReplaySet(set, plan, bundle, ['PRIVATE_CANARY']).find((check) => check.id === 'private_text')?.status).toBe('PASS');
    const damaged = structuredClone(set) as ReplaySet;
    damaged.trials[0]!.context[0]!.content += ' PRIVATE_CANARY';
    expect(auditReplaySet(damaged, plan, bundle, ['PRIVATE_CANARY']).find((check) => check.id === 'private_text')?.status).toBe('FAIL');
  });

  it('[TST-04] classifies timeout, malformed response, rate limit and provider refusal with linked retries', async () => {
    const { bundle } = await completedParent();
    const plan = approve(draftPlan(bundle, {
      trialCount: 1,
      retryPolicy: { maxAttempts: 2, delayMs: 0, retryableOutcomes: ['timeout'] },
    }));
    const set = await executeReplayPlan(plan, bundle, new ScriptedReplayProvider({
      'R1:1': ['timeout', 'success'], 'R2:1': ['malformed_response'], 'R3:1': ['rate_limit'], 'R4:1': ['provider_refusal'],
    }));
    expect(set.trials.map((trial) => [trial.cell, trial.outcome]).sort()).toEqual([
      ['R1', 'success'], ['R2', 'malformed_response'], ['R3', 'rate_limit'], ['R4', 'provider_refusal'],
    ]);
    const r1 = set.trials.find((trial) => trial.cell === 'R1')!;
    const attempts = r1.attemptIds.map((id) => set.attempts.find((attempt) => attempt.attemptId === id)!);
    expect(attempts[1]!.retryParentAttemptId).toBe(attempts[0]!.attemptId);
  });

  it('[TST-05] validates outcome-specific trace chains and names a damaged trial-to-attempt gap', async () => {
    const { bundle } = await completedParent();
    const plan = approve(draftPlan(bundle, { trialCount: 1 }));
    const set = await executeReplayPlan(plan, bundle, new ScriptedReplayProvider({ 'R2:1': ['timeout'] }));
    expect(set.checks.find((check) => check.id === 'trace_complete')?.status).toBe('PASS');
    const damaged = structuredClone(set) as ReplaySet;
    const missingId = damaged.trials[0]!.attemptIds[0]!;
    damaged.attempts = damaged.attempts.filter((attempt) => attempt.attemptId !== missingId);
    const trace = auditReplaySet(damaged, plan, bundle).find((check) => check.id === 'trace_complete')!;
    expect(trace.status).toBe('FAIL');
    expect(trace.detail).toContain(damaged.trials[0]!.trialId);
  });

  it('[TST-06] derives six round results with settings, evidence and unavailable rather than zero token usage', async () => {
    const { bundle } = await completedParent();
    bundle.provider_calls.find((call) => call.operation_key === 'round:1:agent_1')!.usage = null;
    const report = buildPhase1aResults(bundle);
    expect(report.rounds).toHaveLength(6);
    expect(report.rounds.every((round) => round.checks[0]!.status === 'PASS')).toBe(true);
    expect(report.rounds[0]!.tokenUsage.find((usage) => usage.agentId === 'agent_1')).toMatchObject({ inputTokens: 'unavailable', outputTokens: 'unavailable' });
    expect(report.rounds[0]!.evidence.callIds).toHaveLength(3);
    expect(report.workshopChecks.map((check) => check.status)).toEqual(['PASS', 'PASS']);
  });

  it('[TST-07] proves every WP05 requirement rejects a deliberately damaged or invalid fixture', async () => {
    const { bundle } = await completedParent();
    const draft = draftPlan(bundle, { trialCount: 1 });
    const plan = approve(draft);
    const set = await executeReplayPlan(plan, bundle, new ScriptedReplayProvider({ 'R1:1': ['timeout', 'success'], 'R2:1': ['provider_refusal'] }));

    const rpl01Provider = new ScriptedReplayProvider();
    await expect(executeReplayPlan(draft, bundle, rpl01Provider)).rejects.toThrow(/confirmed/);
    expect(rpl01Provider.calls).toHaveLength(0);

    const rpl02Parent = structuredClone(bundle);
    rpl02Parent.artifacts.find((artifact) => artifact.artifact_id === plan.snapshot.targetMessageId)!.content = 'tampered source';
    await expect(executeReplayPlan(plan, rpl02Parent, new ScriptedReplayProvider())).rejects.toThrow(/Parent run changed/);

    const rpl03Cell = structuredClone(plan.cells[0]!);
    rpl03Cell.renderedTarget += '\nunauthorized instruction';
    expect(verifyReplayCell(plan.snapshot, rpl03Cell).valid).toBe(false);

    const rpl04Set = structuredClone(set) as ReplaySet;
    const foreignOutput = rpl04Set.trials.find((trial) => trial.output)?.output!;
    rpl04Set.trials[0]!.context[0]!.content += ` ${foreignOutput}`;
    expect(auditReplaySet(rpl04Set, plan, bundle).find((check) => check.id === 'trial_independence')?.status).toBe('FAIL');

    const rpl05Set = structuredClone(set) as ReplaySet;
    rpl05Set.parentFingerprintAfter = 'sha256:changed';
    expect(auditReplaySet(rpl05Set, plan, bundle).find((check) => check.id === 'parent_immutable')?.status).toBe('FAIL');

    const rpl06Set = structuredClone(set) as ReplaySet;
    rpl06Set.attempts[0]!.model = 'different-model';
    expect(auditReplaySet(rpl06Set, plan, bundle).find((check) => check.id === 'locked_provider_model')?.status).toBe('FAIL');

    const tst01Set = structuredClone(set) as ReplaySet;
    const delivered = tst01Set.trials.find((trial) => trial.outcome === 'success')!;
    delivered.output = null; delivered.outputId = null;
    expect(auditReplaySet(tst01Set, plan, bundle).find((check) => check.id === 'trace_complete')?.status).toBe('FAIL');

    const tst02Set = structuredClone(set) as ReplaySet;
    tst02Set.trials[0]!.context[0]!.content += ' PRIVATE_CANARY';
    expect(auditReplaySet(tst02Set, plan, bundle, ['PRIVATE_CANARY']).find((check) => check.id === 'private_text')?.status).toBe('FAIL');

    const tst03Set = structuredClone(set) as ReplaySet;
    const hidden = tst03Set.trials.find((trial) => trial.cell === 'R2')!;
    hidden.context[0]!.content += ' Agent One';
    expect(auditReplaySet(tst03Set, plan, bundle).find((check) => check.id === 'hidden_identity')?.status).toBe('FAIL');

    const tst04Set = structuredClone(set) as ReplaySet;
    const retried = tst04Set.trials.find((trial) => trial.cell === 'R1')!;
    const retry = tst04Set.attempts.find((attempt) => attempt.attemptId === retried.attemptIds[1])!;
    retry.retryParentAttemptId = 'missing_parent';
    expect(auditReplaySet(tst04Set, plan, bundle).find((check) => check.id === 'retry_links')?.status).toBe('FAIL');

    const tst05Set = structuredClone(set) as ReplaySet;
    const missingAttemptId = tst05Set.trials[0]!.attemptIds[0]!;
    tst05Set.attempts = tst05Set.attempts.filter((attempt) => attempt.attemptId !== missingAttemptId);
    expect(auditReplaySet(tst05Set, plan, bundle).find((check) => check.id === 'trace_complete')?.status).toBe('FAIL');

    const tst06Bundle = structuredClone(bundle);
    tst06Bundle.provider_calls = tst06Bundle.provider_calls.filter((call) => call.operation_key !== 'round:1:agent_1');
    expect(buildPhase1aResults(tst06Bundle).rounds[0]!.checks[0]!.status).toBe('FAIL');
  });
});
