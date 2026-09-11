import { describe, expect, it } from 'vitest';
import { freezeCampaign, starterInput } from '../src/phase1/campaign.js';
import { archiveHandoff, canonicalDatasetBytes, confirmArchiveHandoff, lockDataset, verifyDatasetLock } from '../src/phase1/scienceStore.js';
import { frozen, tempDb } from './helpers.js';

describe('content-addressed Phase 1 dataset locks', () => {
  it('stores canonical bytes, rejects mutation and records external archive state', () => {
    const db = tempDb();
    const id = freezeCampaign(db, { ...starterInput(frozen().config, true), blocks: 1 });
    const payload = { version: 'fixture-v1', units: [{ id: 'u1', label: null }], source_hash: 'sha256:fixture' };
    const locked = lockDataset(db, id, payload);
    expect(locked.bytes.equals(canonicalDatasetBytes(payload))).toBe(true);
    expect(verifyDatasetLock(db, locked.id)).toEqual({ valid: true, errors: [] });
    expect(archiveHandoff(db, locked.id).status).toBe('REQUIRES_EXTERNAL_IMMUTABLE_ARCHIVE');
    const declaredId = freezeCampaign(db, { ...starterInput(frozen().config, true), blocks: 1 });
    const declared = lockDataset(db, declaredId, { version: 'fixture-v2' });
    expect(archiveHandoff(db, declared.id, 's3://example/object-lock/fixture.json').status).toBe('EXTERNAL_ARCHIVE_DECLARED');
    expect((confirmArchiveHandoff(db, declared.id) as { status: string }).status).toBe('EXTERNAL_ARCHIVE_CONFIRMED');
    db.prepare('UPDATE phase1_dataset_snapshots SET canonical_bytes = ? WHERE snapshot_id = ?').run(Buffer.from('tampered'), locked.id);
    expect(verifyDatasetLock(db, locked.id).valid).toBe(false);
    db.close();
  });

  it('does not create a second locked snapshot for the same campaign', () => {
    const db = tempDb();
    const id = freezeCampaign(db, { ...starterInput(frozen().config, true), blocks: 1 });
    lockDataset(db, id, { version: 'fixture-v1' });
    expect(() => lockDataset(db, id, { version: 'fixture-v2' })).toThrow(/already locked/);
    db.close();
  });
});
