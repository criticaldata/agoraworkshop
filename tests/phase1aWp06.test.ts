import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configHash } from '../src/config/hash.js';
import {
  Phase1aRuntime, DeterministicMockProvider, createFixtureManifest,
  type Cell, type EvidenceBundle, type Outcome, type Phase1aProvider,
} from '../src/phase1a/index.js';
import { analyzeRun } from '../src/phase1a/wp06/index.js';
import { buildSyntheticCampaign, SELECTED_REPORT_NOTICE_TIMING } from '../src/phase1a/wp01/index.js';
import { adaptWp01Run } from '../src/phase1a/wp02/index.js';

async function fixture(cell: Cell = 'D', scripted: Record<string, Outcome[]> = {}, stop?: number) {
  const base = createFixtureManifest();
  const homogeneous = cell === 'A' || cell === 'B';
  const manifest = createFixtureManifest({
    cell, reportEnabled: cell === 'B' || cell === 'D',
    participants: base.participants.map(p => ({ ...p, model: homogeneous ? 'gemma-fixture' : p.model })) as typeof base.participants,
  });
  const runtime = new Phase1aRuntime();
  const runId = runtime.createRun(manifest);
  await runtime.run(runId, new DeterministicMockProvider(scripted), { stopAfterOperations: stop });
  return runtime.evidence(runId);
}

// Simulate structurally hash-valid but semantically inconsistent evidence.
function rechain(bundle: EvidenceBundle) {
  let previous: string | null = null;
  bundle.events.forEach((event, index) => {
    event.sequence = index + 1;
    event.previous_event_hash = previous;
    const { event_hash: _, ...base } = event;
    event.event_hash = configHash(base);
    previous = event.event_hash;
  });
}

describe('WP06 run-level descriptive analysis', () => {
  it.each(['A', 'B', 'C', 'D'] as const)('[ANA-01] derives planned coverage for condition %s without counting messages as runs', async cell => {
    const result = analyzeRun(await fixture(cell));
    const report = cell === 'B' || cell === 'D';
    expect(result.analysis_unit).toBe('run');
    expect(result.totals.planned).toBe(report ? 31 : 24);
    expect(result.totals.committed).toBe(result.totals.planned);
    expect(result.by_stage.PUBLIC?.planned).toBe(18);
    expect(result.by_stage.T0?.planned).toBe(3);
    expect(result.by_stage.T6?.planned).toBe(3);
    expect(result.by_stage.TR?.planned).toBe(report ? 3 : 0);
    expect(result.by_stage.REPORT?.planned).toBe(report ? 4 : 0);
    if (!report) expect(result.by_stage.TR?.response_rate.value).toBeNull();
    expect(result.scientific_status).toBe('PENDING_SCIENTIFIC_APPROVAL');
    expect(result.source.admissionClass).toBe('fixture');
  });

  it('[ANA-02] retains timeout attempts without inflating successful opportunities', async () => {
    const result = analyzeRun(await fixture('D', { 'round:1:agent_1': ['timeout', 'success'] }));
    expect(result.totals.attempts).toBe(32);
    expect(result.totals.committed).toBe(31);
    expect(result.totals.technical_attempts).toBe(1);
    expect(result.totals.technical_failures).toBe(0);
    expect(result.by_stage.PUBLIC?.response_rate.value).toBe(1);
    expect(result.opportunities.find(row => row.opportunity_id === 'round:1:agent_1')?.source_call_ids).toHaveLength(2);
  });

  it('[ANA-02] derives the final attempt from event order rather than export array order', async () => {
    const bundle = await fixture('D', { 'round:1:agent_1': ['timeout', 'success'] });
    const expected = analyzeRun(bundle);
    bundle.provider_calls.reverse();
    const actual = analyzeRun(bundle);
    expect(actual.opportunities).toEqual(expected.opportunities);
    expect(actual.totals).toEqual(expected.totals);
  });

  it('[ANA-04] reports an in-flight retry as pending while retaining the failed attempt', async () => {
    const runtime = new Phase1aRuntime();
    const id = runtime.createRun(createFixtureManifest());
    const mock = new DeterministicMockProvider({ 't0:agent_1': ['timeout', 'success'] });
    let snapshot: EvidenceBundle | undefined;
    await runtime.run(id, { async invoke(spec) {
      if (spec.operationKey === 't0:agent_1' && spec.attempt === 2) snapshot = runtime.evidence(id);
      return mock.invoke(spec);
    } });
    expect(snapshot).toBeDefined();
    const result = analyzeRun(snapshot!);
    expect(result.totals).toMatchObject({ attempted: 1, committed: 0, pending: 1,
      technical_failures: 0, attempts: 1, started_attempts: 2, pending_attempts: 1, technical_attempts: 1 });
    expect(result.opportunities[0]).toMatchObject({ status: 'pending', outcome: 'timeout' });
    expect(result.totals.response_rate.value).toBeNull();
  });

  it.each(['A', 'B', 'C', 'D'] as const)('[ANA-16] analyzes a WP01-admitted condition %s with source lineage intact', async cell => {
    const campaign = buildSyntheticCampaign({ report_notice_timing: SELECTED_REPORT_NOTICE_TIMING });
    const planned = campaign.runs.find(run => run.condition_id === cell)!;
    const manifest = adaptWp01Run(campaign, planned.run_id, {
      admissionClass: 'engineering', topic: 'workshop integration fixture',
      approvedAt: '2026-10-22T00:00:00.000Z',
      limits: { maxCalls: 40, maxTokens: 100_000, maxRetries: 1 },
    });
    const runtime = new Phase1aRuntime();
    const id = runtime.createRun(manifest);
    await runtime.run(id, new DeterministicMockProvider());
    const result = analyzeRun(runtime.evidence(id));
    expect(result.source).toEqual(manifest.source);
    expect(result.source.campaignHash).toBe(campaign.campaign_hash);
    expect(result.source.runManifestHash).toBe(planned.manifest_hash);
    expect(result.condition).toBe(cell);
    expect(result.totals.committed).toBe(planned.expected_counts.expected_model_invocations);
    expect(result.by_participant.map(row => row.participant_id)).toEqual(['P1', 'P2', 'P3']);
    expect(result.scientific_status).toBe('PENDING_SCIENTIFIC_APPROVAL');
  });

  it('[ANA-03] keeps abstention and delivered refusal separate from technical failure', async () => {
    const result = analyzeRun(await fixture('D', {
      'round:1:agent_1': ['abstained'], 'round:1:agent_2': ['refused'],
    }));
    expect(result.by_stage.PUBLIC?.outcomes).toMatchObject({ success: 16, abstained: 1, refused: 1, timeout: 0 });
    expect(result.by_stage.PUBLIC?.response_rate).toMatchObject({ numerator: 16, denominator: 18, value: 16 / 18 });
    expect(result.totals.technical_attempts).toBe(0);
  });

  it('[ANA-04] preserves failed and unattempted opportunities rather than coding missing behavior as zero', async () => {
    const result = analyzeRun(await fixture('D', { 'round:1:agent_1': ['timeout'] }));
    expect(result.state).toBe('FAILED');
    expect(result.totals).toMatchObject({ planned: 31, committed: 3, technical_failures: 1, not_attempted: 27, attempts: 5 });
    expect(result.by_stage.PUBLIC?.response_rate).toMatchObject({ numerator: 0, denominator: 0, value: null });
    expect(result.evidence_completeness).toBe('partial');
    expect(result.behavioral_metrics.availability).toBe('unavailable');
  });

  it('[ANA-04] retains interrupted and never-started run denominators', async () => {
    const result = analyzeRun(await fixture('A', {}, 4));
    expect(result.totals).toMatchObject({ planned: 24, committed: 4, not_attempted: 20 });
    const runtime = new Phase1aRuntime();
    const id = runtime.createRun(createFixtureManifest());
    const empty = analyzeRun(runtime.evidence(id));
    expect(empty.totals).toMatchObject({ planned: 31, committed: 0, not_attempted: 31 });
    expect(empty.usage.input_tokens.total).toBeNull();
  });

  it('[ANA-05] reports missing usage explicitly and emits no private text', async () => {
    const runtime = new Phase1aRuntime();
    const id = runtime.createRun(createFixtureManifest());
    const provider: Phase1aProvider = {
      async invoke(spec) {
        return { outcome: 'success', provider: spec.provider, model: spec.model, content: 'PRIVATE_CANARY_BODY',
          usage: { inputTokens: 0, outputTokens: null }, finishReason: 'stop', raw: { text: 'RAW_CANARY_BODY' } };
      },
    };
    await runtime.run(id, provider);
    const result = analyzeRun(runtime.evidence(id));
    expect(result.usage.input_tokens.total).toBe(0);
    expect(result.usage.output_tokens).toMatchObject({ total: null, known_total: 0, missing_calls: 31 });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_CANARY_BODY|RAW_CANARY_BODY/);
    expect(result.visibility).toBe('operator');
  });

  it('[ANA-04] excludes an uncommitted response after persistence failure from behavioral rates', async () => {
    const runtime = new Phase1aRuntime();
    const id = runtime.createRun(createFixtureManifest(), type => type === 'operation.committed');
    await expect(runtime.run(id, new DeterministicMockProvider())).rejects.toThrow(/persistence rejected/);
    const result = analyzeRun(runtime.evidence(id));
    expect(result.totals).toMatchObject({ planned: 31, attempted: 1, committed: 0, uncommitted_responses: 1, not_attempted: 30 });
    expect(result.totals.response_rate.value).toBeNull();
  });

  it('[ANA-06] rejects a rehashed completion claim with missing opportunities', async () => {
    const bundle = await fixture('D', {}, 1);
    const completion = structuredClone(bundle.events.at(-1)!);
    completion.event_id = 'false-completion';
    completion.event_type = 'run.completed';
    completion.payload = {};
    bundle.events.push(completion);
    rechain(bundle);
    expect(() => analyzeRun(bundle)).toThrow(/missing committed opportunities/);
  });

  it('[ANA-06] rejects tampering instead of trusting the supplied integrity flag', async () => {
    const bundle = await fixture();
    bundle.artifacts[0]!.content = 'tampered';
    bundle.integrity.valid = true;
    expect(() => analyzeRun(bundle)).toThrow(/invalid evidence/);
  });

  it('[ANA-06] rejects wrong commit linkage and duplicate committed opportunities', async () => {
    const bundle = await fixture();
    const commit = bundle.events.find(event => event.event_type === 'operation.committed')!;
    commit.artifact_refs = [];
    rechain(bundle);
    expect(() => analyzeRun(bundle)).toThrow(/inconsistent committed evidence/);
    const other = await fixture();
    const duplicate = structuredClone(other.events.find(event => event.event_type === 'operation.committed')!);
    duplicate.event_id = 'duplicate-commit';
    other.events.push(duplicate);
    rechain(other);
    expect(() => analyzeRun(other)).toThrow(/duplicate committed/);
  });

  it('[ANA-07] derives reproducible results with exact references and leaves source evidence unchanged', async () => {
    const bundle = await fixture();
    const before = JSON.stringify(bundle);
    const result = analyzeRun(bundle);
    expect(analyzeRun(bundle)).toEqual(result);
    expect(JSON.stringify(bundle)).toBe(before);
    const ids = new Set(bundle.events.map(event => event.event_id));
    expect(result.totals.response_rate.source_event_ids.every(id => ids.has(id))).toBe(true);
    expect(result.opportunities.every(row => row.source_event_ids.length > 0)).toBe(true);
    const reverified = structuredClone(bundle);
    reverified.integrity.verified_at = 'later';
    expect(analyzeRun(reverified).evidence_hash).toBe(result.evidence_hash);
  });

  it('[ANA-08] runs the offline CLI and fails without partial output on corrupt input', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wp06-'));
    try {
      const path = join(dir, 'bundle.json');
      writeFileSync(path, JSON.stringify(await fixture()));
      const command = ['--import', 'tsx', 'src/phase1a/wp06/cli.ts', path];
      const good = spawnSync(process.execPath, command, { encoding: 'utf8' });
      expect(good.status, good.stderr).toBe(0);
      expect(JSON.parse(good.stdout).totals.committed).toBe(31);
      writeFileSync(path, '{broken');
      const bad = spawnSync(process.execPath, command, { encoding: 'utf8' });
      expect(bad.status).toBe(1);
      expect(bad.stdout).toBe('');
      expect(bad.stderr).toContain('WP06 analysis failed');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
