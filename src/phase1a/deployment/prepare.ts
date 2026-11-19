/** Materialize a review proposal from observed deployment and restore evidence.
 * Does not add approval records or execute scientific calls.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createExperimentProposal, planHash, readiness, sealCampaign } from '../experiment/plan.js';
import { reviewPrompts, writePrivateJson } from '../experiment/runner.js';
const [deploymentPath, canaryPath, restorePath, output, offMacRestorePath] = process.argv.slice(2);
if (!deploymentPath || !canaryPath || !restorePath || !output) throw new Error('Usage: prepare <deployment.json> <canary.json> <restore.json> <review-directory> [off-mac-restore.json]');
const deployment = JSON.parse(readFileSync(deploymentPath, 'utf8'));
const canary = JSON.parse(readFileSync(canaryPath, 'utf8'));
const evidence = (path: string) => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') });
const plan = createExperimentProposal();
for (const run of plan.campaign.runs) for (const binding of run.bindings) {
  const entry = Object.entries(deployment.models).find(([, value]: [string, any]) => value.family === binding.logical_family);
  if (!entry) throw new Error(`No deployed model for ${binding.logical_family}`);
  const [model, metadata] = entry as [string, any];
  Object.assign(binding, { model_id: model, deployment_id: 'nvidia-mit-critical-data-1-agora-pilot-20261112', revision: metadata.manifest_digest, hosting: 'local', source: 'real' });
  const endpoint = plan.endpoints.find(e => e.provider === binding.provider)!;
  Object.assign(endpoint, { expected_url: 'http://127.0.0.1:18500/v1/chat/completions', deployment_config_hash: canary.deployment_config_hash, expected_model_revision: metadata.manifest_digest });
}
plan.campaign.source_references.push(`Dedicated deployment: ${deploymentPath}; engineering canary: ${canaryPath}`);
plan.campaign.source_references.push('Mateo WhatsApp 2026-11-12 21:09:56 America/Guayaquil; stanza 3EB029CDC143170C32F9F6: receipt and requested changes, explicitly not scientific approval.');
plan.campaign = sealCampaign(plan.campaign);
plan.collection_gate = { policy: 'mateo_reviewed_collection_before_human_coding_v1', calibration: 'two_independent_coders_on_external_material_before_pilot_access', analysis_freeze: 'codebook_and_analysis_rules_before_collection', pilot_access: 'operator_custody_until_calibration_evidence_and_release_log', ...(offMacRestorePath ? {off_mac_restore: evidence(offMacRestorePath)} : {}), reconstruction: 'automated_restore_not_independent_human_attestation', canary: evidence(canaryPath), restore: evidence(restorePath) };
Object.assign(plan.data_policy, {
  storage_location: join(homedir(), '.local/share/agora-pilot', plan.campaign.campaign_id),
  backup_location: 'age-encrypted archives at mit-critical-data-1:/data/PROJECTS/simon/agora-pilot/backups; private age identity on Simon’s Mac and, with Simon’s explicit authorization, denem-server:/home/denem/.config/agora-pilot/backup.identity (0600); recovery uses direct restricted read-only SSH from the VPS to NVIDIA and must pass the pinned off-Mac restore evidence gate',
  retention: 'PROPOSED FOR MATEO: retain raw evidence and encrypted backups for 12 months after collection; review then with Mateo before any deletion. No automatic deletion. Longer retention requires a documented amendment.',
});
Object.assign(plan.decision_proposals, {
  D02: 'Dedicated NVIDIA deployment: Gemma 3 27B Q4_K_M and Qwen3 32B Q4_K_M, pinned aliases and manifest SHA-256 digests in all bindings. Qwen replaces Gemini only in this explicit protocol variant selected by Simon. A/B remain three Gemma instances; C/D use Gemma/Qwen/Llama. Engine Ollama 0.40.16, context 32768, thinking disabled, no input truncation or context shifting; effective options and deployment digest archived per response. Technical canaries attached; scientific acceptability remains Mateo’s decision.',
  D07: 'Use Llama 3.1 8B Instruct Q4_K_M as Model X with the exact attached manifest digest; no Grok or Phi treatment.',
  D09: 'Sequential requests, 120-second timeout, one recorded retry, 62-call and 500000-token stop-before-next-call thresholds per workshop; at most 1024 output tokens. Temperature 0.7, top_p 1, top_k 0, repeat_penalty 1. Shared 32768-token context, thinking false, truncate false, shift false. Unload and release GPU after every call; unavailable GPU returns 429, never commandeered. Unknown usage or completion halts collection. Encrypted backup after stopped campaign, with restoration test; backup failure is an operator error, not a successful launch.',
  D06: 'Review pilot-candidate-3: both reviewers receive the draft only and identical instructions limited to clarity, internal consistency, and reasoning/evidence present in the draft. They must not infer omitted positions, transcript fidelity or resolution of disagreements. Revision is likewise limited to the supplied draft and reviews. Human coders alone assess transcript-to-final-report retention and dissent preservation. Shared instructions and the 2/2/2 round sequence remain unchanged. This implements Mateo’s 2026-11-12 requested change but is not yet approved wording.',
  D11: 'Freeze the exact codebook, definitions, units, missingness, reliability/adjudication rules and descriptive-only analysis under the approved plan/source hashes BEFORE collecting any pilot output. Any substantive amendment requires a new hash and scientific decision; do not tune the codebook to pilot results. Name and calibrate two independent coders on external material BEFORE they see any pilot output, not merely before scoring. Simon retains raw outputs and backups privately until calibration evidence and a dated release record exist. No pilot material may be used for calibration. Original independent ratings remain separate from adjudication. No coders or calibration are claimed complete. Automated integrity/coverage/token accounting may run in operator custody. Transcript-to-report fidelity is assessed only by these human coders.',
  D16: 'PROPOSED OPERATIONAL CHANGE, authorized for submission by Simon on 2026-11-12: accept documented automated encrypted-backup restoration and fresh-process verification of 12 synthetic evidence bundles/330 calls in place of a second human operator’s pre-launch attestation. Off-Mac recovery of those archives must also be demonstrated before collection; Simon authorized a private recovery-key copy on denem-server; direct VPS-to-NVIDIA retrieval, decryption and fresh-process evidence verification must be documented. This is not independent human review. Mateo must explicitly accept this change as part of approving this exact plan.',
});
plan.plan_hash = planHash(plan);
mkdirSync(output, {recursive:true,mode:0o700});
writePrivateJson(join(output,'plan.json'),plan);
writePrivateJson(join(output,'prompt-preview.json'),reviewPrompts(plan));
const {plan: _, ...check} = readiness(plan);
writePrivateJson(join(output,'readiness.json'),check);
console.log(JSON.stringify({plan_hash:plan.plan_hash,...check},null,2));
if (check.blockers.length !== 1 || check.blockers[0] !== 'Missing or stale scientific approval') process.exitCode = 2;
