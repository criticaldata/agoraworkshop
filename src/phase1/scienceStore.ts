import { randomUUID } from 'node:crypto';
import type { Db } from '../db/index.js';
import { configHash, canonicalize } from '../config/hash.js';

export function initializeScience(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS phase1_science_snapshots (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES phase1_campaigns(id),
    kind TEXT NOT NULL, content_hash TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS phase1_annotation_locks (
    campaign_id TEXT PRIMARY KEY REFERENCES phase1_campaigns(id), snapshot_id TEXT NOT NULL REFERENCES phase1_science_snapshots(id)
  ); CREATE TABLE IF NOT EXISTS phase1_artifact_reviews (
    id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES phase1_campaigns(id), run_id TEXT NOT NULL REFERENCES runs(run_id), payload_json TEXT NOT NULL, created_at TEXT NOT NULL
  );`);
}
export function campaignLock(db: Db, id: string): string | null {
  initializeScience(db);
  return (db.prepare('SELECT snapshot_id FROM phase1_annotation_locks WHERE campaign_id = ?').get(id) as { snapshot_id: string } | undefined)?.snapshot_id ?? null;
}
export function assertCampaignUnlocked(db: Db, id: string): void {
  if (campaignLock(db, id)) throw new Error('Campaign and annotations are locked for analysis. Create a new campaign/version for further execution or coding.');
}
export function saveScienceSnapshot(db: Db, campaignId: string, kind: 'dataset' | 'analysis', payload: unknown) {
  initializeScience(db);
  const hash = configHash(payload), id = `science_${randomUUID()}`;
  db.prepare('INSERT INTO phase1_science_snapshots VALUES (?, ?, ?, ?, ?, ?)').run(id, campaignId, kind, hash, canonicalize(payload), new Date().toISOString());
  return { id, hash };
}
export function readScienceSnapshot(db: Db, id: string) {
  initializeScience(db);
  const row = db.prepare('SELECT * FROM phase1_science_snapshots WHERE id = ?').get(id) as { id: string; campaign_id: string; kind: string; content_hash: string; payload_json: string; created_at: string } | undefined;
  if (!row) throw new Error('Scientific snapshot not found');
  const payload = JSON.parse(row.payload_json);
  if (configHash(payload) !== row.content_hash) throw new Error('Scientific snapshot hash mismatch');
  const { payload_json: _serialized, ...metadata } = row;
  return { ...metadata, payload };
}
export function scienceSnapshots(db: Db, campaignId: string) {
  initializeScience(db);
  return (db.prepare('SELECT id FROM phase1_science_snapshots WHERE campaign_id = ? ORDER BY rowid').all(campaignId) as { id: string }[]).map(r => readScienceSnapshot(db, r.id));
}
