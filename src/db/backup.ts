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

