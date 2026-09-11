import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db/index.js';
import { configHash, canonicalize } from '../config/hash.js';
import { codeProvenance } from '../core/provenance.js';
import { campaign, previewPrompts } from './campaign.js';
import { campaignAnalysis } from './analysis.js';
import { allAnnotations } from '../semantic/phase1Annotations.js';
import { getRun } from '../db/queries.js';
import { closureEvidence } from './closure.js';
import { scienceSnapshots, campaignLock } from './scienceStore.js';
import { artifactReviews } from './artifactReview.js';
import { freezeCalibrationInstruments, instrumentManifestHash } from './instruments.js';

// Includes partial evidence, recovery records and existing semantic artifacts.
const TABLES = ['events', 'messages', 'invocations', 'opportunities', 'state_transitions', 'context_summaries', 'tool_calls', 'run_checkpoints', 'semantic_extractions', 'semantic_nodes', 'semantic_edges', 'semantic_evidence', 'phase1_positions', 'phase1_stages', 'phase1_ballots', 'phase1_collective_outputs'] as const;
export function campaignBundle(db: Db, id: string) {
  const frozen = campaign(db, id);
  const evidence = db.prepare('SELECT * FROM phase1_evidence WHERE campaign_id = ?').all(id) as { run_id: string; purpose: string }[];
  const runIds = [...new Set([...frozen.cases.flatMap(c => c.run_id ? [c.run_id] : []), ...evidence.map(e => e.run_id)])];
  const runs = runIds.map(runId => ({ run: getRun(db, runId), records: Object.fromEntries(TABLES.map(table => [table, db.prepare(`SELECT * FROM ${table} WHERE run_id = ? ORDER BY rowid`).all(runId)])) }));
  const artifacts = {
    manifest: { ...frozen, exporter_provenance: codeProvenance() },
    prompts: previewPrompts(frozen.plan), comparison: campaignAnalysis(db, id),
    annotations: allAnnotations(db, id), evidence_links: evidence, runs,
    closure_evidence: closureEvidence(db, id),
    scientific_snapshots: scienceSnapshots(db, id), annotation_lock: campaignLock(db, id),
    dataset_snapshots: db.prepare('SELECT snapshot_id, campaign_id, content_hash, revision, state, lock_event_id, created_at, locked_at FROM phase1_dataset_snapshots WHERE campaign_id = ? ORDER BY created_at').all(id),
    archive_handoffs: db.prepare(`SELECT h.* FROM phase1_archive_handoffs h JOIN phase1_dataset_snapshots s ON s.snapshot_id = h.snapshot_id WHERE s.campaign_id = ? ORDER BY h.created_at`).all(id),
    artifact_reviews: artifactReviews(db, id),
    usage_ledger: db.prepare('SELECT * FROM phase1_usage WHERE campaign_id = ? ORDER BY rowid').all(id),
    instrument_manifests: frozen.plan.input.evaluation ? freezeCalibrationInstruments({ role_pack: frozen.plan.input.role_pack, evaluation: frozen.plan.input.evaluation, analysis_plan: frozen.plan.input.analysis_plan ?? null, protocol: frozen.plan.input.canonical ?? null }) : [],
    instrument_manifest_hash: frozen.plan.input.evaluation ? instrumentManifestHash(freezeCalibrationInstruments({ role_pack: frozen.plan.input.role_pack, evaluation: frozen.plan.input.evaluation, analysis_plan: frozen.plan.input.analysis_plan ?? null, protocol: frozen.plan.input.canonical ?? null })) : null,
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
