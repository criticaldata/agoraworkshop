import { readFileSync } from 'node:fs';
import { loadConfigFile } from '../config/load.js';
import type { Db } from '../db/index.js';
import { campaign, freezeCampaign, planCampaign, previewPrompts, runCampaign, starterInput, linkEvidence, saveDraft } from './campaign.js';
import { campaignAnalysis } from './analysis.js';
import { exportCampaign } from './export.js';
import { annotate } from '../semantic/phase1Annotations.js';

import { recordClosureEvidence } from './closure.js';
import { scientificDataset, lockScientificDataset } from './scientificDataset.js';
import { executeScientificAnalysis } from './scientificAnalysis.js';
import { scienceSnapshots, readScienceSnapshot } from './scienceStore.js';
import { analysisPlanDraft } from './scienceContract.js';
import { scientificEvaluationDraft } from './evaluationContract.js';
import { reviewArtifact } from './artifactReview.js';
import { calibrationManifest, launchInstructions, providerReadiness } from './calibration.js';

export async function phase1Command(db: Db, args: string[], flags: Record<string, string>): Promise<number> {
  const [command, id] = args;
  const input = () => { if (!flags.input) throw new Error('--input <JSON file> required'); return JSON.parse(readFileSync(flags.input, 'utf8')); };
  const requiredId = () => { if (!id) throw new Error('Campaign ID required'); return id; };
  let result: unknown;
  switch (command) {
    case 'calibration-manifest': {
      const frozen = loadConfigFile(flags.config ?? 'configs/agora_phase1a_calibration.yaml');
      result = calibrationManifest(frozen.config); break;
    }
    case 'calibration-ready': {
      const frozen = loadConfigFile(flags.config ?? 'configs/agora_phase1a_calibration.yaml');
      const manifest = calibrationManifest(frozen.config); result = { state: providerReadiness(manifest), manifest_hash: manifest.config_hash, launch: launchInstructions(manifest) }; break;
    }
    case 'calibration-launch': {
      const frozen = loadConfigFile(flags.config ?? 'configs/agora_phase1a_calibration.yaml');
      const manifest = calibrationManifest(frozen.config), state = providerReadiness(manifest);
      if (state !== 'AVAILABLE') throw new Error('BLOCKED_EXTERNAL_LIVE_PROVIDER: live calibration launch requires NVIDIA_VLLM_BASE_URL and NVIDIA_VLLM_API_KEY');
      result = { state, launch: launchInstructions(manifest), note: 'Preflight and the linked baseline/rerun/fault campaign must be executed under this manifest; no results are synthesized by this command.' }; break;
    }
    case 'science-template': result = { ...starterInput(loadConfigFile(flags.config ?? 'configs/agora_phase0_1_context_contract.yaml').config, true), evaluation: scientificEvaluationDraft(), analysis_plan: analysisPlanDraft() }; break;
    case 'science': result = { preview: scientificDataset(db, requiredId()), snapshots: scienceSnapshots(db, id!) }; break;
    case 'lock-dataset': result = lockScientificDataset(db, requiredId()); break;
    case 'analyze': if (!flags.dataset) throw new Error('--dataset <locked snapshot ID> required'); result = executeScientificAnalysis(db, requiredId(), flags.dataset); break;
    case 'snapshot': result = readScienceSnapshot(db, requiredId()); break;
    case 'template': result = starterInput(loadConfigFile(flags.config ?? 'configs/agora_phase0_1_context_contract.yaml').config, flags.legacy !== 'true'); break;
    case 'plan': { const plan = planCampaign(input()); result = { plan, prompts: previewPrompts(plan) }; break; }
    case 'draft': result = { draft_id: saveDraft(db, input()) }; break;
    case 'freeze': result = { campaign_id: freezeCampaign(db, input()) }; break;
    case 'run': await runCampaign(db, requiredId(), { allowLive: flags.live === 'true', resumeInterrupted: flags.resume === 'true' }); result = campaignAnalysis(db, id!); break;
    case 'show': result = { ...campaign(db, requiredId()), analysis: campaignAnalysis(db, id!) }; break;
    case 'annotate': result = { annotation_id: annotate(db, requiredId(), input()) }; break;
    case 'review-artifact': result = { review_id: reviewArtifact(db, requiredId(), input()) }; break;
    case 'closure-evidence': result = recordClosureEvidence(db, requiredId(), input()); break;
    case 'evidence': {
      if (!flags.run || !['failure_attribution', 'exact_rerun'].includes(flags.purpose ?? '')) throw new Error('--run <id> --purpose exact_rerun|failure_attribution required');
      linkEvidence(db, requiredId(), flags.run, flags.purpose as 'exact_rerun' | 'failure_attribution'); result = { linked: true }; break;
    }
    case 'export': result = { path: exportCampaign(db, requiredId(), flags.out ?? 'exports/phase1') }; break;
    default: throw new Error('Use phase1 calibration-manifest|calibration-ready|calibration-launch|template|science-template|plan|draft|freeze|run|show|annotate|review-artifact|evidence|closure-evidence|science|lock-dataset|analyze|snapshot|export. analyze requires --dataset ID. Plan/draft/freeze/annotate/review-artifact/closure-evidence use --input file.json; run requires explicit --live for non-mock providers and --resume for interrupted cases. Template defaults to canonical; --legacy true retains the earlier protocol.');
  }
  console.log(JSON.stringify(result, null, 2));
  return command === 'run' && campaign(db, id!).row.state !== 'completed' ? 1 : 0;
}
