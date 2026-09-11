import { expect, it } from 'vitest';
import { initializePhase1 } from '../src/phase1/campaign.js';
import { tempDb } from './helpers.js';

it('adds Phase 1 calibration and review fields to an existing database idempotently', () => {
  const db = tempDb();
  initializePhase1(db);
  initializePhase1(db);

  const ballotColumns = new Set((db.prepare('PRAGMA table_info(phase1_ballots)').all() as { name: string }[]).map(row => row.name));
  expect([...ballotColumns]).toEqual(expect.arrayContaining([
    'trace_id', 'opportunity_id', 'invocation_id', 'terminal_status',
    'failure_category', 'authorized_context_json', 'usage_json',
  ]));

  const tables = new Set((db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'phase1_%'").all() as { name: string }[]).map(row => row.name));
  expect([...tables]).toEqual(expect.arrayContaining([
    'phase1_instrument_locks', 'phase1_dataset_snapshots', 'phase1_review_assignments',
    'phase1_review_submissions', 'phase1_review_packages', 'phase1_adjudications', 'phase1_archive_handoffs',
  ]));
  db.close();
});
