import { z } from 'zod';

export const DecisionStatusSchema = z.enum(['CONFIRMED', 'PROPOSED', 'OPEN', 'DEFERRED']);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;
const ApprovalLevelSchema = z.enum(['meeting_direction', 'protocol_draft', 'none', 'scientific_freeze']);

export const DecisionRecordSchema = z.object({
  id: z.string().regex(/^D\d{2}$/),
  question: z.string().min(1),
  alternatives: z.array(z.string().min(1)).min(1),
  current_evidence: z.string().min(1),
  status: DecisionStatusSchema,
  required_approver: z.string().min(1),
  approval_level: ApprovalLevelSchema,
  scientific_impact: z.string().min(1),
  engineering_impact: z.string().min(1),
  blocking_effect: z.enum(['none', 'implementation', 'scientific_freeze', 'external_access']),
  decision_date: z.string().nullable(),
  approved_wording: z.string().nullable(),
  source_references: z.array(z.string().min(1)).min(1),
  associated_fields: z.array(z.string().min(1)),
}).strict();
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

const DecisionConsolidationSchema = z.object({
  retired_id: z.string().regex(/^D\d{2}$/),
  canonical_id: z.string().regex(/^D\d{2}$/),
  reason: z.string().min(1),
}).strict();
export type DecisionConsolidation = z.infer<typeof DecisionConsolidationSchema>;

export const DecisionRegisterSchema = z.object({
  schema_version: z.literal('wp01-decision-register-v1'),
  register_id: z.literal('agora-phase1a-pre-freeze-decisions'),
  decisions: z.array(DecisionRecordSchema).length(16),
  consolidation_notes: z.array(DecisionConsolidationSchema).default([]),
}).strict().superRefine((register, ctx) => {
  const ids = register.decisions.map(decision => decision.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['decisions'], message: 'decision IDs must be unique' });
  for (const consolidation of register.consolidation_notes) {
    if (consolidation.retired_id === consolidation.canonical_id) {
      ctx.addIssue({ code: 'custom', path: ['consolidation_notes'], message: 'a decision cannot consolidate itself' });
    }
    if (ids.includes(consolidation.retired_id)) {
      ctx.addIssue({ code: 'custom', path: ['consolidation_notes'], message: `retired decision remains active: ${consolidation.retired_id}` });
    }
    if (!ids.includes(consolidation.canonical_id)) {
      ctx.addIssue({ code: 'custom', path: ['consolidation_notes'], message: `canonical decision is missing: ${consolidation.canonical_id}` });
    }
  }
});
export type DecisionRegister = z.infer<typeof DecisionRegisterSchema>;

const source = [
  'AGORA Phase 1A Technical-Scientific Blueprint, revised October pilot',
  'AGORA Workshop Technical Architecture and Experimental Protocol v0.9',
  'AGORA Phase 1A Technical Implementation Meeting, slides 2-12',
  'WP01 implementation mandate, section 5.2',
];

function decision(
  id: string,
  question: string,
  alternatives: string[],
  status: DecisionStatus,
  required_approver: string,
  scientific_impact: string,
  engineering_impact: string,
  blocking_effect: DecisionRecord['blocking_effect'],
  associated_fields: string[],
  current_evidence = 'Recorded as a pre-freeze item; no silent implementation choice is treated as scientific approval.',
  approval_level: DecisionRecord['approval_level'] = status === 'CONFIRMED' ? 'meeting_direction' : 'none',
): DecisionRecord {
  return { id, question, alternatives, current_evidence, status, required_approver, approval_level, scientific_impact, engineering_impact, blocking_effect, decision_date: null, approved_wording: null, source_references: source, associated_fields };
}

export function createDefaultDecisionRegister(): DecisionRegister {
  return {
    schema_version: 'wp01-decision-register-v1',
    register_id: 'agora-phase1a-pre-freeze-decisions',
    consolidation_notes: [{
      retired_id: 'D17',
      canonical_id: 'D13',
      reason: 'D17 duplicated D13; D13 is the canonical unresolved report-notice/t0 timing question.',
    }],
    decisions: [
      decision('D01', 'Does revised Phase 1A preserve Phase 0 as a closed technical milestone?', ['PRESERVE_PHASE0', 'REOPEN_PHASE0'], 'CONFIRMED', 'research team', 'Prevents historical evidence from being invalidated.', 'Requires additive, versioned contracts.', 'none', ['compatibility.phase0'], 'The mandate explicitly preserves Phase 0 evidence, hashes and semantics.'),
      decision('D02', 'Which exact deployments instantiate GEMMA and GEMINI?', ['APPROVE_DEPLOYMENTS', 'DEFER_DEPLOYMENTS'], 'OPEN', 'scientific and infrastructure owners', 'Determines model provenance and generalizability.', 'Blocks real freeze and live canary configuration.', 'scientific_freeze', ['deployment_bindings']),
      decision('D03', 'Is the four-cell 2x2 design the current pilot structure?', ['FOUR_CELL_2X2', 'ALTERNATIVE_DESIGN'], 'CONFIRMED', 'research team', 'Defines the estimand and condition contrast.', 'Controls manifest generation.', 'none', ['conditions'], 'The revised blueprint and meeting slides describe four conditions with three repetitions.', 'meeting_direction'),
      decision('D04', 'Is the procedural host non-autonomous in the current baseline?', ['DETERMINISTIC_HOST', 'AUTONOMOUS_LLM_MODERATOR'], 'CONFIRMED', 'research team', 'Protects the boundary between protocol execution and behavioral intervention.', 'WP02 must not route procedural choices through a model.', 'none', ['moderator_policy'], 'October implementation meeting direction and the mandate specify no autonomous LLM moderator.', 'meeting_direction'),
      decision('D05', 'What fixed speaking order and seat allocation are used?', ['FIXED_CYCLIC', 'COUNTERBALANCED', 'OTHER'], 'PROPOSED', 'research team', 'Affects exposure order and carryover.', 'WP02 scheduling and run manifests depend on it.', 'scientific_freeze', ['order_policy']),
      decision('D06', 'Which exact prompt wording and versions are approved?', ['CANDIDATE_NAMESPACE', 'APPROVED_REGISTRY'], 'OPEN', 'research team', 'Wording can alter interpretation and interaction.', 'Blocks scientific prompt freeze.', 'scientific_freeze', ['prompt_registry']),
      decision('D07', 'How is Model X instantiated?', ['SELECT_MODEL_X', 'KEEP_UNRESOLVED'], 'OPEN', 'research team', 'Defines a key composition factor.', 'Blocks real C/D campaign bindings.', 'scientific_freeze', ['MODEL_X.deployment']),
      decision('D08', 'How are report writers allocated across report arms?', ['FIXED_WRITER', 'ROTATING_WRITER', 'ALL_PARTICIPANTS'], 'PROPOSED', 'research team', 'May introduce writer-role confounding.', 'Changes report-stage scheduling.', 'scientific_freeze', ['report_policy.writer_allocation']),
      decision('D09', 'What budgets, timeouts, retries and concurrency limits apply?', ['FREEZE_BUDGETS', 'DEFER_TO_CANARY'], 'OPEN', 'engineering and research owners', 'Can affect missingness and exposure comparability.', 'Required by WP02 and provider adapters.', 'scientific_freeze', ['budgets', 'timeouts', 'retries', 'concurrency']),
      decision('D10', 'Is the Wild West condition part of the core campaign?', ['EXCLUDE_CORE', 'INCLUDE_CORE'], 'OPEN', 'research team', 'Changes the estimand and campaign size.', 'Requires a separate condition and analysis contract.', 'scientific_freeze', ['wild_west']),
      decision('D11', 'What behavioral codebook and calibration process are approved?', ['CODEBOOK_PENDING', 'APPROVE_CODEBOOK'], 'PROPOSED', 'research and analysis owners', 'Controls construct interpretation.', 'WP06 consumes the codebook contract.', 'scientific_freeze', ['behavioral_codebook']),
      decision('D12', 'Which replay trials and replay-selection policy are used?', ['NO_REPLAY', 'PREDECLARED_REPLAY'], 'OPEN', 'research and engineering owners', 'Can affect sensitivity analyses and multiplicity.', 'Requires replay inputs from WP03/WP05.', 'scientific_freeze', ['replay_policy']),
      decision('D13', 'Is a report notice delivered before or after t0?', ['REPORT_NOTICE_BEFORE_T0', 'T0_BEFORE_REPORT_NOTICE'], 'OPEN', 'research team', 'Changes what the private baseline measures.', 'Changes agenda manifests and prompt exposure.', 'scientific_freeze', ['report_policy.notice_timing']),
      decision('D14', 'What private-probe contents are approved at t0, t6 and tR?', ['CANDIDATE_PROBES', 'APPROVED_PROBES'], 'OPEN', 'research and analysis owners', 'Defines observability and construct validity.', 'WP04/WP06 require stable probe schemas.', 'scientific_freeze', ['private_probes']),
      decision('D15', 'What authorization constitutes scientific protocol freeze?', ['RESEARCH_SIGNOFF', 'GOVERNANCE_SIGNOFF'], 'OPEN', 'research governance', 'Determines whether claims may be made.', 'Controls transition from draft to frozen manifest.', 'scientific_freeze', ['lifecycle']),
      decision('D16', 'What cross-team reconstruction and replication evidence is required?', ['G8_RECONSTRUCTION', 'MINIMAL_EXPORT'], 'OPEN', 'research and engineering owners', 'Determines auditability of the study.', 'Defines WP05/WP06 handoff and archive.', 'scientific_freeze', ['replication_evidence']),
    ],
  };
}
