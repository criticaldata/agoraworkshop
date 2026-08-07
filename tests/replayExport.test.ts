import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { exportRun } from '../src/export/exporter.js';
import { readEvents } from '../src/events/recorder.js';
import { freezeConfig } from '../src/config/load.js';
import { getRun } from '../src/db/queries.js';
import { baseConfigObject, frozen, tempDb, tempDir } from './helpers.js';
import { evaluateGates, finalizeReport } from '../src/acceptance/gates.js';

const withFaults = () =>
  frozen({
    fault_injection: {
      enabled: true,
      faults: [
        {
          agent_id: 'agent_2',
          state: 'PUBLIC_DISCUSSION',
          occurrence: 1,
          kind: 'timeout',
          recover_after_attempts: 1,
        },
        {
          agent_id: 'agent_4',
          state: 'FINAL_DISCUSSION',
          occurrence: 1,
          kind: 'provider_error',
          recover_after_attempts: null,
        },
      ],
    },
  });

describe('export bundle', () => {
  it('writes every artifact the validation package needs', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: withFaults() });
    await runner.execute();

    const out = tempDir();
    const result = exportRun({ db, runId: runner.id, outDir: out });

    for (const name of [
      'README.md',
      'canonical_config.yaml',
      'canonical_config.json',
      'run_metadata.json',
      'events.jsonl',
      'transcript_public.txt',
      'messages_private.jsonl',
      'invocations.jsonl',
      'opportunities.jsonl',
      'analytics.json',
      'acceptance_report.json',
      'replay.html',
    ]) {
      expect(existsSync(join(out, name)), `${name} should exist`).toBe(true);
    }
    expect(result.files.every((f) => f.sha256.length === 64)).toBe(true);
  });

  it('exports a canonical_config.json whose hash matches the recorded config hash', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const out = tempDir();
    exportRun({ db, runId: runner.id, outDir: out });

    const canonical = readFileSync(join(out, 'canonical_config.json'), 'utf8');
    const rehydrated = freezeConfig(JSON.parse(canonical));
    expect(rehydrated.hash).toBe(getRun(db, runner.id)!.config_hash);
  });

  it('writes events in stable, contiguous chronological order', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const out = tempDir();
    exportRun({ db, runId: runner.id, outDir: out });

    const lines = readFileSync(join(out, 'events.jsonl'), 'utf8').trim().split('\n');
    const parsed = lines.map((line) => JSON.parse(line) as { sequence: number; elapsed_ms: number });

    expect(parsed.map((e) => e.sequence)).toEqual(parsed.map((_, i) => i + 1));
    for (let i = 1; i < parsed.length; i += 1) {
      expect(parsed[i]!.elapsed_ms).toBeGreaterThanOrEqual(parsed[i - 1]!.elapsed_ms);
    }
    expect(parsed.length).toBe(readEvents(db, runner.id).length);
  });

  it('includes failures and state transitions in the replay, not just messages', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: withFaults() });
    await runner.execute();

    const out = tempDir();
    exportRun({ db, runId: runner.id, outDir: out });
    const html = readFileSync(join(out, 'replay.html'), 'utf8');

    expect(html).toContain('state_transition_completed');
    expect(html).toContain('timeout');
    expect(html).toContain('retry_exhausted');
    expect(html).toContain('Acceptance gates');
    // Self-contained: no external assets.
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\/[^"']*\.(js|css)/i);
  });

  it('separates the public transcript from private messages', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    const out = tempDir();
    exportRun({ db, runId: runner.id, outDir: out });

    const publicText = readFileSync(join(out, 'transcript_public.txt'), 'utf8');
    const privateLines = readFileSync(join(out, 'messages_private.jsonl'), 'utf8').trim().split('\n');
    const privateMessages = privateLines
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { content: string; channel: string });

    expect(privateMessages.length).toBeGreaterThan(0);
    expect(privateMessages.every((m) => m.channel === 'private')).toBe(true);
    for (const message of privateMessages) {
      expect(publicText).not.toContain(message.content);
    }
  });
});

describe('acceptance gates', () => {
  it('passes all three gates for a run with faults, a rerun, and an export', async () => {
    const db = tempDb();

    const config = withFaults();
    const primary = new WorkshopRunner({ db, frozen: config, codeCommitSha: 'testsha' });
    await primary.execute();

    const rerun = new WorkshopRunner({
      db,
      frozen: config,
      sourceRunId: primary.id,
      codeCommitSha: 'testsha',
    });
    await rerun.execute();

    exportRun({ db, runId: primary.id, outDir: tempDir() });

    const report = finalizeReport(
      evaluateGates({
        db,
        runId: primary.id,
        failureEvidenceRunId: primary.id,
        reproducibilityRunId: rerun.id,
      }),
    );

    expect(report.gates.infrastructure_validated.status).toBe('PASS');
    expect(report.gates.failure_attribution_validated.status).toBe('PASS');
    expect(report.gates.baseline_reproducible.status).toBe('PASS');
    expect(report.ready_for_controlled_behavioral_experiment).toBe(true);
  });

  it('does not claim readiness when no infrastructure failure was ever observed', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();
    exportRun({ db, runId: runner.id, outDir: tempDir() });

    const report = finalizeReport(evaluateGates({ db, runId: runner.id }));
    expect(report.gates.failure_attribution_validated.status).toBe('FAIL');
    expect(report.ready_for_controlled_behavioral_experiment).toBe(false);
  });

  it('does not claim readiness when artifacts were never exported', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: withFaults() });
    await runner.execute();

    const report = finalizeReport(evaluateGates({ db, runId: runner.id }));
    expect(report.gates.infrastructure_validated.status).toBe('FAIL');
    expect(report.gates.infrastructure_validated.failures.join(' ')).toContain('artifacts');
  });
});

describe('reproducibility', () => {
  it('creates a new run id with an identical config hash', async () => {
    const db = tempDb();
    const config = frozen();

    const first = new WorkshopRunner({ db, frozen: config });
    await first.execute();

    const source = getRun(db, first.id)!;
    const rehydrated = freezeConfig(JSON.parse(source.config_json), source.config_source_path);
    const second = new WorkshopRunner({ db, frozen: rehydrated, sourceRunId: first.id });
    const result = await second.execute();

    expect(second.id).not.toBe(first.id);
    expect(result.configHash).toBe(source.config_hash);
    expect(getRun(db, second.id)!.source_run_id).toBe(first.id);
  });

  it('produces a different hash when the config actually changes', async () => {
    const db = tempDb();
    const first = new WorkshopRunner({ db, frozen: frozen() });
    await first.execute();

    const changed = freezeConfig(
      baseConfigObject({
        workshop: {
          topic: 'a different topic',
          max_duration_seconds: 120,
          rounds: {
            introduction: 1,
            public_discussion: 1,
            private_or_breakout: 1,
            final_discussion: 1,
          },
        },
      }),
    );
    const second = new WorkshopRunner({ db, frozen: changed });
    const result = await second.execute();

    expect(result.configHash).not.toBe(getRun(db, first.id)!.config_hash);
  });
});
