import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { codeProvenance, shown, UNAVAILABLE } from '../src/core/provenance.js';
import { getRun, runProvenance } from '../src/db/queries.js';
import { readEvents } from '../src/events/recorder.js';
import { frozen, tempDb } from './helpers.js';

const noGit = () => null;

describe('code provenance', () => {
  it('prefers the deployment platform over a local checkout', () => {
    const p = codeProvenance(
      {
        RAILWAY_GIT_COMMIT_SHA: 'railwaysha',
        RAILWAY_DEPLOYMENT_ID: 'dep_1',
        RAILWAY_ENVIRONMENT_NAME: 'production',
      } as NodeJS.ProcessEnv,
      () => 'localsha',
    );
    expect(p.git_commit_sha).toBe('railwaysha');
    expect(p.commit_source).toBe('railway');
    expect(p.deployment_id).toBe('dep_1');
    expect(p.environment).toBe('production');
  });

  it('reports what is genuinely missing instead of inventing it', () => {
    const p = codeProvenance({} as NodeJS.ProcessEnv, noGit);
    expect(p.git_commit_sha).toBeNull();
    expect(p.commit_source).toBeNull();
    expect(p.deployment_id).toBeNull();
    // Display, not storage: null stays null in the database.
    expect(shown(p.deployment_id)).toBe(UNAVAILABLE);
  });

  it('is written onto the run row and into the run_created event', async () => {
    const db = tempDb();
    const provenance = {
      git_commit_sha: 'abc123',
      commit_source: 'environment' as const,
      deployment_id: 'dep_9',
      app_version: '9.9.9',
      environment: 'test',
    };
    const runner = new WorkshopRunner({ db, frozen: frozen(), provenance });
    await runner.execute();

    expect(runProvenance(getRun(db, runner.id)!)).toEqual(provenance);
    const created = readEvents(db, runner.id).find((e) => e.event_type === 'run_created')!;
    expect(created.payload['code_provenance']).toEqual(provenance);
  });
});

describe('runs table migration', () => {
  /** The shape the first release created, before provenance columns existed. */
  const LEGACY_RUNS = `CREATE TABLE runs (
    run_id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, config_hash TEXT NOT NULL,
    config_json TEXT NOT NULL, config_canonical TEXT NOT NULL, config_source_path TEXT,
    source_run_id TEXT, status TEXT NOT NULL, termination_reason TEXT, failure_reason TEXT,
    provider TEXT NOT NULL, model TEXT NOT NULL, code_commit_sha TEXT,
    created_at TEXT NOT NULL, started_at TEXT, ended_at TEXT, duration_ms INTEGER)`;

  function legacyDatabase(): string {
    const path = join(mkdtempSync(join(tmpdir(), 'agora-legacy-')), 'agora.sqlite');
    const db = new Database(path);
    db.exec(LEGACY_RUNS);
    db.prepare(
      `INSERT INTO runs (run_id, experiment_id, config_hash, config_json, config_canonical,
         status, provider, model, code_commit_sha, created_at)
       VALUES ('run_legacy', 'exp', 'sha256:abc', '{}', '{}', 'COMPLETED', 'openai', 'm',
         'deadbeef', '2026-01-01T00:00:00Z')`,
    ).run();
    db.close();
    return path;
  }

  it('adds the new columns to an existing database without losing a row', () => {
    // CREATE TABLE IF NOT EXISTS silently skips a table that already exists, so the
    // migration has to run before the schema script or the columns never arrive.
    const db = openDatabase(legacyDatabase());

    const columns = (db.prepare(`PRAGMA table_info(runs)`).all() as Array<{ name: string }>).map(
      (c) => c.name,
    );
    expect(columns).toEqual(
      expect.arrayContaining(['commit_source', 'deployment_id', 'app_version', 'environment']),
    );

    const row = getRun(db, 'run_legacy')!;
    expect(row.code_commit_sha).toBe('deadbeef');
    expect(runProvenance(row)).toEqual({
      git_commit_sha: 'deadbeef',
      commit_source: null,
      deployment_id: null,
      app_version: null,
      environment: null,
    });
  });

  it('is idempotent across restarts', () => {
    const path = legacyDatabase();
    openDatabase(path).close();
    const db = openDatabase(path);
    expect(getRun(db, 'run_legacy')!.run_id).toBe('run_legacy');
  });
});
