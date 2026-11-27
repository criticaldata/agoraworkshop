import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { DeterministicMockProvider, Phase1aRuntime, createFixtureManifest, verifyEvidenceBundle } from '../src/phase1a/index.js';
import { Phase1aSqliteStore } from '../src/phase1a/sqliteStore.js';

describe('Phase 1A durable append-only evidence store', () => {
  it('resumes in a new runtime and database handle without repeating committed provider calls', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'agora-phase1a-store-')), 'phase1a.sqlite');
    const firstStore = new Phase1aSqliteStore(path);
    const first = new Phase1aRuntime(() => new Date().toISOString(), firstStore);
    const runId = first.createRun(createFixtureManifest());
    await first.run(runId, new DeterministicMockProvider(), { stopAfterOperations: 5 });
    const partial = first.evidence(runId);
    const committed = partial.events.filter((event) => event.event_type === 'operation.committed').length;
    expect(committed).toBe(5);
    expect(firstStore.revisions(runId)).toBeGreaterThan(committed);
    firstStore.close();

    const secondStore = new Phase1aSqliteStore(path);
    const second = new Phase1aRuntime(() => new Date().toISOString(), secondStore);
    expect(second.restoreFromStore(runId)).toBe(runId);
    const provider = new DeterministicMockProvider();
    expect(await second.run(runId, provider)).toBe('COMPLETE');
    expect(provider.calls).toHaveLength(31 - committed);
    expect(second.evidence(runId).provider_calls).toHaveLength(31);
    expect(verifyEvidenceBundle(second.evidence(runId))).toEqual({ valid: true, errors: [] });
    secondStore.close();
  });

  it('survives abrupt process termination after a committed operation', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'agora-phase1a-kill-')), 'phase1a.sqlite');
    const childSource = `
      import { Phase1aRuntime, DeterministicMockProvider, createFixtureManifest } from './src/phase1a/index.ts';
      import { Phase1aSqliteStore } from './src/phase1a/sqliteStore.ts';
      const store = new Phase1aSqliteStore(${JSON.stringify(path)});
      const runtime = new Phase1aRuntime(() => new Date().toISOString(), store);
      const runId = runtime.createRun(createFixtureManifest());
      await runtime.run(runId, new DeterministicMockProvider(), { stopAfterOperations: 4 });
      process.stdout.write(runId + '\\n');
      setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', childSource], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    const runId = await new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
        const line = stdout.split(/\r?\n/)[0];
        if (line) resolve(line);
      });
      child.stderr.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', reject);
      child.on('exit', (code) => { if (!stdout.trim()) reject(new Error(`child exited ${code}: ${stderr}`)); });
    });
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => child.once('close', () => resolve()));

    const store = new Phase1aSqliteStore(path);
    const runtime = new Phase1aRuntime(() => new Date().toISOString(), store);
    runtime.restoreFromStore(runId);
    const committed = runtime.evidence(runId).events.filter((event) => event.event_type === 'operation.committed').length;
    expect(committed).toBe(4);
    const provider = new DeterministicMockProvider();
    expect(await runtime.run(runId, provider)).toBe('COMPLETE');
    expect(provider.calls).toHaveLength(27);
    store.close();
  });

  it('rejects a durable snapshot whose row metadata disagrees with the verified evidence', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'agora-phase1a-metadata-')), 'phase1a.sqlite');
    const firstStore = new Phase1aSqliteStore(path);
    const runtime = new Phase1aRuntime(() => new Date().toISOString(), firstStore);
    const runId = runtime.createRun(createFixtureManifest());
    await runtime.run(runId, new DeterministicMockProvider(), { stopAfterOperations: 1 });
    firstStore.close();

    const db = new Database(path);
    db.prepare('UPDATE phase1a_snapshots SET state = ? WHERE run_id = ? AND revision = (SELECT MAX(revision) FROM phase1a_snapshots WHERE run_id = ?)').run('COMPLETE', runId, runId);
    db.close();

    const reopened = new Phase1aSqliteStore(path);
    expect(() => reopened.latestSnapshot(runId)).toThrow(/state does not match its evidence/);
    reopened.close();
  });

  it('refuses to append evidence that fails independent bundle verification', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'agora-phase1a-invalid-')), 'phase1a.sqlite');
    const runtime = new Phase1aRuntime();
    const runId = runtime.createRun(createFixtureManifest());
    const bundle = runtime.evidence(runId);
    bundle.manifest_hash = 'sha256:tampered';
    const store = new Phase1aSqliteStore(path);

    expect(() => store.appendSnapshot({ runId, state: 'CREATED', callsUsed: 0, tokensUsed: 0, bundle })).toThrow(/Cannot persist invalid Phase 1A evidence/);
    expect(store.revisions(runId)).toBe(0);
    store.close();
  });

  it('persists and restores the conservative token charge when provider usage is unavailable', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'agora-phase1a-unknown-usage-')), 'phase1a.sqlite');
    const store = new Phase1aSqliteStore(path);
    const runtime = new Phase1aRuntime(() => new Date().toISOString(), store);
    const runId = runtime.createRun(createFixtureManifest({ limits: { maxCalls: 40, maxTokens: 2, maxRetries: 0 } }));
    const provider = {
      invoke: async (spec: Parameters<InstanceType<typeof DeterministicMockProvider>['invoke']>[0]) => ({
        outcome: 'success' as const,
        provider: spec.provider,
        model: spec.model,
        content: 'answer',
        usage: null,
        finishReason: 'stop',
        raw: {},
      }),
    };

    expect(await runtime.run(runId, provider)).toBe('FAILED');
    const snapshot = store.latestSnapshot(runId);
    expect(snapshot).toMatchObject({ state: 'FAILED', callsUsed: 2, tokensUsed: 2 });
    store.close();
  });
});
