import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDatabase } from '../src/db/index.js';
import { loadConfigFile } from '../src/config/load.js';
import { campaign, freezeCampaign, runCampaign, starterInput } from '../src/phase1/campaign.js';
import { campaignAnalysis } from '../src/phase1/analysis.js';
import { FUNCTIONAL_ROLES, scientificEvaluationDraft } from '../src/phase1/evaluationContract.js';
import { CANONICAL_PROTOCOL } from '../src/phase1/canonicalContract.js';
import { calibrationAnalysisPlan } from '../src/phase1/scienceContract.js';
import { calibrationManifest } from '../src/phase1/calibration.js';
import { freezeCalibrationInstruments, instrumentManifestHash } from '../src/phase1/instruments.js';
import { recordClosureEvidence } from '../src/phase1/closure.js';
import { executeScientificAnalysis } from '../src/phase1/scientificAnalysis.js';
import { scientificDataset, lockScientificDataset } from '../src/phase1/scientificDataset.js';
import { archiveHandoff, readScienceSnapshot } from '../src/phase1/scienceStore.js';
import { createHumanValidationPackage } from '../src/phase1/reviewWorkspace.js';
import { exportCampaign } from '../src/phase1/export.js';
import { configHash } from '../src/config/hash.js';
import { getInvocations, getMessages, getRun } from '../src/db/queries.js';
import type { ExperimentConfig } from '../src/config/schema.js';

/**
 * Execute the frozen Phase 1A live calibration against the already-running
 * NVIDIA vLLM service. This script never starts, stops or reconfigures the
 * remote service. It creates a ten-block role-only paired campaign, locks the
 * resulting scientific snapshot and creates the blinded human package.
 */

const BASE_CONFIG = 'configs/agora_phase1a_calibration.yaml';
const DEFAULT_BLOCKS = 10;
const REVIEWERS = ['reviewer_a', 'reviewer_b'];

function flag(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function buildInput(blocks: number) {
  const loaded = loadConfigFile(BASE_CONFIG).config;
  const { phase1: _phase1, ...base } = loaded;
  const seed = starterInput(base, true);
  const evaluation = scientificEvaluationDraft();
  evaluation.status = 'reviewed';
  evaluation.questionnaire.version = 'expressed-position-v1';
  const rolePack = {
    id: 'agora-functional-roles',
    version: 'functional-v1',
    title: 'AGORA Functional Deliberative Roles',
    status: 'reviewed' as const,
    common_instruction: 'Discuss the shared topic. Respond to what others actually say, distinguish evidence from uncertainty, and preserve unresolved disagreement.',
    neutral_instruction: 'Discuss the shared topic without an assigned functional role. Give reasons, respond to what others actually say, and preserve uncertainty and disagreement.',
    roles: FUNCTIONAL_ROLES,
    rubric: { version: 'behavioral-v2', instructions: evaluation.interaction_rubric },
    scientific_basis: {
      sources: [
        'AGORA_Phase1_Scientific_Foundation_and_Experimental_Framework.pdf',
        'AGORA_Phase1A_Scientific_Basis_for_Behavioral_Rubric.pdf',
        'AGORA_Phase1A_Statistical_Analysis_Plan_v0.1_revised.pdf',
      ],
      constructs: Object.fromEntries(FUNCTIONAL_ROLES.map(role => [role.id, {
        purpose: role.title,
        theoretical_mapping: 'AGORA functional deliberative construct; source-grounded adaptation, not personality.',
        inclusions: [role.instruction],
        exclusions: ['latent personality, demographic identity or internal belief interpretation'],
        examples: [role.instruction],
      }])),
    },
  };
  return {
    ...seed,
    title: 'AGORA Phase 1A NVIDIA vLLM live calibration',
    protocol_id: 'agora-phase1a',
    protocol_version: 'phase1a-v1',
    purpose: 'calibration' as const,
    canonical: CANONICAL_PROTOCOL,
    base_config: {
      ...base,
      moderator: { ...base.moderator, mode: 'scripted' as const },
      model: { ...base.model, provider: 'nvidia_vllm' as const, model: 'qwen3-32b' },
    },
    role_pack: rolePack,
    evaluation,
    analysis_plan: calibrationAnalysisPlan(),
    blocks,
    limits: { max_provider_calls: 2000, max_reported_tokens: 2_000_000 },
  };
}

function evidence(manifestHash: string, kind: 'protocol_approval' | 'analysis_plan' | 'calibration_report' | 'analysis_report', body: string, related: string[] = []) {
  return { version: 'phase1-closure-evidence-v1' as const, manifest_hash: manifestHash, kind, author: 'AGORA Scientific Administration', title: `Phase 1A ${kind}`, body, related_evidence_hashes: related };
}

function runSummary(db: ReturnType<typeof getDatabase>, campaignId: string) {
  const c = campaign(db, campaignId);
  return c.cases.map(row => {
    const run = row.run_id ? getRun(db, row.run_id) : null;
    const invocations = row.run_id ? getInvocations(db, row.run_id) : [];
    const messages = row.run_id ? getMessages(db, row.run_id) : [];
    return {
      case_id: row.case_id,
      pair_id: c.plan.cases.find(planned => planned.id === row.case_id)?.pair_id ?? null,
      condition: c.plan.cases.find(planned => planned.id === row.case_id)?.condition ?? null,
      run_id: row.run_id,
      state: row.state,
      provider: run?.provider ?? null,
      model: run?.model ?? null,
      config_hash: run?.config_hash ?? c.plan.cases.find(planned => planned.id === row.case_id)?.config_hash ?? null,
      invocations: invocations.length,
      messages: messages.length,
      successful_invocations: invocations.filter(invocation => invocation.outcome === 'success' || invocation.outcome === 'explicit_abstention' || invocation.outcome === 'no_op').length,
      retry_attempts: invocations.filter(invocation => invocation.attempt > 1).length,
      input_tokens: invocations.reduce((sum, invocation) => sum + (invocation.input_tokens ?? 0), 0),
      output_tokens: invocations.reduce((sum, invocation) => sum + (invocation.output_tokens ?? 0), 0),
      mean_latency_ms: invocations.length ? invocations.reduce((sum, invocation) => sum + (invocation.latency_ms ?? 0), 0) / invocations.length : null,
    };
  });
}

async function main(): Promise<void> {
  const blocks = Number(flag('blocks', String(DEFAULT_BLOCKS)));
  if (!Number.isInteger(blocks) || blocks < 10 || blocks % 10 !== 0) throw new Error('Phase 1A live calibration requires a positive multiple of ten blocks for role rotation and AB/BA balance');
  if (process.env.NVIDIA_VLLM_BASE_URL?.trim() === undefined || process.env.NVIDIA_VLLM_API_KEY?.trim() === undefined) throw new Error('BLOCKED_EXTERNAL_LIVE_PROVIDER: set NVIDIA_VLLM_BASE_URL and NVIDIA_VLLM_API_KEY before executing live calibration');
  const outDir = resolve(flag('out', 'data/phase1a_nvidia_vllm_calibration_20260911'));
  mkdirSync(outDir, { recursive: true });
  const input = buildInput(blocks);
  if (input.base_config.model.model !== 'qwen3-32b' || input.base_config.model.provider !== 'nvidia_vllm') throw new Error('Provider provenance contract violated');
  const db = getDatabase();
  const campaignId = freezeCampaign(db, input);
  const frozen = campaign(db, campaignId);
  const protocolReceipt = recordClosureEvidence(db, campaignId, evidence(frozen.row.manifest_hash, 'protocol_approval', 'The frozen Phase 1A protocol, role-only treatment, five-participant topology, canonical S1-S8 stages, scripted moderator, fixed provider parameters and predeclared analysis contract were registered before execution.'));
  const analysisPlanReceipt = recordClosureEvidence(db, campaignId, evidence(frozen.row.manifest_hash, 'analysis_plan', 'The reviewed calibration SAP freezes the paired-block unit, RF primary, ICR key secondary, secondary family, missingness, 10,000-resample paired bootstrap, Holm correction, retry policy and human reliability thresholds before execution.', [protocolReceipt.evidence_hash]));

  await runCampaign(db, campaignId, { allowLive: true });
  const runtime = campaignAnalysis(db, campaignId);
  if (runtime.denominators.completed !== runtime.denominators.planned) throw new Error(`Live calibration did not complete all planned cases: ${runtime.denominators.completed}/${runtime.denominators.planned}`);
  const preview = scientificDataset(db, campaignId);
  const locked = lockScientificDataset(db, campaignId);
  const archive = archiveHandoff(db, locked.id, flag('archive', '/data/AGORA/temporary_artifacts/20260911_phase1a_nvidia_vllm_calibration'));
  const packageReceipt = createHumanValidationPackage(db, locked.snapshot_id, REVIEWERS);
  const analysis = executeScientificAnalysis(db, campaignId, locked.snapshot_id);
  const updated = scientificDataset(db, campaignId);
  const treatment = frozen.plan.cases.find(item => item.condition === 'treatment')!;
  const instruments = freezeCalibrationInstruments({ role_pack: input.role_pack, evaluation: input.evaluation, analysis_plan: input.analysis_plan, protocol: input.canonical });
  const manifest = calibrationManifest(treatment.config, instruments);
  const calibrationReceipt = recordClosureEvidence(db, campaignId, evidence(frozen.row.manifest_hash, 'calibration_report', 'Live NVIDIA vLLM calibration completed under the frozen role-only manifest. The campaign has a locked snapshot and a blinded two-reviewer package. RF, ICR, reliability and precision values remain explicitly pending human annotation; no synthetic value is promoted.', [protocolReceipt.evidence_hash, analysisPlanReceipt.evidence_hash]));
  const analysisReceipt = recordClosureEvidence(db, campaignId, evidence(frozen.row.manifest_hash, 'analysis_report', `Machine analysis snapshot ${analysis.id} was generated from locked dataset ${locked.id}. Annotation-dependent endpoints are unavailable until the frozen human review protocol is executed.`, [calibrationReceipt.evidence_hash]));
  const finalRuntime = campaignAnalysis(db, campaignId);
  const exportPath = exportCampaign(db, campaignId, outDir);
  const report = {
    version: 'agora-phase1a-live-calibration-report-v1',
    status: 'LIVE_EXECUTED_HUMAN_VALIDATION_PENDING',
    campaign_id: campaignId,
    config_hash: frozen.row.manifest_hash,
    provider: { adapter: 'nvidia_vllm', model: 'qwen3-32b', endpoint: process.env.NVIDIA_VLLM_BASE_URL, deployment: process.env.NVIDIA_VLLM_DEPLOYMENT_ID ?? null, api_key_recorded: true },
    campaign_manifest: manifest,
    instrument_manifest_hash: instrumentManifestHash(instruments),
    preregistration: { protocol_approval_hash: protocolReceipt.evidence_hash, analysis_plan_hash: analysisPlanReceipt.evidence_hash },
    post_execution_evidence: { calibration_report_hash: calibrationReceipt.evidence_hash, analysis_report_hash: analysisReceipt.evidence_hash },
    planned_blocks: blocks,
    runtime: { ...finalRuntime.denominators, usage: finalRuntime.usage, p1_gates: finalRuntime.closure.gates },
    runs: runSummary(db, campaignId),
    calibration: {
      machine_observations: { preview_gates: preview.gates, locked_gates: updated.gates, p1_gate_status: finalRuntime.closure.gates },
      rf_distribution: 'PENDING_HUMAN_VALIDATION',
      icr_distribution: 'PENDING_HUMAN_VALIDATION',
      initial_final_variation: 'PENDING_HUMAN_VALIDATION',
      annotation_burden: { package_units: packageReceipt.manifest.unit_count, reviewer_count: REVIEWERS.length },
      infrastructure_contamination: runSummary(db, campaignId).map(run => ({ case_id: run.case_id, retry_attempts: run.retry_attempts, successful_invocations: run.successful_invocations, invocations: run.invocations })),
      precision_and_n: 'PENDING_HUMAN_VALIDATION: RF paired variance requires frozen human labels; no value is imputed.',
    },
    snapshot: { snapshot_id: locked.snapshot_id, content_hash: locked.sha256, state: 'LOCKED', archive_handoff: archive, package_id: packageReceipt.package_id, package_hash: packageReceipt.content_hash },
    analysis: { snapshot_id: analysis.id, content_hash: analysis.hash, readiness: readScienceSnapshot(db, analysis.id).payload.readiness },
    export: { path: exportPath },
    evidence_boundary: 'Live provider execution is real; RF/ICR and reliability are not claimed until independent human annotation, reliability and adjudication are complete.',
  };
  writeFileSync(resolve(outDir, 'calibration_report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  writeFileSync(resolve(outDir, 'campaign_input_hash.json'), `${JSON.stringify({ campaign_id: campaignId, input_hash: configHash(input), config_hash: frozen.row.manifest_hash }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error instanceof Error ? error.stack : String(error)); process.exitCode = 1; });
