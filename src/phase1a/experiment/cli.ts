import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { implementationHash } from './provenance.js';
import { createExperimentProposal, ExperimentPlanSchema, planHash, readiness, sealCampaign } from './plan.js';
import { executeExperiment, reviewPrompts, writePrivateJson } from './runner.js';
const [command, file, output, ...extra] = process.argv.slice(2);
const usage = 'Usage: phase1a:experiment init <directory> | check <plan.json> | seal <plan.json> | preview <plan.json> <directory> | mock <plan.json> <private-directory> | run <plan.json> <private-directory>';
try {
  if (extra.length) throw new Error(usage);
  if (command === 'init' && file && !output) {
    if (existsSync(join(file, 'plan.json'))) throw new Error('Plan already exists; init will not overwrite it');
    mkdirSync(file, { recursive: true, mode: 0o700 });
    const plan = createExperimentProposal();
    writePrivateJson(join(file, 'plan.json'), plan);
    writePrivateJson(join(file, 'prompt-preview.json'), reviewPrompts(plan));
    const { plan: _, ...check } = readiness(plan); writePrivateJson(join(file, 'readiness.json'), check);
    console.log(`Proposal created in ${file}; scientific approval is pending.`);
  } else if (file && ['check', 'seal', 'preview', 'mock', 'run'].includes(command ?? '')) {
    const plan = ExperimentPlanSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
    if (command === 'seal' && !output) { plan.campaign = sealCampaign(plan.campaign); plan.approvals = []; plan.implementation_hash = implementationHash(); plan.plan_hash = planHash(plan); writePrivateJson(file, plan); console.log('Plan hash updated; previous approvals cleared.'); }
    else if (command === 'check' && !output) { const check = readiness(plan); console.log(JSON.stringify({ plan_hash: plan.plan_hash, valid: check.valid, blockers: check.blockers }, null, 2)); if (!check.valid) process.exitCode = 2; }
    else if (command === 'preview' && output) { mkdirSync(output, { recursive: true, mode: 0o700 }); writePrivateJson(join(output, 'prompt-preview.json'), reviewPrompts(plan)); }
    else if (output && (command === 'mock' || command === 'run')) { const roster = await executeExperiment(plan, output, command === 'mock' ? 'mock' : 'live'); console.log(JSON.stringify(roster, null, 2)); if (roster.rows.some(r => r.status !== 'COMPLETE')) process.exitCode = 2; }
    else throw new Error(usage);
  } else throw new Error(usage);
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
