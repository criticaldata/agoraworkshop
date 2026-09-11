import { z } from 'zod';
import type { Db } from '../db/index.js';
import { campaign } from './campaign.js';
import { canonicalize, configHash } from '../config/hash.js';
import { nowIso } from '../core/ids.js';
import { campaignLock, readScienceSnapshot } from './scienceStore.js';
import { scientificDataset } from './scientificDataset.js';

const text = z.string().trim().min(1).max(100000);
export const ClosureEvidenceSchema = z.object({
  version: z.literal('phase1-closure-evidence-v1'),
  manifest_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  kind: z.enum(['protocol_approval', 'analysis_plan', 'calibration_report', 'reliability_report', 'analysis_report']),
  author: text, title: text,
  // Store the actual report/plan, not an unchecked URL or a boolean PASS claim.
  body: text,
  related_evidence_hashes: z.array(z.string().regex(/^sha256:[a-f0-9]{64}$/)),
}).strict();

function initialize(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS phase1_closure_evidence (
    campaign_id TEXT NOT NULL REFERENCES phase1_campaigns(id),
    evidence_hash TEXT NOT NULL, kind TEXT NOT NULL, payload_json TEXT NOT NULL,
    recorded_at TEXT NOT NULL, before_execution INTEGER NOT NULL,
    PRIMARY KEY(campaign_id, evidence_hash)
  )`);
}
export function closureEvidence(db: Db, id: string) {
  initialize(db);
  return (db.prepare('SELECT * FROM phase1_closure_evidence WHERE campaign_id = ? ORDER BY rowid').all(id) as {
    evidence_hash: string; kind: string; payload_json: string; recorded_at: string; before_execution: number;
  }[]).map(row => {
    const payload = ClosureEvidenceSchema.parse(JSON.parse(row.payload_json));
    if (configHash(payload) !== row.evidence_hash) throw new Error('Closure evidence hash mismatch');
    return { ...row, payload };
  });
}

/** Append-only researcher attestations. Identity is self-declared under the shared
 * operator account; receipt and hashes are not independent scientific validation. */
export function recordClosureEvidence(db: Db, id: string, raw: unknown) {
  initialize(db);
  return db.transaction(() => {
    const { row, cases } = campaign(db, id), payload = ClosureEvidenceSchema.parse(raw);
    if (payload.manifest_hash !== row.manifest_hash) throw new Error('Evidence must bind this exact frozen campaign manifest');
    const beforeExecution = cases.every(c => c.state === 'pending' && !c.run_id);
    if (['protocol_approval', 'analysis_plan'].includes(payload.kind) && !beforeExecution) throw new Error('Protocol approval and analysis plan must be registered before execution. Freeze a new campaign for amendments; do not backdate preregistration.');
    const prior = closureEvidence(db, id);
    if (payload.related_evidence_hashes.some(hash => !prior.some(p => p.evidence_hash === hash))) throw new Error('Referenced closure evidence is absent from this campaign');
    const hash = configHash(payload);
    db.prepare('INSERT OR IGNORE INTO phase1_closure_evidence VALUES (?, ?, ?, ?, ?, ?)').run(id, hash, payload.kind, canonicalize(payload), nowIso(), Number(beforeExecution));
    return { evidence_hash: hash, verification: 'recorded_not_independently_validated' as const };
  }).immediate();
}

export function closureGates(db: Db, id: string, checks: { id: string; status: string }[], canonicalChecks: { complete: boolean; verified: boolean }[]) {
  const { plan, cases } = campaign(db, id);
  const evidence = closureEvidence(db, id);
  const gate = (id: string, title: string, passed: boolean, reason: string) => ({ id, title, status: passed ? 'PASS' : 'BLOCKED', reason });
  const canonical = !!plan.input.canonical;
  const runtimePass = checks.every(c => c.status === 'PASS');
  const missingEvidence = ['protocol_approval', 'analysis_plan', 'calibration_report', 'reliability_report', 'analysis_report'].filter(kind => !evidence.some(e => e.kind === kind));
  const preregistered = ['protocol_approval', 'analysis_plan'].every(kind => evidence.some(e => e.kind === kind && e.before_execution === 1));
  const lock = campaignLock(db, id);
  // P1-B is the machine-level behavioral-observability gate. It requires a
  // locked, reconstructable dataset and annotation-supporting coding units, but
  // it must not require human labels: independent coding, reliability and
  // adjudication are the deliberate P1-D blockers.
  const lockedPayload = lock ? readScienceSnapshot(db, lock).payload as {
    gates?: { canonical_protocol_complete?: boolean; comparability?: boolean };
    coding_units?: unknown[];
    source_runs?: Array<{ run?: { provider?: string } | null }>;
  } : null;
  const observability = !!lockedPayload &&
    lockedPayload.gates?.canonical_protocol_complete === true &&
    lockedPayload.gates?.comparability === true &&
    (lockedPayload.coding_units?.length ?? 0) > 0 &&
    (lockedPayload.source_runs ?? []).length === cases.length &&
    (lockedPayload.source_runs ?? []).every(source => !!source.run);
  const currentDataset = lock ? (() => { try { return scientificDataset(db, id); } catch { return null; } })() : null;
  const reviewPackage = db.prepare(`SELECT p.manifest_json FROM phase1_review_packages p
    JOIN phase1_dataset_snapshots s ON s.snapshot_id = p.snapshot_id
    WHERE s.campaign_id = ? ORDER BY p.created_at DESC LIMIT 1`).get(id) as { manifest_json: string } | undefined;
  const packageManifest = reviewPackage ? JSON.parse(reviewPackage.manifest_json) as { reviewer_count?: number } : null;
  const humanValidationComplete = !!currentDataset && currentDataset.gates.annotation_coverage_complete === true && currentDataset.gates.reliability_satisfied === true && currentDataset.annotation_conflicts.length === 0 && (packageManifest?.reviewer_count ?? 0) >= 2;
  return {
    version: 'phase1-closure-gates-v1', scope: 'Machine evidence checks, not a scientific release certificate',
    gates: [
      gate('P1-A', 'Protocol integrity', canonical && cases.every(c => c.state === 'completed') && canonicalChecks.length === cases.length && canonicalChecks.every(c => c.complete && c.verified) && runtimePass,
        'Requires the canonical eight stages, valid S1/S6/S7 records, sealed context, deterministic S8 and existing runtime audits. Zero change and no-majority decisions are allowed.'),
      gate('P1-B', 'Behavioral observability', canonical && canonicalChecks.length === cases.length && canonicalChecks.every(c => c.verified) && runtimePass && observability,
        'Requires machine provenance, a locked reconstructable dataset and annotation-supporting evidence. Human labels, reliability and adjudication are P1-D requirements, not P1-B requirements.'),
      gate('P1-C', 'Experimental comparability', plan.comparisons.every(c => c.valid) && plan.input.blocks % 10 === 0,
        'Role-only paired differences; complete five-role rotation crossed with AB/BA order requires a multiple of ten blocks. This is balance, not a power calculation.'),
      { id: 'P1-D', title: 'Scientific analysis readiness / closure', status: humanValidationComplete ? 'PASS' : 'PENDING_HUMAN_VALIDATION',
        reason: humanValidationComplete ? 'Independent coverage, empirical reliability, disagreement resolution and the content-addressed validation package are complete; no significance test is required.' : missingEvidence.length ? `Human-validation evidence is pending; currently missing: ${missingEvidence.join(', ')}.` : 'Independent human labels, empirical reliability and required adjudication remain the only scientific blockers; no significance test is required for this state.' },
    ],
    scientific_pass: humanValidationComplete, preregistered_documents_recorded: preregistered,
    missing_evidence: missingEvidence,
    evidence: evidence.map(e => ({ hash: e.evidence_hash, kind: e.kind, author: e.payload.author, title: e.payload.title, recorded_at: e.recorded_at, before_execution: !!e.before_execution, verification: 'recorded_not_independently_validated' })),
    scientific_dataset_id: lock,
    pending_scientific_decisions: ['Approve exact instruments, statistical methods, reliability thresholds and sample-size justification.', 'Supply independent calibration annotations and confirmatory data; review the computed evidence before scientific sign-off.'],
  };
}
