import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA_SQL } from './schema.js';

/**
 * Columns added to `runs` after the first release. Existing databases hold real runs,
 * so they are altered in place rather than recreated.
 */
const ADDED_COLUMNS: Record<string, Array<[string, string]>> = {
  runs: [
    ['commit_source', 'commit_source TEXT'],
    ['deployment_id', 'deployment_id TEXT'],
    ['app_version', 'app_version TEXT'],
    ['environment', 'environment TEXT'],
  ],
  events: [['trace_id', 'trace_id TEXT']],
  opportunities: [['trace_id', 'trace_id TEXT']],
  invocations: [['trace_id', 'trace_id TEXT']],
  messages: [['trace_id', 'trace_id TEXT']],
};

/**
 * Runs before the schema script, not after.
 *
 * `CREATE TABLE IF NOT EXISTS` silently skips a table that already exists, so a column
 * added to the schema never reaches an existing database. On a fresh database
 * `PRAGMA table_info` returns no rows, this does nothing, and the schema creates the
 * table complete. Both paths end in the same shape.
 */
function migrate(db: Db): void {
  for (const [table, additions] of Object.entries(ADDED_COLUMNS)) {
    const existing = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (existing.length === 0) continue;
    const present = new Set(existing.map((column) => column.name));
    for (const [name, ddl] of additions) {
      if (!present.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  }
}

export type Db = Database.Database;

let cached: Db | null = null;

export function databasePath(): string {
  const explicit = process.env.AGORA_DB_PATH;
  if (explicit) return resolve(explicit);
  const dataDir = process.env.AGORA_DATA_DIR ?? './data';
  return resolve(dataDir, 'agora.sqlite');
}

export function openDatabase(path = databasePath()): Db {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  migrate(db);
  db.exec(SCHEMA_SQL);
  return db;
}

/** Process-wide handle used by the CLI and the server. */
export function getDatabase(): Db {
  if (!cached) cached = openDatabase();
  return cached;
}

export function closeDatabase(): void {
  cached?.close();
  cached = null;
}
