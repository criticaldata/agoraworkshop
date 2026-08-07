import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SCHEMA_SQL } from './schema.js';

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
