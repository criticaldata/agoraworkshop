import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { exportRun } from '../src/export/exporter.js';
import { exportOnCompletion } from '../src/export/autoExport.js';
import { REQUIRED_BUNDLE_FILES, REQUIRED_BUNDLE_ITEMS } from '../src/export/bundleContract.js';
import { evaluateGates, finalizeReport } from '../src/acceptance/gates.js';
import { getArtifacts, getInvocations, getMessages } from '../src/db/queries.js';
import { readEvents } from '../src/events/recorder.js';
import { frozen, tempDb, tempDir } from './helpers.js';

interface Manifest {
  run_id: string;
  config_hash: string;
  code_provenance: Record<string, string | null>;
  contents: Array<{ item: string; files: string[]; present: boolean }>;
  files: Array<{ name: string; bytes: number; sha256: string }>;
}

async function bundle() {
  const db = tempDb();
  const runner = new WorkshopRunner({
    db,
    frozen: frozen(),
    provenance: {
      git_commit_sha: 'abc123',
      commit_source: 'environment',
      deployment_id: 'dep_1',
      app_version: '1.2.3',
      environment: 'test',
    },
  });
  await runner.execute();
  const dir = tempDir();
  const result = exportRun({ db, runId: runner.id, outDir: dir });
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;
  return { db, runId: runner.id, dir, result, manifest };
}

describe('artifact bundle', () => {
  it('writes every file the Phase 0 contract requires', async () => {
    const { result } = await bundle();
    const written = new Set(result.files.map((f) => f.name));
    expect([...REQUIRED_BUNDLE_FILES].filter((name) => !written.has(name))).toEqual([]);
  });

  it('reports coverage of all fifteen required items in the manifest', async () => {
    const { manifest } = await bundle();
    expect(manifest.contents).toHaveLength(15);
    expect(manifest.contents).toHaveLength(REQUIRED_BUNDLE_ITEMS.length);
    expect(manifest.contents.filter((c) => !c.present)).toEqual([]);
  });

  it('records hashes that match the bytes actually on disk', async () => {
    const { dir, manifest } = await bundle();
    for (const file of manifest.files) {
      const bytes = readFileSync(join(dir, file.name));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
      expect(bytes.byteLength).toBe(file.bytes);
    }
  });

  it('records the same hashes in the database as in the manifest', async () => {
    const { db, runId, manifest } = await bundle();
    const stored = new Map(getArtifacts(db, runId).map((a) => [a.name, a.sha256]));
    for (const file of manifest.files) {
      expect(stored.get(file.name)).toBe(file.sha256);
    }
  });

  it('carries the code provenance of the run it describes', async () => {
    const { manifest } = await bundle();
    expect(manifest.code_provenance).toEqual({
      git_commit_sha: 'abc123',
      commit_source: 'environment',
      deployment_id: 'dep_1',
      app_version: '1.2.3',
      environment: 'test',
    });
  });

  it('lists every message with the recipients it was addressed to and reached', async () => {
    const { db, runId, dir } = await bundle();
    const lines = readFileSync(join(dir, 'messages.jsonl'), 'utf8').trim().split('\n');
    const stored = getMessages(db, runId);

    expect(lines).toHaveLength(stored.length);
    const first = JSON.parse(lines[0]!) as {
      message_id: string;
      visibility: { intended_recipients: string[]; actual_recipients: string[] };
    };
    expect(first.message_id).toBe(stored[0]!.message_id);
    expect(first.visibility.intended_recipients).toEqual(stored[0]!.intended_recipients);
    expect(first.visibility.actual_recipients).toEqual(stored[0]!.actual_recipients);
  });

  it('exports one event line per stored event, in sequence order', async () => {
    const { db, runId, dir } = await bundle();
    const lines = readFileSync(join(dir, 'events.jsonl'), 'utf8').trim().split('\n');
    const events = readEvents(db, runId);
    expect(lines).toHaveLength(events.length);
    expect((JSON.parse(lines[0]!) as { sequence: number }).sequence).toBe(1);
    expect((JSON.parse(lines.at(-1)!) as { sequence: number }).sequence).toBe(events.length);
  });

  it('names the moderator mode explicitly rather than leaving it to be inferred', async () => {
    const { dir } = await bundle();
    const agents = JSON.parse(readFileSync(join(dir, 'agents.json'), 'utf8')) as {
      moderator: { mode: string; role: string };
      participants: Array<{ id: string }>;
    };
    expect(agents.moderator.mode).toBe('llm');
    expect(agents.participants).toHaveLength(5);
  });

  it('links every invocation to the exact context it was given', async () => {
    const { db, runId, dir } = await bundle();
    const lines = readFileSync(join(dir, 'invocations.jsonl'), 'utf8').trim().split('\n');
    const invocations = getInvocations(db, runId);
    expect(lines).toHaveLength(invocations.length);

    const first = JSON.parse(lines[0]!) as {
      invocation_id: string;
      system_prompt: string;
      context_message_ids: string[];
      rendered_messages: unknown[];
    };
    expect(first.invocation_id).toBe(invocations[0]!.invocation_id);
    expect(first.system_prompt.length).toBeGreaterThan(0);
    expect(Array.isArray(first.context_message_ids)).toBe(true);
    expect(Array.isArray(first.rendered_messages)).toBe(true);
  });

  it('fails gate 1 when the bundle is incomplete', async () => {
    const { db, runId } = await bundle();
    // Forget one required artifact, as a partially written bundle would.
    db.prepare(`DELETE FROM artifacts WHERE run_id = ? AND name = 'manifest.json'`).run(runId);

    const report = finalizeReport(evaluateGates({ db, runId }));
    expect(report.gates.infrastructure_validated.status).toBe('FAIL');
    expect(report.gates.infrastructure_validated.failures.join(' ')).toContain('manifest.json');
  });
});

describe('a completed run exports itself', () => {
  it('writes the bundle without anyone asking, so gate 1 passes on its own', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    const result = await runner.execute();

    expect(exportOnCompletion(db, runner.id, result.status)).toBe(true);

    const report = finalizeReport(evaluateGates({ db, runId: runner.id }));
    expect(report.gates.infrastructure_validated.status).toBe('PASS');
    expect(report.gates.infrastructure_validated.next_steps).toEqual([]);
  });

  it('does not package a run that did not complete', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    await runner.execute();

    // Partial data belongs on the run pages, not in a bundle that looks like evidence.
    expect(exportOnCompletion(db, runner.id, 'INTERRUPTED')).toBe(false);
    expect(getArtifacts(db, runner.id)).toEqual([]);
  });

  it('reports an export failure instead of swallowing it', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen() });
    const result = await runner.execute();
    const errors: string[] = [];

    // An unknown run id is the cheapest way to make exportRun throw.
    expect(exportOnCompletion(db, 'run_missing', result.status, (m) => errors.push(m))).toBe(
      false,
    );
    expect(errors.join(' ')).toContain('run_missing');
  });
});
