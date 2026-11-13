import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { configHash } from '../../config/hash.js';
import { DeterministicMockProvider, Phase1aRuntime, Phase1aSqliteStore, verifyEvidenceBundle, type EvidenceBundle, type Phase1aManifest, type Phase1aProvider } from '../index.js';
import { createSyntheticDeploymentBinding } from '../wp01/index.js';
import { adaptWp01Run } from '../wp02/adapter.js';
import { analyzeRun } from '../wp06/index.js';
import { buildWorkshopPlan } from '../wp03/workflow.js';
import { compileExperiment, ExperimentPlanSchema, planHash, sealCampaign, type ExperimentPlan } from './plan.js';
import { ChatCompletionsProvider, resolveEndpoints } from './provider.js';

export function writePrivateJson(path: string, value: unknown) {
  const temp = `${path}.tmp`;
  const fd = openSync(temp, 'w', 0o600);
  try { writeFileSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, path);
}

export function mockManifests(input: unknown): Phase1aManifest[] {
  const plan = ExperimentPlanSchema.parse(input);
  if (planHash(plan) !== plan.plan_hash) throw new Error('Plan hash mismatch');
  let campaign = structuredClone(plan.campaign);
  campaign.profile = 'synthetic';
  for (const run of campaign.runs) run.bindings = run.bindings.map(b => ({ participant_slot: b.participant_slot, ...createSyntheticDeploymentBinding(b.logical_family, 'engineering-rehearsal'), parameters: b.parameters }));
  campaign = sealCampaign(campaign);
  return plan.execution_order.map(id => adaptWp01Run(campaign, id, { admissionClass: 'engineering', topic: plan.topic, limits: plan.limits, approvedAt: '2026-11-11T00:00:00.000Z' }));
}

export function reviewPrompts(plan: ExperimentPlan) {
  return { plan_hash: plan.plan_hash, notice: 'ENGINEERING PREVIEW. Synthetic identities; exact current adapter prompts and operation order. Approval required.', unused_registry_prompts: ['no-report-condition'], context_rules: { private: 'Public artifacts and own earlier checkpoints only', public: 'Public artifacts only', report_draft: 'Public artifacts only', report_reviews: 'Same draft only; no public transcript or other review', report_revision: 'Draft and both reviews only' }, runs: mockManifests(plan).map(manifest => ({ id: manifest.manifestId, cell: manifest.cell, report_disclosure: manifest.reportEnabled ? manifest.reportPrompts.disclosure : null, ...buildWorkshopPlan(manifest) })) };
}

export function hasUnresolvedCall(bundle: EvidenceBundle): boolean {
  const starts = bundle.events.filter(e => e.event_type === 'provider_call.started');
  if (starts.length !== bundle.provider_calls.length) return true;
  if (bundle.events.some(e => e.event_type === 'run.failed')) return false;
  const committed = new Set(bundle.events.filter(e => e.event_type === 'operation.committed').map(e => e.payload.operation_key));
  return starts.some(e => !committed.has(e.payload.operation_key));
}

type Roster = { plan_hash: string; mode: 'mock' | 'live'; manifests_hash: string; rows: { manifest_id: string; cell: string; replication: number; run_id: string | null; status: string; calls: number }[] };
export async function executeExperiment(input: unknown, output: string, mode: 'mock' | 'live', options: { provider?: Phase1aProvider; stopAfterRuns?: number } = {}): Promise<Roster> {
  const plan = ExperimentPlanSchema.parse(input);
  const manifests = mode === 'live' ? compileExperiment(plan).manifests : mockManifests(plan);
  if (mode === 'live' && options.provider) throw new Error('Live provider injection is not supported');
  const endpoints = mode === 'live' ? resolveEndpoints(plan) : [];
  const provider = options.provider ?? (mode === 'mock' ? new DeterministicMockProvider() : new ChatCompletionsProvider(endpoints, plan.timeout_ms));
  const directory = resolve(output);
  if (mode === 'live' && directory !== resolve(plan.data_policy.storage_location!)) throw new Error('Live output directory differs from approved storage location');
  mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
  const lock = join(directory, 'execution.lock');
  const fd = openSync(lock, 'wx', 0o600);
  writeFileSync(fd, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString(), mode, plan_hash: plan.plan_hash }));
  let store: Phase1aSqliteStore | undefined;
  try {
    const rosterPath = join(directory, 'roster.json');
    const manifestsHash = configHash(manifests);
    const roster: Roster = existsSync(rosterPath) ? JSON.parse(readFileSync(rosterPath, 'utf8')) : { plan_hash: plan.plan_hash, mode, manifests_hash: manifestsHash, rows: manifests.map(m => ({ manifest_id: m.manifestId, cell: m.cell, replication: m.replication, run_id: null, status: 'NOT_STARTED', calls: 0 })) };
    if (roster.plan_hash !== plan.plan_hash || roster.mode !== mode || roster.manifests_hash !== manifestsHash || roster.rows.length !== 12 || roster.rows.some((r, i) => r.manifest_id !== manifests[i]?.manifestId)) throw new Error('Output directory belongs to a different plan or roster');
    writePrivateJson(rosterPath, roster);
    writePrivateJson(join(directory, 'plan.json'), plan);
    writePrivateJson(join(directory, 'execution.json'), { mode, scientific_execution: mode === 'live', implementation_hash: plan.implementation_hash, manifests_hash: manifestsHash, endpoints: endpoints.map(({ provider, url }) => ({ provider, url })) });
    store = new Phase1aSqliteStore(join(directory, 'evidence.sqlite'));
    const runtime = new Phase1aRuntime(undefined, store);
    let processed = 0;
    for (const [index, manifest] of manifests.entries()) {
      const row = roster.rows[index]!;
      if (row.run_id) {
        const snapshot = store.latestSnapshot(row.run_id);
        if (!snapshot || configHash(snapshot.bundle.manifest) !== configHash(manifest)) throw new Error('Missing snapshot or changed manifest; no automatic rerun');
        if (hasUnresolvedCall(snapshot.bundle)) throw new Error('In-flight call found after interruption; reconcile before continuing, no automatic duplicate');
        runtime.restoreFromStore(row.run_id);
      } else {
        row.run_id = runtime.createRun(manifest);
        row.status = 'CREATED'; writePrivateJson(rosterPath, roster);
      }
      // Export even terminal failures; never replace a failed workshop automatically.
      try { row.status = await runtime.run(row.run_id, provider); }
      finally {
        const bundle = runtime.exportEvidence(row.run_id);
        row.status = runtime.state(row.run_id); row.calls = bundle.provider_calls.length;
        writePrivateJson(join(directory, `${index + 1}-evidence.json`), bundle);
        const validation = verifyEvidenceBundle(bundle);
        writePrivateJson(join(directory, `${index + 1}-analysis.json`), validation.valid ? analyzeRun(bundle) : { integrity_errors: validation.errors });
        writePrivateJson(rosterPath, roster);
      }
      if (row.status !== 'COMPLETE') break;
      processed++;
      if (options.stopAfterRuns !== undefined && processed >= options.stopAfterRuns) break;
    }
    return roster;
  } finally { store?.close(); closeSync(fd); unlinkSync(lock); }
}
