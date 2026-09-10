import { readFileSync } from 'node:fs';
import { loadConfigFile } from '../config/load.js';
import type { Db } from '../db/index.js';
import { campaign, freezeCampaign, planCampaign, previewPrompts, runCampaign, starterInput, linkEvidence, saveDraft } from './campaign.js';
import { campaignAnalysis } from './analysis.js';
import { exportCampaign } from './export.js';
import { annotate } from '../semantic/phase1Annotations.js';

export async function phase1Command(db: Db, args: string[], flags: Record<string, string>): Promise<number> {
  const [command, id] = args;
  const input = () => { if (!flags.input) throw new Error('--input <JSON file> required'); return JSON.parse(readFileSync(flags.input, 'utf8')); };
  const requiredId = () => { if (!id) throw new Error('Campaign ID required'); return id; };
  let result: unknown;
  switch (command) {
    case 'template': result = starterInput(loadConfigFile(flags.config ?? 'configs/agora_phase0_1_context_contract.yaml').config); break;
    case 'plan': { const plan = planCampaign(input()); result = { plan, prompts: previewPrompts(plan) }; break; }
    case 'draft': result = { draft_id: saveDraft(db, input()) }; break;
    case 'freeze': result = { campaign_id: freezeCampaign(db, input()) }; break;
    case 'run': await runCampaign(db, requiredId(), { allowLive: flags.live === 'true', resumeInterrupted: flags.resume === 'true' }); result = campaignAnalysis(db, id!); break;
    case 'show': result = { ...campaign(db, requiredId()), analysis: campaignAnalysis(db, id!) }; break;
    case 'annotate': result = { annotation_id: annotate(db, requiredId(), input()) }; break;
    case 'evidence': {
      if (!flags.run || !['failure_attribution', 'exact_rerun'].includes(flags.purpose ?? '')) throw new Error('--run <id> --purpose exact_rerun|failure_attribution required');
      linkEvidence(db, requiredId(), flags.run, flags.purpose as 'exact_rerun' | 'failure_attribution'); result = { linked: true }; break;
    }
    case 'export': result = { path: exportCampaign(db, requiredId(), flags.out ?? 'exports/phase1') }; break;
    default: throw new Error('Use phase1 template|plan|draft|freeze|run|show|annotate|evidence|export. Plan/draft/freeze/annotate use --input file.json; run requires explicit --live for non-mock providers and --resume for interrupted cases.');
  }
  console.log(JSON.stringify(result, null, 2));
  return command === 'run' && campaign(db, id!).row.state !== 'completed' ? 1 : 0;
}
