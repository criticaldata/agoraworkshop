import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
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

export function canonicalDatasetBytes(payload: unknown): Buffer {
  return Buffer.from(canonicalize(payload), 'utf8');
}

export interface LockedDataset {
  id: string;
  campaign_id: string;
  sha256: string;
  bytes: Buffer;
  state: string;
}

function ensureDatasetTables(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS phase1_dataset_snapshots (
    snapshot_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES phase1_campaigns(id) ON DELETE CASCADE,
    canonical_bytes BLOB NOT NULL, payload_json TEXT NOT NULL, content_hash TEXT NOT NULL UNIQUE,
    revision INTEGER NOT NULL DEFAULT 1, state TEXT NOT NULL, lock_event_id TEXT,
    created_at TEXT NOT NULL, locked_at TEXT
  ); CREATE TABLE IF NOT EXISTS phase1_archive_handoffs (
    handoff_id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL REFERENCES phase1_dataset_snapshots(snapshot_id) ON DELETE CASCADE,
    canonical_hash TEXT NOT NULL, archive_uri TEXT, status TEXT NOT NULL,
    confirmed_at TEXT, created_at TEXT NOT NULL, UNIQUE(snapshot_id)
  );`);
}

export function createDatasetSnapshot(db: Db, campaignId: string, payload: unknown): { id: string; sha256: string; bytes: Buffer } {
  ensureDatasetTables(db);
  const bytes = canonicalDatasetBytes(payload);
  const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const existing = db.prepare('SELECT snapshot_id FROM phase1_dataset_snapshots WHERE campaign_id = ? AND content_hash = ?').get(campaignId, sha256) as { snapshot_id: string } | undefined;
  if (existing) return { id: existing.snapshot_id, sha256, bytes };
  const id = `dataset_${sha256.slice('sha256:'.length, 26)}`;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO phase1_dataset_snapshots
    (snapshot_id, campaign_id, canonical_bytes, payload_json, content_hash, revision, state, lock_event_id, created_at, locked_at)
    VALUES (?, ?, ?, ?, ?, 1, 'LOCKED', NULL, ?, ?)`)
    .run(id, campaignId, bytes, bytes.toString('utf8'), sha256, now, now);
  return { id, sha256, bytes };
}

export function lockDataset(db: Db, campaignId: string, payload: unknown): LockedDataset {
  ensureDatasetTables(db);
  const existing = db.prepare('SELECT snapshot_id, campaign_id, canonical_bytes, content_hash, state FROM phase1_dataset_snapshots WHERE campaign_id = ? AND state = \'LOCKED\' ORDER BY created_at DESC LIMIT 1').get(campaignId) as { snapshot_id: string; campaign_id: string; canonical_bytes: Buffer; content_hash: string; state: string } | undefined;
  if (existing) throw new Error(`Dataset already locked: ${existing.snapshot_id}`);
  const snapshot = createDatasetSnapshot(db, campaignId, payload);
  const row = db.prepare('SELECT snapshot_id, campaign_id, canonical_bytes, content_hash, state FROM phase1_dataset_snapshots WHERE snapshot_id = ?').get(snapshot.id) as { snapshot_id: string; campaign_id: string; canonical_bytes: Buffer; content_hash: string; state: string };
  return { id: row.snapshot_id, campaign_id: row.campaign_id, sha256: row.content_hash, bytes: Buffer.from(row.canonical_bytes), state: row.state };
}

export function verifyDatasetLock(db: Db, snapshotId: string): { valid: boolean; errors: string[] } {
  ensureDatasetTables(db);
  const row = db.prepare('SELECT * FROM phase1_dataset_snapshots WHERE snapshot_id = ?').get(snapshotId) as { snapshot_id: string; canonical_bytes: Buffer; payload_json: string; content_hash: string; state: string } | undefined;
  if (!row) return { valid: false, errors: ['snapshot_not_found'] };
  const errors: string[] = [];
  const bytes = Buffer.from(row.canonical_bytes);
  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== row.content_hash) errors.push('canonical_bytes_hash_mismatch');
  if (bytes.toString('utf8') !== row.payload_json) errors.push('payload_bytes_mismatch');
  if (row.state !== 'LOCKED') errors.push('snapshot_not_locked');
  if (!row.snapshot_id.startsWith('dataset_')) errors.push('snapshot_id_not_content_addressed');
  return { valid: errors.length === 0, errors };
}

export function archiveHandoff(db: Db, snapshotId: string, archiveUri: string | null = null) {
  ensureDatasetTables(db);
  const verification = verifyDatasetLock(db, snapshotId);
  if (!verification.valid) throw new Error(`Cannot hand off invalid dataset snapshot: ${verification.errors.join(', ')}`);
  const row = db.prepare('SELECT content_hash FROM phase1_dataset_snapshots WHERE snapshot_id = ?').get(snapshotId) as { content_hash: string } | undefined;
  if (!row) throw new Error('Dataset snapshot not found');
  const existing = db.prepare('SELECT * FROM phase1_archive_handoffs WHERE snapshot_id = ?').get(snapshotId) as Record<string, unknown> | undefined;
  if (existing) return existing;
  const handoff = { handoff_id: `handoff_${randomUUID()}`, snapshot_id: snapshotId, canonical_hash: row.content_hash, archive_uri: archiveUri, status: archiveUri ? 'EXTERNAL_ARCHIVE_DECLARED' : 'REQUIRES_EXTERNAL_IMMUTABLE_ARCHIVE', confirmed_at: null, created_at: new Date().toISOString() };
  db.prepare('INSERT INTO phase1_archive_handoffs VALUES (?, ?, ?, ?, ?, ?, ?)').run(handoff.handoff_id, handoff.snapshot_id, handoff.canonical_hash, handoff.archive_uri, handoff.status, handoff.confirmed_at, handoff.created_at);
  return handoff;
}

/** Marks a declared external archive only after an operator has independently
 * verified its immutability and hash. The application cannot verify a remote
 * WORM/Object-Lock service by itself. */
export function confirmArchiveHandoff(db: Db, snapshotId: string, confirmedAt = new Date().toISOString()) {
  ensureDatasetTables(db);
  const row = db.prepare('SELECT * FROM phase1_archive_handoffs WHERE snapshot_id = ?').get(snapshotId) as { archive_uri: string | null } | undefined;
  if (!row || !row.archive_uri) throw new Error('An archive URI must be declared before confirmation');
  db.prepare("UPDATE phase1_archive_handoffs SET status = 'EXTERNAL_ARCHIVE_CONFIRMED', confirmed_at = ? WHERE snapshot_id = ?").run(confirmedAt, snapshotId);
  return db.prepare('SELECT * FROM phase1_archive_handoffs WHERE snapshot_id = ?').get(snapshotId);
}
