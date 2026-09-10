import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db/index.js';
import { configHash, canonicalize } from '../config/hash.js';
import { codeProvenance } from '../core/provenance.js';
import { campaign, previewPrompts } from './campaign.js';
import { campaignAnalysis } from './analysis.js';
import { allAnnotations } from '../semantic/phase1Annotations.js';
import { getRun } from '../db/queries.js';

// Includes partial evidence, recovery records and existing semantic artifacts.
const TABLES = ['events', 'messages', 'invocations', 'opportunities', 'state_transitions', 'context_summaries', 'tool_calls', 'run_checkpoints', 'semantic_extractions', 'semantic_nodes', 'semantic_edges', 'semantic_evidence'] as const;
export function campaignBundle(db: Db, id: string) {
  const frozen = campaign(db, id);
  const evidence = db.prepare('SELECT * FROM phase1_evidence WHERE campaign_id = ?').all(id) as { run_id: string; purpose: string }[];
  const runIds = [...new Set([...frozen.cases.flatMap(c => c.run_id ? [c.run_id] : []), ...evidence.map(e => e.run_id)])];
  const runs = runIds.map(runId => ({ run: getRun(db, runId), records: Object.fromEntries(TABLES.map(table => [table, db.prepare(`SELECT * FROM ${table} WHERE run_id = ? ORDER BY rowid`).all(runId)])) }));
  const artifacts = {
    manifest: { ...frozen, exporter_provenance: codeProvenance() },
    prompts: previewPrompts(frozen.plan), comparison: campaignAnalysis(db, id),
    annotations: allAnnotations(db, id), evidence_links: evidence, runs,
    usage_ledger: db.prepare('SELECT * FROM phase1_usage WHERE campaign_id = ? ORDER BY rowid').all(id),
  };
  return { format: 'phase1a-review-bundle-v1', warning: 'Unblinded researcher export: includes private transcripts, hidden role assignments and all human labels. Share only within the approved research access boundary.',
    artifacts, hashes: Object.fromEntries(Object.entries(artifacts).map(([key, value]) => [key, configHash(value)])) };
}

/** Refuse to overwrite an existing bundle. Canonical JSON hashes are portable. */
export function exportCampaign(db: Db, id: string, out: string): string {
  const bundle = campaignBundle(db, id);
  mkdirSync(out, { recursive: true });
  const path = join(out, `${id}.json`);
  writeFileSync(path, canonicalize(bundle) + '\n', { flag: 'wx', mode: 0o600 });
  return path;
}
