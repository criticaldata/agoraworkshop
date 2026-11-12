import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { configHash } from '../config/hash.js';
import { inferState, providerCallTokenCharge, verifyEvidenceBundle, type Phase1aPersistedSnapshot, type Phase1aStore } from './index.js';

interface SnapshotRow {
  run_id: string;
  revision: number;
  state: Phase1aPersistedSnapshot['state'];
  calls_used: number;
  tokens_used: number;
  bundle_json: string;
  bundle_hash: string;
}

export class Phase1aSqliteStore implements Phase1aStore {
  private readonly db: Database.Database;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS phase1a_snapshots (
        run_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        state TEXT NOT NULL,
        calls_used INTEGER NOT NULL,
        tokens_used INTEGER NOT NULL,
        bundle_json TEXT NOT NULL,
        bundle_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (run_id, revision)
      );
    `);
  }

  appendSnapshot(snapshot: Phase1aPersistedSnapshot): void {
    const verification = verifyEvidenceBundle(snapshot.bundle);
    if (!verification.valid) throw new Error(`Cannot persist invalid Phase 1A evidence: ${verification.errors.join(', ')}`);
    this.assertSnapshotMetadata(snapshot);
    const bundleJson = JSON.stringify(snapshot.bundle);
    const transaction = this.db.transaction(() => {
      const row = this.db.prepare('SELECT COALESCE(MAX(revision), 0) AS revision FROM phase1a_snapshots WHERE run_id = ?').get(snapshot.runId) as { revision: number };
      this.db.prepare(`
        INSERT INTO phase1a_snapshots
          (run_id, revision, state, calls_used, tokens_used, bundle_json, bundle_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(snapshot.runId, row.revision + 1, snapshot.state, snapshot.callsUsed, snapshot.tokensUsed, bundleJson, configHash(snapshot.bundle), new Date().toISOString());
    });
    transaction.immediate();
  }

  latestSnapshot(runId: string): Phase1aPersistedSnapshot | null {
    const row = this.db.prepare('SELECT * FROM phase1a_snapshots WHERE run_id = ? ORDER BY revision DESC LIMIT 1').get(runId) as SnapshotRow | undefined;
    if (!row) return null;
    const bundle = JSON.parse(row.bundle_json) as Phase1aPersistedSnapshot['bundle'];
    if (configHash(bundle) !== row.bundle_hash) throw new Error(`Durable Phase 1A snapshot hash mismatch for ${runId}`);
    const verification = verifyEvidenceBundle(bundle);
    if (!verification.valid) throw new Error(`Durable Phase 1A snapshot is invalid: ${verification.errors.join(', ')}`);
    const snapshot = { runId: row.run_id, state: row.state, callsUsed: row.calls_used, tokensUsed: row.tokens_used, bundle };
    this.assertSnapshotMetadata(snapshot);
    return snapshot;
  }

  revisions(runId: string): number {
    return (this.db.prepare('SELECT COUNT(*) AS count FROM phase1a_snapshots WHERE run_id = ?').get(runId) as { count: number }).count;
  }

  close(): void { this.db.close(); }

  private assertSnapshotMetadata(snapshot: Phase1aPersistedSnapshot): void {
    const bundleRunId = snapshot.bundle.events[0]?.run_id;
    if (!bundleRunId || snapshot.runId !== bundleRunId) throw new Error('Durable Phase 1A snapshot run id does not match its evidence');
    if (snapshot.state !== inferState(snapshot.bundle.events)) throw new Error('Durable Phase 1A snapshot state does not match its evidence');
    if (snapshot.callsUsed !== snapshot.bundle.provider_calls.length) throw new Error('Durable Phase 1A snapshot call count does not match its evidence');
    const expectedTokens = snapshot.bundle.provider_calls.reduce((sum, call) => sum + providerCallTokenCharge(call.usage), 0);
    if (snapshot.tokensUsed !== expectedTokens) throw new Error('Durable Phase 1A snapshot token count does not match its evidence');
  }
}
