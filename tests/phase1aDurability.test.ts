import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
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
});
