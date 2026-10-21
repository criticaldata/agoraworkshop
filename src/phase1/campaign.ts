import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { ExperimentConfigSchema, type ExperimentConfig } from '../config/schema.js';
import { freezeConfig } from '../config/load.js';
import { canonicalize, configHash } from '../config/hash.js';
import { RolePackSchema, STARTER_ROLES } from './contracts.js';
import { participantSystemPrompt, moderatorSystemPrompt } from '../prompts/registry.js';
import { codeProvenance } from '../core/provenance.js';
import { WorkshopRunner } from '../orchestrator/runner.js';
import { reconcileInterruptedRuns } from '../orchestrator/reconcile.js';
import { buildProvider } from '../providers/registry.js';
import { failureResult } from '../providers/types.js';
import { getRun } from '../db/queries.js';
import { previewInstructions } from './preview.js';
import { DRAFT_EVALUATION, EvaluationSchema, FUNCTIONAL_ROLES } from './evaluationContract.js';
import { positionPromptPreview } from './positions.js';
import { CanonicalProtocolSchema, CANONICAL_PROTOCOL } from './canonicalContract.js';
import { ballotInstruction } from './collective.js';
import { resolvedScriptedModeratorLine } from '../providers/scriptedModerator.js';
import { plannedStates } from '../orchestrator/stateMachine.js';
import { AnalysisPlanSchema } from './scienceContract.js';
import { assertCampaignUnlocked } from './scienceStore.js';

export const PlanInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  protocol_id: z.string().min(1).max(200), protocol_version: z.string().min(1).max(100),
  purpose: z.enum(['engineering', 'pilot']),
  base_config: ExperimentConfigSchema,
  role_pack: RolePackSchema,
  evaluation: EvaluationSchema.optional(),
  canonical: CanonicalProtocolSchema.optional(),
  analysis_plan: AnalysisPlanSchema.optional(),
  blocks: z.number().int().min(1).max(50),
  opening_message: z.string().trim().min(1).max(12000),
  limits: z.object({ max_provider_calls: z.number().int().positive().max(100000), max_reported_tokens: z.number().int().positive() }).strict(),
}).strict();
export type PlanInput = z.infer<typeof PlanInputSchema>;
export interface PlannedCase {
  id: string; pair_id: string; order: number; block: number;
  condition: 'control' | 'treatment';
  targets: Record<string, string>;
  config: ExperimentConfig; config_hash: string;
  fixed_hash: string;
}
export interface Plan {
  version: 'phase1a-campaign-v1'; input: PlanInput;
  cases: PlannedCase[]; comparisons: ReturnType<typeof compareConditions>[];
  role_hashes: Record<string, string>;
  workload: { planned_cases: number; maximum_attempts: number; position_probe_attempts?: number; ballot_attempts?: number; token_limit_semantics: string };
}
export interface CampaignRow {
  id: string; title: string; state: string; manifest_json: string; manifest_hash: string;
  created_at: string; owner_pid: number | null; owner_host: string | null;
}
export interface CaseRow { campaign_id: string; case_id: string; ordinal: number; state: string; run_id: string | null; error: string | null; }

export function initializePhase1(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS phase1_drafts (id TEXT PRIMARY KEY, input_json TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS phase1_campaigns (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, state TEXT NOT NULL,
      manifest_json TEXT NOT NULL, manifest_hash TEXT NOT NULL, created_at TEXT NOT NULL,
      owner_pid INTEGER, owner_host TEXT);
    CREATE TABLE IF NOT EXISTS phase1_cases (
      campaign_id TEXT NOT NULL REFERENCES phase1_campaigns(id), case_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL, state TEXT NOT NULL, run_id TEXT UNIQUE REFERENCES runs(run_id), error TEXT,
      PRIMARY KEY(campaign_id, case_id));
    CREATE TABLE IF NOT EXISTS phase1_usage (
      invocation_id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES phase1_campaigns(id),
      run_id TEXT NOT NULL REFERENCES runs(run_id), tokens INTEGER, completed INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS phase1_evidence (
      campaign_id TEXT NOT NULL REFERENCES phase1_campaigns(id), run_id TEXT NOT NULL REFERENCES runs(run_id),
      purpose TEXT NOT NULL, PRIMARY KEY(campaign_id, run_id, purpose));
    CREATE TABLE IF NOT EXISTS phase1_annotations (
      id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL REFERENCES phase1_campaigns(id),
      run_id TEXT NOT NULL REFERENCES runs(run_id), message_id TEXT NOT NULL REFERENCES messages(message_id),
      author TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
}

function differences(a: unknown, b: unknown, path = ''): string[] {
  if (canonicalize(a) === canonicalize(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const aa = a as Record<string, unknown>, bb = b as Record<string, unknown>;
    return [...new Set([...Object.keys(aa), ...Object.keys(bb)])].sort().flatMap(k => differences(aa[k] ?? null, bb[k] ?? null, path ? `${path}.${k}` : k));
  }
  return [path];
}

function fixedSettings(config: ExperimentConfig): unknown {
  const copy = structuredClone(config);
  if (!copy.phase1) throw new Error('Phase 1 contract missing');
  const { condition: _condition, assignments: _assignments, ...fixed } = copy.phase1;
  return { ...copy, phase1: fixed };
}

export function compareConditions(control: ExperimentConfig, treatment: ExperimentConfig) {
  const paths = differences(control, treatment);
  const treatmentPaths = new Set(['phase1.condition', ...control.participants.flatMap(p => [`phase1.assignments.${p.id}.instruction`, `phase1.assignments.${p.id}.role_id`])]);
  const allowed = paths.filter(p => treatmentPaths.has(p));
  const disallowed = paths.filter(p => !allowed.includes(p));
  const fixed_hash = configHash(fixedSettings(control));
  return { valid: control.phase1?.condition === 'control' && treatment.phase1?.condition === 'treatment' && disallowed.length === 0 && fixed_hash === configHash(fixedSettings(treatment)), allowed, disallowed, fixed_hash, control_hash: configHash(control), treatment_hash: configHash(treatment) };
}

export function planCampaign(raw: unknown): Plan {
  const input = PlanInputSchema.parse(raw);
  const base = input.base_config;
  if (input.analysis_plan && (!input.canonical || input.evaluation?.version !== 'behavioral-v2')) throw new Error('Analysis plans require canonical stages and behavioral-v2');
  if (input.evaluation && [...input.evaluation.primary_outcomes, ...(input.evaluation.secondary_outcomes ?? []), ...(input.evaluation.exploratory_outcomes ?? [])].includes('final_output_quality') && !input.analysis_plan?.artifact_rubric) throw new Error('Human final-output quality requires an explicit frozen artifact rubric');
  if (input.analysis_plan?.purpose === 'confirmatory' && (input.evaluation?.status !== 'reviewed' || input.role_pack.status !== 'reviewed')) throw new Error('Confirmatory instruments must be reviewed before freezing');
  if (input.evaluation && JSON.stringify(Object.keys(input.evaluation.role_criteria).sort()) !== JSON.stringify(input.role_pack.roles.map(r => r.id).sort())) throw new Error('Evaluation criteria must cover exactly the five role IDs');
  if (base.participants.length !== 5) throw new Error('Phase 1A requires five participants');
  if (base.phase1) throw new Error('Select a base configuration without a phase1 block');
  if (base.fault_injection?.enabled) throw new Error('Fault conditions belong to explicitly linked engineering controls, not behavioural cases');
  if (base.capabilities.tools_enabled || base.capabilities.manifest.length || base.tool_probe?.enabled) throw new Error('Phase 1A keeps tools disabled');
  const cases: PlannedCase[] = [];
  const comparisons: Plan['comparisons'] = [];
  for (let block = 0; block < input.blocks; block++) {
    const targets = Object.fromEntries(base.participants.map((p, i) => [p.id, input.role_pack.roles[(i + block) % 5]!.id]));
    const pair: PlannedCase[] = [];
    for (const condition of ['control', 'treatment'] as const) {
      const config = freezeConfig({ ...base,
        prompts: { ...base.prompts, participant_prompt_version: 'phase1a-v1' },
        phase1: { phase: '1A', protocol_id: input.protocol_id, protocol_version: input.protocol_version,
          condition, common_instruction: input.role_pack.common_instruction, opening_message: input.opening_message,
          ...(input.evaluation ? { evaluation: input.evaluation } : {}),
          ...(input.canonical ? { canonical: input.canonical } : {}),
          assignments: Object.fromEntries(base.participants.map(p => {
            const role = input.role_pack.roles.find(r => r.id === targets[p.id])!;
            return [p.id, condition === 'control' ? { role_id: 'neutral', instruction: input.role_pack.neutral_instruction } : { role_id: role.id, instruction: role.instruction }];
          })),
        },
      });
      moderatorSystemPrompt(config.config);
      for (const participant of config.config.participants) participantSystemPrompt(config.config, participant.id);
      pair.push({ id: `block-${block + 1}-${condition}`, pair_id: `block-${block + 1}`, order: 0, block: block + 1, condition, targets, config: config.config, config_hash: config.hash, fixed_hash: configHash(fixedSettings(config.config)) });
    }
    comparisons.push(compareConditions(pair[0]!.config, pair[1]!.config));
    // Deterministic cyclic role assignment; AB/BA order is balanced across blocks.
    if (block % 2) pair.reverse();
    for (const entry of pair) { entry.order = cases.length; cases.push(entry); }
  }
  if (comparisons.some(c => !c.valid)) throw new Error('Control/treatment settings are not comparable');
  return {
    version: 'phase1a-campaign-v1', input, cases, comparisons,
    role_hashes: Object.fromEntries(input.role_pack.roles.map(r => [r.id, configHash(r.instruction)])),
    workload: { planned_cases: cases.length,
      ...(input.evaluation ? { position_probe_attempts: cases.length * 10 } : {}),
      ...(input.canonical ? { ballot_attempts: cases.length * 5 } : {}),
      maximum_attempts: cases.length * base.budgets.max_calls_per_agent * 6 * (base.runtime.max_retries + 1),
      token_limit_semantics: 'Stop before the next provider call once reported tokens reach the threshold. One in-flight response can cross it. Missing usage stops further calls; this is not a guaranteed monetary ceiling.',
    },
  };
}

export function starterInput(base: ExperimentConfig, canonical = false): PlanInput {
  base = structuredClone(base);
  if (canonical) base.workshop.rounds = { introduction: 0, public_discussion: Math.max(1, base.workshop.rounds.public_discussion), private_or_breakout: Math.max(1, base.workshop.rounds.private_or_breakout), final_discussion: Math.max(1, base.workshop.rounds.final_discussion) };
  return { title: 'Reimagining Humans: role pilot', protocol_id: 'reimagining-humans-1a', protocol_version: canonical ? 'canonical-draft-1' : 'draft-1', purpose: 'engineering',
    ...(canonical ? { canonical: structuredClone(CANONICAL_PROTOCOL) } : {}),
    base_config: { ...base, moderator: { ...base.moderator, mode: 'scripted' }, workshop: { ...base.workshop, topic: 'How might humans evolve to coexist better with agents and the living world?' } },
    role_pack: { ...structuredClone(STARTER_ROLES), id: 'reimagining-humans-functional', version: 'functional-draft-1', title: 'Functional roles (proposed)', roles: structuredClone(FUNCTIONAL_ROLES), rubric: { version: 'functional-draft-1', instructions: DRAFT_EVALUATION.interaction_rubric } },
    evaluation: structuredClone(DRAFT_EVALUATION), blocks: 10,
    opening_message: 'Welcome to Reimagining Humans. Discuss how humans might evolve to coexist better with agents and the living world. Give reasons and distinguish evidence from uncertainty.',
    limits: { max_provider_calls: 2000, max_reported_tokens: 2000000 },
  };
}

export function previewPrompts(plan: Plan) {
  return plan.cases.map(c => ({ case_id: c.id, config_hash: c.config_hash,
    participants: c.config.participants.map(p => ({ agent_id: p.id, ...participantSystemPrompt(c.config, p.id) })),
    moderator: moderatorSystemPrompt(c.config), opening_message: c.config.phase1!.opening_message,
    turn_instructions: previewInstructions(c.config),
    ...(c.config.phase1?.evaluation ? { position_probes: positionPromptPreview(c.config) } : {}),
    ...(c.config.phase1?.canonical ? { canonical: c.config.phase1.canonical,
      moderator_script: plannedStates(c.config.workshop.rounds, true).map(state => ({ state, text: resolvedScriptedModeratorLine(state, c.config.phase1!.opening_message, true) })),
      ballot_instruction: ballotInstruction(c.config), ballot_context: 'Same authorized dialogue snapshot for all ballots; no assessment answers, ballots or collective outcome included. S6 must be fully valid first. S8 makes no provider call.' } : {}),
  }));
}

export function saveDraft(db: Db, raw: unknown): string {
  initializePhase1(db);
  const input = PlanInputSchema.parse(raw), id = `draft_${randomUUID()}`;
  // Immutable revisions: saving edits creates a new draft; frozen snapshots never change.
  db.prepare('INSERT INTO phase1_drafts VALUES (?, ?, ?)').run(id, JSON.stringify(input), new Date().toISOString());
  return id;
}

export function freezeCampaign(db: Db, raw: unknown): string {
  initializePhase1(db);
  const plan = planCampaign(raw), id = `campaign_${randomUUID()}`;
  db.transaction(() => {
    const prior = db.prepare('SELECT manifest_json FROM phase1_campaigns').all() as { manifest_json: string }[];
    for (const row of prior) {
      const previous = (JSON.parse(row.manifest_json) as Plan).input, next = plan.input;
      const pack = previous.role_pack;
      if (pack.id === plan.input.role_pack.id && pack.version === plan.input.role_pack.version && configHash(pack) !== configHash(plan.input.role_pack)) throw new Error('This role-pack ID/version is already frozen with different text. Increment the version before freezing edits.');
      if (previous.evaluation?.version === 'behavioral-v2' && next.evaluation?.version === 'behavioral-v2') {
        const before = previous.evaluation, after = next.evaluation;
        if (before.questionnaire.id === after.questionnaire.id && before.questionnaire.version === after.questionnaire.version && configHash(before.questionnaire) !== configHash(after.questionnaire)) throw new Error('This questionnaire ID/version is already frozen with different content. Increment the questionnaire version.');
        if (pack.id === next.role_pack.id && pack.rubric.version === next.role_pack.rubric.version && configHash({ criteria: before.role_criteria, interaction: before.interaction_rubric }) !== configHash({ criteria: after.role_criteria, interaction: after.interaction_rubric })) throw new Error('This behavioral rubric version is already frozen with different content. Increment the rubric and role-pack versions.');
      }
      if (previous.analysis_plan && next.analysis_plan && previous.analysis_plan.id === next.analysis_plan.id) {
        if (previous.analysis_plan.revision === next.analysis_plan.revision && configHash(previous.analysis_plan) !== configHash(next.analysis_plan)) throw new Error('This analysis-plan ID/revision is already frozen with different content. Increment the analysis-plan revision.');
        const before = previous.analysis_plan.artifact_rubric, after = next.analysis_plan.artifact_rubric;
        if (before && after && before.version === after.version && configHash(before) !== configHash(after)) throw new Error('This artifact rubric version is already frozen with different content. Increment the artifact rubric version.');
      }
    }
    db.prepare('INSERT INTO phase1_campaigns VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)').run(id, plan.input.title, 'frozen', canonicalize(plan), configHash(plan), new Date().toISOString());
    for (const c of plan.cases) db.prepare('INSERT INTO phase1_cases VALUES (?, ?, ?, ?, NULL, NULL)').run(id, c.id, c.order, 'pending');
  }).immediate();
  return id;
}

export function campaign(db: Db, id: string): { row: CampaignRow; plan: Plan; cases: CaseRow[] } {
  initializePhase1(db);
  const row = db.prepare('SELECT * FROM phase1_campaigns WHERE id = ?').get(id) as CampaignRow | undefined;
  if (!row) throw new Error('Campaign not found');
  const plan = JSON.parse(row.manifest_json) as Plan;
  if (configHash(plan) !== row.manifest_hash || configHash(planCampaign(plan.input)) !== row.manifest_hash) throw new Error('Frozen campaign integrity check failed');
  return { row, plan, cases: db.prepare('SELECT * FROM phase1_cases WHERE campaign_id = ? ORDER BY ordinal').all(id) as CaseRow[] };
}

const active = new Set<string>();
function claim(db: Db, id: string): void {
  db.transaction(() => {
    assertCampaignUnlocked(db, id);
    const { row } = campaign(db, id);
    if (active.has(id)) throw new Error('Campaign is already running');
    if (row.owner_pid !== null) {
      if (row.owner_host !== hostname()) throw new Error('Campaign is owned by another host');
      if (row.owner_pid !== process.pid) {
        try { process.kill(row.owner_pid, 0); throw new Error('Campaign is owned by a live process'); }
        catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
      }
    }
    db.prepare('UPDATE phase1_campaigns SET owner_pid = ?, owner_host = ?, state = ? WHERE id = ?').run(process.pid, hostname(), 'running', id);
  }).immediate();
  active.add(id);
}

export function usage(db: Db, id: string) {
  const rows = db.prepare('SELECT tokens, completed FROM phase1_usage WHERE campaign_id = ?').all(id) as { tokens: number | null; completed: number }[];
  return { attempts: rows.length, reported_tokens: rows.reduce((n, r) => n + (r.tokens ?? 0), 0), unknown_usage: rows.filter(r => r.tokens === null).length, completed_attempts: rows.filter(r => r.completed).length, estimated_cost: null };
}

export async function runCampaign(db: Db, id: string, options: { allowLive?: boolean; resumeInterrupted?: boolean } = {}): Promise<void> {
  assertCampaignUnlocked(db, id);
  const initial = campaign(db, id);
  const mock = ['mock', 'mock_context_contract'].includes(initial.plan.input.base_config.model.provider);
  if (!mock && !options.allowLive) throw new Error('Live execution requires explicit --live / allow_live=true');
  claim(db, id);
  try {
    for (const entry of campaign(db, id).cases) {
      if (['completed', 'failed', 'cancelled', 'budget_skipped'].includes(entry.state)) continue;
      const c = initial.plan.cases.find(p => p.id === entry.case_id)!;
      let existing = entry.run_id ? getRun(db, entry.run_id) : null;
      if (existing && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(existing.status)) {
        db.prepare('UPDATE phase1_cases SET state = ? WHERE campaign_id = ? AND case_id = ?').run(existing.status.toLowerCase(), id, entry.case_id); continue;
      }
      if (existing && ['RUNNING', 'CREATED'].includes(existing.status)) {
        reconcileInterruptedRuns(db, undefined, [existing.run_id]);
        existing = getRun(db, existing.run_id);
      }
      if (existing?.status === 'INTERRUPTED' && (!options.resumeInterrupted || !c.config.recovery?.enabled)) {
        db.prepare('UPDATE phase1_cases SET state = ?, error = ? WHERE campaign_id = ? AND case_id = ?').run('interrupted', 'Explicit resume and recovery.enabled are required', id, entry.case_id); continue;
      }
      const counts = usage(db, id), limits = initial.plan.input.limits;
      if (counts.attempts >= limits.max_provider_calls || counts.reported_tokens >= limits.max_reported_tokens || counts.unknown_usage) {
        db.prepare('UPDATE phase1_cases SET state = ?, error = ? WHERE campaign_id = ? AND case_id = ?').run(existing ? 'interrupted' : 'budget_skipped', 'Campaign threshold reached or provider usage unavailable', id, entry.case_id); continue;
      }
      const built = buildProvider(c.config);
      let runner: WorkshopRunner;
      const provider = { name: built.provider.name, invoke: async (request: Parameters<typeof built.provider.invoke>[0]) => {
        const admitted = db.transaction(() => {
          const u = usage(db, id);
          if (u.attempts >= limits.max_provider_calls || u.reported_tokens >= limits.max_reported_tokens || u.unknown_usage) return false;
          db.prepare('INSERT INTO phase1_usage(invocation_id,campaign_id,run_id) VALUES(?,?,?)').run(request.invocationId, id, runner.id);
          return true;
        }).immediate();
        if (!admitted) return failureResult('campaign_budget', request, new Date().toISOString(), Date.now(), 'budget_exhausted', 'Campaign threshold reached or usage unavailable');
        const result = await built.provider.invoke(request);
        const tokens = result.usage.inputTokens === null || result.usage.outputTokens === null ? null : result.usage.inputTokens + result.usage.outputTokens;
        db.prepare('UPDATE phase1_usage SET tokens = ?, completed = 1 WHERE invocation_id = ?').run(tokens, request.invocationId);
        return result;
      } };
      db.transaction(() => {
        runner = new WorkshopRunner({ db, frozen: freezeConfig(c.config), ...(existing ? { resumeRunId: existing.run_id } : {}), provider, faults: built.faults, provenance: codeProvenance() });
        db.prepare('UPDATE phase1_cases SET run_id = ?, state = ?, error = NULL WHERE campaign_id = ? AND case_id = ?').run(runner.id, 'running', id, entry.case_id);
      })();
      try {
        const result = await runner!.execute();
        db.prepare('UPDATE phase1_cases SET state = ? WHERE campaign_id = ? AND case_id = ?').run(result.status.toLowerCase(), id, entry.case_id);
      } catch (e) {
        db.prepare('UPDATE phase1_cases SET state = ?, error = ? WHERE campaign_id = ? AND case_id = ?').run('failed', e instanceof Error ? e.message : String(e), id, entry.case_id);
      }
    }
  } finally {
    active.delete(id);
    const states = campaign(db, id).cases.map(c => c.state);
    const state = states.every(s => s === 'completed') ? 'completed' : states.some(s => ['pending', 'running', 'interrupted'].includes(s)) ? 'paused' : 'completed_with_failures';
    db.prepare('UPDATE phase1_campaigns SET state = ?, owner_pid = NULL, owner_host = NULL WHERE id = ?').run(state, id);
  }
}

export function linkEvidence(db: Db, id: string, runId: string, purpose: 'failure_attribution' | 'exact_rerun'): void {
  const c = campaign(db, id), run = getRun(db, runId);
  if (!run) throw new Error('Evidence run not found');
  if (c.cases.some(p => p.run_id === runId)) throw new Error('Evidence controls must be additional runs, not the case itself');
  if (purpose === 'exact_rerun' && !c.plan.cases.some(p => p.config_hash === run.config_hash)) throw new Error('Exact rerun must match a case config hash');
  if (purpose === 'failure_attribution') {
    const config = JSON.parse(run.config_json) as ExperimentConfig;
    if (!c.plan.cases.some(p => configHash({ ...config, fault_injection: null }) === configHash({ ...p.config, fault_injection: null }))) throw new Error('Fault evidence must match a campaign case except for its explicit fault plan');
  }
  if (purpose === 'failure_attribution' && !db.prepare("SELECT 1 FROM opportunities WHERE run_id = ? AND resolution = 'infrastructure_failure'").get(runId)) throw new Error('No infrastructure failure evidence in the named run');
  db.prepare('INSERT OR IGNORE INTO phase1_evidence VALUES (?, ?, ?)').run(id, runId, purpose);
}
