import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nowIso } from '../core/ids.js';
import { openDatabase, type Db } from './index.js';
import { getRun } from './queries.js';
import { exportRun } from '../export/exporter.js';

const REQUIRED_RESTORE_TABLES = [
  'runs', 'events', 'state_transitions', 'opportunities', 'invocations', 'messages',
  'context_summaries', 'tool_calls', 'run_checkpoints', 'artifacts',
] as const;

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
  restore_export_path: string;
  restore_artifact_hashes_json: string;
  restore_replay_available: number;
  restore_event_sequence_contiguous: number;
  restore_tables_json: string;
  verified_at: string;
}

/** Records restore evidence only after reopening the snapshot and checking its run. */
export function recordBackupVerification(db: Db, runId: string, backupPath: string): BackupVerification {
  const durablePath = resolve(backupPath);
  const restored = inspectRestore(durablePath, runId);
  const restoreExportPath = `${durablePath}.restore-export`;
  const restoredDb = openDatabase(durablePath);
  let restoreArtifactHashes: Record<string, string> = {};
  try {
    const restoreExport = exportRun({ db: restoredDb, runId, outDir: restoreExportPath });
    restoreArtifactHashes = Object.fromEntries(restoreExport.files.map((file) => [file.name, file.sha256]));
  } finally {
    restoredDb.close();
  }
  const row: BackupVerification = {
    backup_verification_id: `backup_${randomUUID()}`,
    run_id: runId,
    backup_path: durablePath,
    backup_sha256: createHash('sha256').update(readFileSync(durablePath)).digest('hex'),
    backup_bytes: statSync(durablePath).size,
    config_hash: restored.config_hash,
    event_count: restored.event_count,
    restore_export_path: restoreExportPath,
    restore_artifact_hashes_json: JSON.stringify(restoreArtifactHashes),
    restore_replay_available: existsSync(join(restoreExportPath, 'replay.html')) ? 1 : 0,
    restore_event_sequence_contiguous: restored.event_sequence_contiguous ? 1 : 0,
    restore_tables_json: JSON.stringify(restored.tables),
    verified_at: nowIso(),
  };
  db.prepare(
    `INSERT INTO backup_verifications
      (backup_verification_id, run_id, backup_path, backup_sha256, backup_bytes, config_hash, event_count,
       restore_export_path, restore_artifact_hashes_json, restore_replay_available,
       restore_event_sequence_contiguous, restore_tables_json, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.backup_verification_id, row.run_id, row.backup_path, row.backup_sha256,
    row.backup_bytes, row.config_hash, row.event_count, row.restore_export_path,
    row.restore_artifact_hashes_json, row.restore_replay_available,
    row.restore_event_sequence_contiguous, row.restore_tables_json, row.verified_at,
  );
  return row;
}

interface RestoreInspection {
  run_id: string;
  config_hash: string;
  event_count: number;
  event_sequence_contiguous: boolean;
  tables: string[];
}

function inspectRestore(backupPath: string, runId: string): RestoreInspection {
  const restored = openDatabase(backupPath);
  try {
    const run = getRun(restored, runId);
    if (!run) throw new Error(`backup does not contain run ${runId}`);
    const tableNames = new Set(
      (restored.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>)
        .map((row) => row.name),
    );
    const tables = REQUIRED_RESTORE_TABLES.filter((name) => tableNames.has(name));
    if (tables.length !== REQUIRED_RESTORE_TABLES.length) {
      throw new Error(`backup is missing required tables: ${REQUIRED_RESTORE_TABLES.filter((name) => !tableNames.has(name)).join(', ')}`);
    }
    const sequences = restored.prepare(
      `SELECT sequence FROM events WHERE run_id = ? ORDER BY sequence`,
    ).all(runId) as Array<{ sequence: number }>;
    return {
      run_id: run.run_id,
      config_hash: run.config_hash,
      event_count: sequences.length,
      event_sequence_contiguous: sequences.every((row, index) => row.sequence === index + 1),
      tables,
    };
  } finally {
    restored.close();
  }
}
