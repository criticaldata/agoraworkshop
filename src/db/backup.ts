import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { nowIso } from '../core/ids.js';
import { openDatabase, type Db } from './index.js';
import { getRun } from './queries.js';

/** Creates a consistent SQLite snapshot through the driver, including WAL contents. */
export async function backupDatabase(db: Db, targetPath: string): Promise<void> {
  await db.backup(targetPath);
}

export function verifyRestore(
  backupPath: string,
  runId: string,
): { run_id: string; config_hash: string; event_count: number } {
  const restored = openDatabase(backupPath);
  try {
    const run = getRun(restored, runId);
    if (!run) throw new Error(`backup does not contain run ${runId}`);
    const eventCount = (
      restored.prepare('SELECT COUNT(*) AS count FROM events WHERE run_id = ?').get(runId) as {
        count: number;
      }
    ).count;
    return { run_id: run.run_id, config_hash: run.config_hash, event_count: eventCount };
  } finally {
    restored.close();
  }
}

export interface BackupVerification {
  backup_verification_id: string;
  run_id: string;
  backup_path: string;
  backup_sha256: string;
  backup_bytes: number;
  config_hash: string;
  event_count: number;
  verified_at: string;
}

/** Records restore evidence only after reopening the snapshot and checking its run. */
export function recordBackupVerification(db: Db, runId: string, backupPath: string): BackupVerification {
  const durablePath = resolve(backupPath);
  const restored = verifyRestore(durablePath, runId);
  const row: BackupVerification = {
    backup_verification_id: `backup_${randomUUID()}`,
    run_id: runId,
    backup_path: durablePath,
    backup_sha256: createHash('sha256').update(readFileSync(durablePath)).digest('hex'),
    backup_bytes: statSync(durablePath).size,
    config_hash: restored.config_hash,
    event_count: restored.event_count,
    verified_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO backup_verifications
      (backup_verification_id, run_id, backup_path, backup_sha256, backup_bytes, config_hash, event_count, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.backup_verification_id, row.run_id, row.backup_path, row.backup_sha256,
    row.backup_bytes, row.config_hash, row.event_count, row.verified_at,
  );
  return row;
}
