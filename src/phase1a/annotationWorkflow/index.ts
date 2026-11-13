import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { configHash } from '../../config/hash.js';
import { ExperimentPlanSchema, planHash, sealCampaign } from '../experiment/plan.js';
import { adaptWp01Run } from '../wp02/adapter.js';
import type { EvidenceBundle } from '../index.js';
import { analyzeRun } from '../wp06/index.js';
import { analyzeReportAnnotations, ReportAnnotationsSchema } from '../wp06/annotations.js';
import { REPORT_CODEBOOK, REPORT_CODEBOOK_HASH } from '../wp06/codebook.js';

const Id = z.string().trim().min(1);
const Hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const DateTime = z.string().datetime({ offset: true });
const Ref = z.object({ path: Id, sha256: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
export const ReleaseSchema = z.object({
  schema_version: z.literal('agora-annotation-release-v1'),
  status: z.literal('RELEASE_AUTHORIZED'),
  approved_plan_hash: Hash, codebook_hash: Hash, operator: Id,
  external_materials: z.array(z.object({ id: Id, source_ref: Id, origin: z.literal('external_not_pilot'), evidence: Ref }).strict()).min(1),
  coders: z.array(z.object({ coder_id: Id, calibration_completed_at: DateTime, calibration_evidence_ref: Ref,
    no_prior_pilot_access_attestation_ref: Ref, first_pilot_access_at: DateTime.nullable() }).strict()).min(2),
  original_ratings_ref: Ref, calibration_disagreements_and_resolution_ref: Ref,
  scientific_acceptance_of_calibration_ref: Ref,
  protocol_deviations: z.array(Id), release_authorized_by: Id, released_at: DateTime,
  released_artifacts: z.array(z.object({ run_id: Id, evidence_hash: Hash }).strict()).min(1),
}).strict();
export type AnnotationRelease = z.infer<typeof ReleaseSchema>;

export function releaseTemplate(planInput: unknown) {
  const plan = ExperimentPlanSchema.parse(planInput);
  return {
    schema_version: 'agora-annotation-release-v1', status: 'TEMPLATE_NOT_COMPLETED',
    approved_plan_hash: plan.plan_hash, codebook_hash: plan.analysis.codebook_hash, operator: plan.data_policy.operator,
    external_materials: [],
    coders: [0, 1].map(() => ({ coder_id: null, calibration_completed_at: null, calibration_evidence_ref: null, no_prior_pilot_access_attestation_ref: null, first_pilot_access_at: null })),
    original_ratings_ref: null, calibration_disagreements_and_resolution_ref: null, scientific_acceptance_of_calibration_ref: null,
    protocol_deviations: [], release_authorized_by: null, released_at: null, released_artifacts: [],
  };
}

/** Audit documentary evidence; does not authenticate human attestations or grant access. */
export function checkRelease(planInput: unknown, recordInput: unknown, baseDirectory: string, now = new Date()) {
  const blockers: string[] = [];
  const parsedPlan = ExperimentPlanSchema.safeParse(planInput);
  const parsedRecord = ReleaseSchema.safeParse(recordInput);
  if (!parsedPlan.success) blockers.push('Invalid archived plan');
  if (!parsedRecord.success) blockers.push(...parsedRecord.error.issues.map(i => `Incomplete release: ${i.path.join('.')}: ${i.message}`));
  if (!parsedPlan.success || !parsedRecord.success) return { valid: false, blockers };
  const plan = parsedPlan.data, record = parsedRecord.data;
  if (plan.plan_hash !== planHash(plan) || record.approved_plan_hash !== plan.plan_hash) blockers.push('Plan hash mismatch');
  if (configHash(plan.analysis.codebook) !== REPORT_CODEBOOK_HASH || record.codebook_hash !== REPORT_CODEBOOK_HASH) blockers.push('Codebook hash mismatch');
  const approval = plan.approvals.find(a => a.role === 'scientific' && a.reviewer === plan.scientific_reviewer && a.plan_hash === plan.plan_hash);
  if (!approval) blockers.push('Missing scientific approval of the archived plan');
  const released = Date.parse(record.released_at);
  if (released > now.getTime() || (approval && released < Date.parse(approval.approved_at))) blockers.push('Release must follow approval and cannot be future-dated');
  if (record.operator !== plan.data_policy.operator || record.release_authorized_by !== record.operator) blockers.push('Release must be authorized by the designated operator');
  const coderIds = record.coders.map(c => c.coder_id);
  if (new Set(coderIds).size !== coderIds.length) blockers.push('Duplicate coder identity');
  if (new Set(record.external_materials.map(m => m.id)).size !== record.external_materials.length) blockers.push('Duplicate external material identity');
  if (new Set(record.released_artifacts.map(a => a.run_id)).size !== record.released_artifacts.length) blockers.push('Duplicate released run');
  if (record.protocol_deviations.length) blockers.push('Disclosed deviations require scientific resolution before this release workflow');
  for (const coder of record.coders) {
    if (Date.parse(coder.calibration_completed_at) > released) blockers.push(`Calibration after release: ${coder.coder_id}`);
    if (coder.first_pilot_access_at !== null && (Date.parse(coder.first_pilot_access_at) < released || Date.parse(coder.first_pilot_access_at) > now.getTime())) blockers.push(`Invalid first pilot access time: ${coder.coder_id}`);
  }
  const refs = [
    ...record.external_materials.map(m => m.evidence),
    ...record.coders.flatMap(c => [c.calibration_evidence_ref, c.no_prior_pilot_access_attestation_ref]),
    record.original_ratings_ref, record.calibration_disagreements_and_resolution_ref, record.scientific_acceptance_of_calibration_ref,
  ];
  for (const ref of refs) {
    try {
      const bytes = readFileSync(resolve(baseDirectory, ref.path));
      if (!bytes.length || createHash('sha256').update(bytes).digest('hex') !== ref.sha256) blockers.push(`Changed or empty calibration evidence: ${ref.path}`);
    } catch { blockers.push(`Missing calibration evidence: ${ref.path}`); }
  }
  return { valid: blockers.length === 0, blockers };
}

function admitted(planInput: unknown, recordInput: unknown, bundle: EvidenceBundle, base: string) {
  const check = checkRelease(planInput, recordInput, base);
  if (!check.valid) throw new Error(check.blockers.join('; '));
  const plan = ExperimentPlanSchema.parse(planInput), record = ReleaseSchema.parse(recordInput);
  const run = analyzeRun(bundle);
  if (bundle.manifest.source.admissionClass !== 'scientific') throw new Error('Engineering/fixture evidence is not a scientific annotation release');
  const declared = plan.campaign.runs.find(r => r.run_id === bundle.manifest.manifestId);
  if (!declared || declared.condition_id !== bundle.manifest.cell || declared.replicate !== bundle.manifest.replication) throw new Error('Run is outside the reviewed campaign');
  // Reconstruct the frozen manifest from the archived decision, not the current
  // collection checkout/source hash. This must match compileExperiment's contract.
  // It is used only for comparison; this module never creates or executes a run.
  const approval = plan.approvals.find(a => a.role === 'scientific' && a.reviewer === plan.scientific_reviewer && a.plan_hash === plan.plan_hash)!;
  let campaign = structuredClone(plan.campaign);
  campaign.profile = 'scientific'; campaign.lifecycle = 'FROZEN'; campaign.freeze_status = 'FROZEN'; campaign.study_contract.lifecycle = 'FROZEN';
  for (const decision of campaign.decision_register.decisions.filter(d => d.blocking_effect === 'scientific_freeze')) {
    decision.status = 'CONFIRMED'; decision.approval_level = 'scientific_freeze'; decision.decision_date = approval.approved_at;
    decision.approved_wording = plan.decision_proposals[decision.id]!;
    decision.current_evidence = `Approved by ${approval.reviewer}; plan ${plan.plan_hash}; ${approval.evidence_ref}`;
    decision.source_references.push(approval.evidence_ref);
  }
  campaign.source_references.push(`Approved experiment plan: ${plan.plan_hash}`);
  campaign = sealCampaign(campaign);
  const expected = adaptWp01Run(campaign, declared.run_id, { admissionClass: 'scientific', topic: plan.topic, limits: plan.limits, approvedAt: approval.approved_at });
  if (configHash(expected) !== configHash(bundle.manifest)) throw new Error('Evidence manifest differs from the reviewed plan');
  if (!record.released_artifacts.some(a => a.run_id === run.run_id && a.evidence_hash === run.evidence_hash)) throw new Error('Evidence is not included in the release record');
  return { plan, record, run };
}

/** Only committed public turns and the successful final report are reader-visible. */
export function coderPacket(planInput: unknown, recordInput: unknown, bundle: EvidenceBundle, inventoryInput: unknown, coderId: string, base: string) {
  const { record, run } = admitted(planInput, recordInput, bundle, base);
  if (!record.coders.some(c => c.coder_id === coderId)) throw new Error('Coder is not authorized for this release');
  const inventory = ReportAnnotationsSchema.parse(inventoryInput);
  if (inventory.ratings.length || inventory.adjudications.length) throw new Error('Packets require a blank-rating inventory; never share another coder’s ratings');
  if (JSON.stringify([...inventory.coder_ids].sort()) !== JSON.stringify(record.coders.map(c => c.coder_id).sort())) throw new Error('Inventory coders differ from the release record');
  analyzeReportAnnotations(bundle, inventory);
  const artifacts = new Map(bundle.artifacts.map(a => [a.artifact_id, a]));
  const publicRows = run.opportunities.filter(row => row.stage === 'PUBLIC');
  const final = run.opportunities.find(row => row.opportunity_id === 'report:revised' && row.status === 'committed' && row.outcome === 'success');
  const view = (id: string) => { const a = artifacts.get(id)!; return { artifact_id: a.artifact_id, content: a.content }; };
  const packet = {
    schema_version: 'agora-coder-packet-v1', coder_id: coderId, run_id: run.run_id, evidence_hash: run.evidence_hash,
    approved_plan_hash: record.approved_plan_hash, release_record_hash: configHash(record), codebook: REPORT_CODEBOOK,
    codebook_hash: REPORT_CODEBOOK_HASH, inventory_status: inventory.inventory_status, propositions: inventory.propositions,
    public_opportunities: publicRows.map(row => ({ opportunity_id: row.opportunity_id, participant_id: row.participant_id, status: row.status, outcome: row.outcome,
      artifact: row.status === 'committed' && row.output_artifact_id ? view(row.output_artifact_id) : null })),
    final_report: final?.output_artifact_id ? view(final.output_artifact_id) : null,
    instructions: ['Use the same human-authored proposition inventory for both coders; report inventory issues to the operator before rating.',
      'Work independently. Do not consult another coder’s ratings. Use exact artifact IDs and JavaScript UTF-16 offsets.',
      'Missing evidence is not absent behavior. Keep NOT_ASSESSABLE and unresolved judgments explicit.',
      'This packet is not a raw archive: private checkpoints, draft/reviews, prompts and provider responses are excluded.'],
    response_template: { coder_id: coderId, run_id: run.run_id, evidence_hash: run.evidence_hash, codebook_hash: REPORT_CODEBOOK_HASH, inventory_hash: configHash(inventory.propositions), ratings: [] },
  };
  return { ...packet, packet_hash: configHash(packet) };
}

/** Existing WP06 definitions and reliability calculations are used without changes. */
export function checkAnnotations(plan: unknown, recordInput: unknown, bundle: EvidenceBundle, annotationsInput: unknown, base: string) {
  const { record } = admitted(plan, recordInput, bundle, base);
  const data = ReportAnnotationsSchema.parse(annotationsInput);
  const expected = record.coders.map(c => c.coder_id).sort();
  if (JSON.stringify([...data.coder_ids].sort()) !== JSON.stringify(expected)) throw new Error('Annotation coders differ from the release record');
  return { release_record_hash: configHash(record), approved_plan_hash: record.approved_plan_hash, analysis: analyzeReportAnnotations(bundle, data) };
}
