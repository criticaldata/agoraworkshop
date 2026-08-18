import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { backupDatabase, verifyRestore } from '../src/db/backup.js';
import { WorkshopRunner } from '../src/orchestrator/runner.js';
import { frozen, tempDb, tempDir } from './helpers.js';

describe('SQLite backup and restore verification', () => {
  it('backs up a completed run and verifies its immutable configuration survives restore', async () => {
    const db = tempDb();
    const config = frozen();
    const runner = new WorkshopRunner({ db, frozen: config });
    await runner.execute();
    const target = join(tempDir(), 'agora-backup.sqlite');

    await backupDatabase(db, target);
    expect(existsSync(target)).toBe(true);
    expect(verifyRestore(target, runner.id).config_hash).toBe(config.hash);
  });
});
