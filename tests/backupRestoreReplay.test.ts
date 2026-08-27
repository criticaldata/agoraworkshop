import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { backupDatabase, recordBackupVerification } from '../src/db/backup.js';
import { evaluatePhase01 } from '../src/acceptance/phase01.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { frozen, tempDb, tempDir } from './helpers.js';

describe('restore-generated evidence', () => {
  it('reopens the backup, regenerates a bundle and verifies replay plus artifact hashes', async () => {
    const db = tempDb();
    const runner = new WorkshopRunner({ db, frozen: frozen({ recovery: { enabled: true, checkpoint_every: 'opportunity' } }) });
    await runner.execute();
    const backupPath = join(tempDir(), 'restore-evidence.sqlite');

    await backupDatabase(db, backupPath);
    const verification = recordBackupVerification(db, runner.id, backupPath);
    const hashes = JSON.parse(verification.restore_artifact_hashes_json) as Record<string, string>;

    expect(verification.restore_event_sequence_contiguous).toBe(1);
    expect(JSON.parse(verification.restore_tables_json)).toEqual(expect.arrayContaining([
      'runs', 'events', 'opportunities', 'invocations', 'messages', 'artifacts',
    ]));
    expect(verification.restore_replay_available).toBe(1);
    expect(existsSync(join(verification.restore_export_path, 'replay.html'))).toBe(true);
    for (const [name, expected] of Object.entries(hashes)) {
      expect(createHash('sha256').update(readFileSync(join(verification.restore_export_path, name))).digest('hex')).toBe(expected);
    }
    expect(evaluatePhase01(db, runner.id).find((metric) => metric.id === 'M28')?.status).toBe('PASS');
  });
});
